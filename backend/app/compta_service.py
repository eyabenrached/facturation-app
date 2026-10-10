"""Logique métier du module Comptabilité : validation des écritures, écritures
automatiques (factures, paiements, dépenses), rattrapage de l'historique et
agrégats du tableau de bord.

Principes :
- Une écriture est toujours équilibrée (total débit = total crédit) : la
  vérification est faite ici, quelle que soit l'origine de l'écriture.
- Une opération (facture, paiement, dépense) ne produit jamais deux écritures :
  clé source (source_type, source_id, source_evenement) + contrainte UNIQUE en base.
- Les hooks appelés depuis les routers existants passent par
  `executer_sans_casser` : une erreur comptable ne doit jamais empêcher de
  créer une facture ou une dépense.
"""
import logging
from calendar import monthrange
from datetime import date
from decimal import Decimal

from sqlalchemy import case, extract, func, select
from sqlalchemy.orm import Session

from . import models
from .compta_plan import (
    DEVISES, DOSSIERS_AUTO, DOSSIERS_MANUELS, LABELS_DOSSIER, ORIGINE_AUTO, ORIGINE_MANUELLE,
    COMPTE_BANQUE_DEVISES, COMPTE_REPORT_A_NOUVEAU, dossier_auto_de, dossier_comptable_auto,
    MODES_PAIEMENT, TRESORERIE_PAR_MODE,
    COMPTE_BANQUE, COMPTE_CAISSE, COMPTE_CLIENTS, COMPTE_FOURNISSEURS, COMPTE_PAR_CATEGORIE_DEPENSE,
    COMPTE_PRODUITS, COMPTE_TIMBRE, COMPTE_TRESORERIE_DEPENSES, COMPTE_TVA_COLLECTEE,
    COMPTE_TVA_DEDUCTIBLE, JOURNAUX, LABEL_CATEGORIE_DEPENSE, PLAN_PAR_DEFAUT,
)
from .database import SessionLocal
from .models_compta import CompteComptable, EcritureComptable, LigneEcriture, PaiementFacture

logger = logging.getLogger("comptabilite")

ZERO = Decimal("0.000")


class ComptaError(Exception):
    """Erreur de règle comptable (message destiné à l'utilisateur, en français)."""


def dec(valeur) -> Decimal:
    return Decimal(str(valeur if valeur is not None else 0)).quantize(Decimal("0.001"))


def fmt(montant: Decimal) -> str:
    return f"{montant:,.3f}".replace(",", " ")


# ---------------------------------------------------------------- plan comptable
def initialiser_plan_comptable() -> None:
    """Au démarrage : crée le plan par défaut si la table est vide, et vérifie
    que les comptes système existent toujours."""
    db = SessionLocal()
    try:
        vide = db.query(CompteComptable.id).first() is None
        existants = {n for (n,) in db.query(CompteComptable.numero).all()}
        for numero, libelle, systeme in PLAN_PAR_DEFAUT:
            if numero in existants:
                continue
            if vide or systeme:
                db.add(CompteComptable(numero=numero, libelle=libelle, classe=int(numero[0]), systeme=systeme))
        db.commit()
        # Règlements : factures déjà payées avant le module (idempotent, sans effet si rien à faire).
        try:
            migrer_paiements_legacy(db, avec_ecritures=False)
            db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
            logger.exception("Reprise des règlements historiques impossible (sera retentée par le rattrapage)")
        # Traçabilité (origine / dossier) des écritures existantes : idempotent.
        try:
            renseigner_tracabilite(db)
            db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
            logger.exception("Mise à jour de la traçabilité impossible")
        # Écritures d'émission des factures (411 / 706 / TVA / timbre) : idempotent.
        try:
            rattraper_emissions(db)
        except Exception:  # noqa: BLE001
            db.rollback()
            logger.exception("Génération des écritures de facture impossible (sera retentée par le rattrapage)")
    finally:
        db.close()


def _compte(db: Session, numero: str) -> CompteComptable:
    c = db.query(CompteComptable).filter(CompteComptable.numero == numero).first()
    if not c:
        raise ComptaError(f"Le compte {numero} est introuvable dans le plan comptable.")
    return c


# ------------------------------------------------------------ création d'écritures
def _normaliser_lignes(db: Session, lignes: list[dict]) -> list[dict]:
    if len(lignes) < 2:
        raise ComptaError("Une écriture comptable doit comporter au moins deux lignes.")
    resultat = []
    total_debit = total_credit = ZERO
    for i, l in enumerate(lignes, start=1):
        if l.get("compte_id"):
            compte = db.get(CompteComptable, l["compte_id"])
        elif l.get("compte_numero"):
            compte = _compte(db, l["compte_numero"])
        else:
            compte = None
        if compte is None:
            raise ComptaError(f"Ligne {i} : compte comptable manquant ou introuvable.")
        if not compte.actif:
            raise ComptaError(f"Ligne {i} : le compte {compte.numero} est désactivé.")
        debit, credit = dec(l.get("debit")), dec(l.get("credit"))
        if debit < 0 or credit < 0:
            raise ComptaError(f"Ligne {i} : les montants ne peuvent pas être négatifs.")
        if debit > 0 and credit > 0:
            raise ComptaError(f"Ligne {i} : une ligne ne peut pas avoir à la fois un débit et un crédit.")
        if debit == 0 and credit == 0:
            raise ComptaError(f"Ligne {i} : saisissez un montant au débit ou au crédit.")
        total_debit += debit
        total_credit += credit
        aux = (l.get("compte_auxiliaire") or "").strip() or None
        lib = (l.get("libelle") or "").strip() or None
        ligne = {"compte_id": compte.id, "compte_auxiliaire": aux, "libelle": lib, "debit": debit, "credit": credit}
        devise = (l.get("devise") or "TND").upper()
        if devise != "TND":
            md = l.get("montant_devise")
            taux = l.get("taux_change")
            if devise not in DEVISES:
                raise ComptaError(f"Ligne {i} : devise {devise} non gérée (EUR, USD ou GBP).")
            if md is None or dec(md) <= 0:
                raise ComptaError(f"Ligne {i} : le montant en {devise} est obligatoire.")
            if taux is None or Decimal(str(taux)) <= 0:
                raise ComptaError(f"Ligne {i} : le taux de change est obligatoire pour une opération en {devise}.")
            ligne.update(devise=devise, montant_devise=dec(md), taux_change=Decimal(str(taux)).quantize(Decimal("0.000001")))
        resultat.append(ligne)
    if total_debit != total_credit:
        raise ComptaError(
            f"Écriture déséquilibrée : total débit {fmt(total_debit)} ≠ total crédit {fmt(total_credit)} "
            f"(écart {fmt(abs(total_debit - total_credit))})."
        )
    return resultat


def prochain_numero_piece(db: Session, journal: str, annee: int) -> str:
    prefixe = f"{journal}-{annee}-"
    dernier = (
        db.query(func.max(EcritureComptable.numero_piece))
        .filter(EcritureComptable.numero_piece.like(f"{prefixe}%"), func.length(EcritureComptable.numero_piece) == len(prefixe) + 4)
        .scalar()
    )
    n = int(dernier[len(prefixe):]) + 1 if dernier and dernier[len(prefixe):].isdigit() else 1
    while db.query(EcritureComptable.id).filter(EcritureComptable.numero_piece == f"{prefixe}{n:04d}").first():
        n += 1
    return f"{prefixe}{n:04d}"


def creer_ecriture(
    db: Session, *, date_ecriture: date, libelle: str, lignes: list[dict], journal: str = "OD",
    type_operation: str = "manuelle", reference: str | None = None, numero_piece: str | None = None,
    source_type: str | None = None, source_id: int | None = None, source_evenement: str | None = None,
    utilisateur_id: int | None = None, origine: str | None = None, dossier: str | None = None,
    tiers: str | None = None, observation: str | None = None, regularise_id: int | None = None,
) -> EcritureComptable:
    libelle = (libelle or "").strip()
    if not libelle:
        raise ComptaError("Le libellé de l'écriture est obligatoire.")
    if journal not in JOURNAUX:
        raise ComptaError("Journal inconnu.")
    lignes_ok = _normaliser_lignes(db, lignes)
    # Traçabilité : toute écriture porte une source de génération (automatique) ou non (manuelle).
    origine = origine or (ORIGINE_AUTO if source_type else ORIGINE_MANUELLE)
    if origine == ORIGINE_AUTO and not dossier:
        dossier = dossier_comptable_auto(type_operation, journal)
    e = EcritureComptable(
        origine=origine, dossier=dossier,
        tiers=(tiers or "").strip()[:150] or None, observation=(observation or "").strip()[:500] or None,
        regularise_id=regularise_id,
        date=date_ecriture,
        numero_piece=(numero_piece or "").strip() or prochain_numero_piece(db, journal, date_ecriture.year),
        journal=journal,
        libelle=libelle[:255],
        reference=(reference or "").strip()[:100] or None,
        type_operation=type_operation,
        source_type=source_type,
        source_id=source_id,
        source_evenement=source_evenement,
        utilisateur_id=utilisateur_id,
    )
    for l in lignes_ok:
        e.lignes.append(LigneEcriture(**l))
    db.add(e)
    db.flush()
    return e


def remplacer_lignes(db: Session, e: EcritureComptable, lignes: list[dict]) -> None:
    lignes_ok = _normaliser_lignes(db, lignes)
    e.lignes.clear()
    db.flush()
    for l in lignes_ok:
        e.lignes.append(LigneEcriture(**l))
    db.flush()


# ------------------------------------------------------- écritures automatiques
def _existe(db: Session, st: str, sid: int, ev: str) -> EcritureComptable | None:
    return (
        db.query(EcritureComptable)
        .filter_by(source_type=st, source_id=sid, source_evenement=ev)
        .first()
    )


def supprimer_source(db: Session, source_type: str, source_id: int, evenement: str | None = None) -> int:
    """Supprime les écritures automatiques d'une opération (sauf clôturées)."""
    q = db.query(EcritureComptable).filter_by(source_type=source_type, source_id=source_id)
    if evenement:
        q = q.filter_by(source_evenement=evenement)
    n = 0
    for e in q.all():
        if e.cloturee:
            logger.warning("Écriture %s clôturée : conservée malgré la suppression de sa source.", e.numero_piece)
            continue
        db.delete(e)
        n += 1
    db.flush()
    return n


def _sync_facture_generique(
    db: Session, *, source_type: str, fid: int, numero: str, client_nom: str, date_emission: date,
    ttc, tva, timbre, type_emission: str,
) -> dict:
    """Garantit que l'écriture d'émission de la facture existe. Les règlements
    ont leurs propres écritures (voir ecrire_paiement)."""
    ttc, tva, timbre = dec(ttc), dec(tva), dec(timbre)
    cree = {"emission": 0}
    if ttc > 0 and not _existe(db, source_type, fid, "emission"):
        produit = ttc - tva - timbre  # garantit l'équilibre même en cas d'arrondi
        lignes = [{"compte_numero": COMPTE_CLIENTS, "debit": ttc, "compte_auxiliaire": client_nom, "libelle": f"Facture {numero}"}]
        lignes.append({"compte_numero": COMPTE_PRODUITS, "credit": produit, "libelle": f"Prestations {numero}"})
        if tva > 0:
            lignes.append({"compte_numero": COMPTE_TVA_COLLECTEE, "credit": tva, "libelle": f"TVA {numero}"})
        if timbre > 0:
            lignes.append({"compte_numero": COMPTE_TIMBRE, "credit": timbre, "libelle": f"Timbre fiscal {numero}"})
        creer_ecriture(
            db, date_ecriture=date_emission, libelle=f"Facture {numero} — {client_nom}", lignes=lignes,
            journal="VT", type_operation=type_emission, reference=numero, numero_piece=numero,
            source_type=source_type, source_id=fid, source_evenement="emission",
        )
        cree["emission"] = 1
    return cree


def sync_facture(db: Session, facture: models.Facture) -> dict:
    client_nom = facture.client.nom_societe if facture.client else f"Client #{facture.client_id}"
    return _sync_facture_generique(
        db, source_type="facture", fid=facture.id, numero=facture.numero_facture, client_nom=client_nom,
        date_emission=facture.date_fin, ttc=facture.montant_ttc, tva=facture.montant_tva, timbre=facture.timbre,
        type_emission="facture_client",
    )


def sync_facture_location(db: Session, facture: models.FactureLocation) -> dict:
    return _sync_facture_generique(
        db, source_type="facture_location", fid=facture.id, numero=facture.numero_facture, client_nom=facture.client,
        date_emission=facture.date_fin, ttc=facture.montant_ttc, tva=facture.montant_tva, timbre=0,
        type_emission="facture_location",
    )


# ------------------------------------------------------------ règlements clients
TYPE_FACTURE = {"facture": models.Facture, "location": models.FactureLocation}
SOURCE_FACTURE = {"facture": "facture", "location": "facture_location"}


def obtenir_facture(db: Session, type_facture: str, fid: int):
    modele = TYPE_FACTURE.get(type_facture)
    obj = db.get(modele, fid) if modele else None
    if not obj:
        raise ComptaError("Facture introuvable.")
    return obj


def nom_client(obj, type_facture: str) -> str:
    if type_facture == "facture":
        return obj.client.nom_societe if obj.client else f"Client #{obj.client_id}"
    return obj.client


def _colonne_fk(type_facture: str):
    return PaiementFacture.facture_id if type_facture == "facture" else PaiementFacture.facture_location_id


def paiements_de(db: Session, type_facture: str, fid: int) -> list[PaiementFacture]:
    return db.query(PaiementFacture).filter(_colonne_fk(type_facture) == fid).order_by(PaiementFacture.date, PaiementFacture.id).all()


def total_paye(db: Session, type_facture: str, fid: int) -> Decimal:
    v = db.query(func.coalesce(func.sum(PaiementFacture.montant), 0)).filter(_colonne_fk(type_facture) == fid).scalar()
    return dec(v)


def reste_a_payer(db: Session, type_facture: str, obj) -> Decimal:
    return dec(obj.montant_ttc) - total_paye(db, type_facture, obj.id)


def _type_de(p: PaiementFacture) -> tuple[str, int]:
    return ("facture", p.facture_id) if p.facture_id else ("location", p.facture_location_id)


def ecrire_paiement(db: Session, p: PaiementFacture) -> bool:
    """Écriture du règlement : D trésorerie (banque ou caisse selon le mode) / C 411000."""
    if _existe(db, "paiement_facture", p.id, "reglement"):
        return False
    tf, fid = _type_de(p)
    obj = obtenir_facture(db, tf, fid)
    client = nom_client(obj, tf)
    compte_treso, journal = TRESORERIE_PAR_MODE.get(p.mode, (COMPTE_BANQUE, "BQ"))
    total_avant = total_paye(db, tf, fid) - dec(p.montant)
    partiel = (total_avant + dec(p.montant)) < dec(obj.montant_ttc)
    libelle = f"Règlement {'partiel ' if partiel else ''}facture {obj.numero_facture} — {client}"
    creer_ecriture(
        db, date_ecriture=p.date, libelle=libelle, journal=journal,
        lignes=[
            {"compte_numero": compte_treso, "debit": dec(p.montant), "libelle": f"Règlement {obj.numero_facture}"},
            {"compte_numero": COMPTE_CLIENTS, "credit": dec(p.montant), "compte_auxiliaire": client, "libelle": f"Règlement {obj.numero_facture}"},
        ],
        type_operation="paiement_client" if tf == "facture" else "paiement_location",
        reference=obj.numero_facture, source_type="paiement_facture", source_id=p.id, source_evenement="reglement",
        utilisateur_id=p.utilisateur_id,
    )
    return True


def recalculer_statut(db: Session, type_facture: str, obj) -> None:
    """Statut et date de paiement déduits des règlements enregistrés."""
    paye, ttc = total_paye(db, type_facture, obj.id), dec(obj.montant_ttc)
    if paye > 0 and paye >= ttc:
        obj.statut = models.StatutFacture.payee
        obj.date_paiement = max(p.date for p in paiements_de(db, type_facture, obj.id))
    elif paye > 0:
        obj.statut = models.StatutFacture.partielle
        obj.date_paiement = None
    else:
        obj.statut = models.StatutFacture.impayee
        obj.date_paiement = None
    db.flush()


def ajouter_paiement(
    db: Session, type_facture: str, fid: int, *, montant, date_paiement: date, mode: str = "virement",
    reference: str | None = None, note: str | None = None, utilisateur_id: int | None = None,
) -> PaiementFacture:
    obj = obtenir_facture(db, type_facture, fid)
    montant = dec(montant)
    if montant <= 0:
        raise ComptaError("Le montant du règlement doit être supérieur à 0.")
    if mode not in MODES_PAIEMENT:
        raise ComptaError("Mode de règlement inconnu.")
    reste = reste_a_payer(db, type_facture, obj)
    if reste <= 0:
        raise ComptaError("Cette facture est déjà entièrement réglée.")
    if montant > reste:
        raise ComptaError(f"Le montant ({fmt(montant)}) dépasse le reste à payer ({fmt(reste)}).")
    p = PaiementFacture(
        facture_id=fid if type_facture == "facture" else None,
        facture_location_id=fid if type_facture == "location" else None,
        montant=montant, date=date_paiement, mode=mode,
        reference=(reference or "").strip()[:100] or None, note=(note or "").strip()[:255] or None,
        utilisateur_id=utilisateur_id,
    )
    db.add(p)
    db.flush()
    ecrire_paiement(db, p)
    recalculer_statut(db, type_facture, obj)
    return p


def supprimer_paiement(db: Session, pid: int) -> None:
    p = db.get(PaiementFacture, pid)
    if not p:
        raise ComptaError("Règlement introuvable.")
    e = _existe(db, "paiement_facture", p.id, "reglement")
    if e and e.cloturee:
        raise ComptaError("Ce règlement appartient à une période clôturée : il ne peut plus être supprimé.")
    tf, fid = _type_de(p)
    obj = obtenir_facture(db, tf, fid)
    if e:
        db.delete(e)
    db.delete(p)
    db.flush()
    recalculer_statut(db, tf, obj)


def appliquer_statut_legacy(db: Session, type_facture: str, obj, statut, date_paiement: date | None) -> dict:
    """Branche les boutons « Marquer payée / impayée » existants sur les règlements :
    - payée : crée un règlement pour le reste à payer ;
    - impayée : supprime tous les règlements de la facture."""
    valeur = statut.value if hasattr(statut, "value") else str(statut)
    if valeur == "payee":
        reste = reste_a_payer(db, type_facture, obj)
        if reste > 0:
            ajouter_paiement(db, type_facture, obj.id, montant=reste, date_paiement=date_paiement or date.today(),
                             note="Facture marquée payée")
        else:
            recalculer_statut(db, type_facture, obj)
    elif valeur == "impayee":
        for p in paiements_de(db, type_facture, obj.id):
            e = _existe(db, "paiement_facture", p.id, "reglement")
            if e and not e.cloturee:
                db.delete(e)
            db.delete(p)
        db.flush()
        supprimer_source(db, SOURCE_FACTURE[type_facture], obj.id, "paiement")  # ancien format (phase 1)
        recalculer_statut(db, type_facture, obj)
    else:  # partielle : sans règlement saisi on garde le statut demandé (montant inconnu)
        if paiements_de(db, type_facture, obj.id):
            recalculer_statut(db, type_facture, obj)
    return {}


def supprimer_facture_compta(db: Session, type_facture: str, fid: int) -> None:
    """À appeler avant la suppression d'une facture : retire ses écritures et celles de ses règlements."""
    for p in paiements_de(db, type_facture, fid):
        supprimer_source(db, "paiement_facture", p.id)
    supprimer_source(db, SOURCE_FACTURE[type_facture], fid)


def migrer_paiements_legacy(db: Session, avec_ecritures: bool = True) -> int:
    """Factures déjà « payées » mais sans règlement enregistré (données d'avant le module
    ou écritures de la phase 1) : crée un règlement du montant TTC et rattache l'écriture existante.
    Idempotent."""
    n = 0
    for tf, modele in TYPE_FACTURE.items():
        col = _colonne_fk(tf)
        deja = select(col).where(col.is_not(None))
        for obj in db.query(modele).filter(modele.statut == models.StatutFacture.payee, modele.montant_ttc > 0, ~modele.id.in_(deja)).all():
            p = PaiementFacture(
                facture_id=obj.id if tf == "facture" else None, facture_location_id=obj.id if tf == "location" else None,
                montant=dec(obj.montant_ttc), date=obj.date_paiement or obj.date_fin, mode="virement", note="Reprise de l'historique",
            )
            db.add(p)
            db.flush()
            ancienne = _existe(db, SOURCE_FACTURE[tf], obj.id, "paiement")
            if ancienne:  # écriture de la phase 1 : on la rattache au règlement
                ancienne.source_type, ancienne.source_id, ancienne.source_evenement = "paiement_facture", p.id, "reglement"
                db.flush()
            elif avec_ecritures:
                ecrire_paiement(db, p)
            n += 1
    return n


def completer_ecritures_paiements(db: Session) -> int:
    n = 0
    deja = select(EcritureComptable.source_id).where(
        EcritureComptable.source_type == "paiement_facture", EcritureComptable.source_evenement == "reglement")
    for p in db.query(PaiementFacture).filter(~PaiementFacture.id.in_(deja)).all():
        n += 1 if ecrire_paiement(db, p) else 0
    return n


def sync_depense(db: Session, d: models.Depense) -> dict:
    """Une écriture par dépense : recréée à chaque modification de la dépense."""
    anciennes = _existe(db, "depense", d.id, "charge")
    if anciennes and anciennes.cloturee:
        return {"depense": 0}
    if anciennes:
        db.delete(anciennes)
        db.flush()
    montant = dec(d.montant)
    if montant <= 0:
        return {"depense": 0}
    cat = d.categorie.value if hasattr(d.categorie, "value") else str(d.categorie)
    label = LABEL_CATEGORIE_DEPENSE.get(cat, "Dépense")
    detail = f"{label} — {d.description.strip()}" if d.description and d.description.strip() else label
    creer_ecriture(
        db, date_ecriture=d.date, libelle=detail,
        lignes=[
            {"compte_numero": COMPTE_PAR_CATEGORIE_DEPENSE.get(cat, "628000"), "debit": montant, "libelle": detail},
            {"compte_numero": COMPTE_TRESORERIE_DEPENSES, "credit": montant, "libelle": detail},
        ],
        journal="AC", type_operation="depense", reference=f"DEP-{d.id}", numero_piece=f"DEP-{d.id:05d}",
        source_type="depense", source_id=d.id, source_evenement="charge",
    )
    return {"depense": 1}


def executer_sans_casser(db: Session, fonction, *args, **kwargs):
    """Exécute un hook comptable dans un SAVEPOINT : en cas d'erreur, seule
    l'écriture comptable est annulée ; la facture / dépense en cours de
    traitement n'est pas affectée. L'erreur est journalisée."""
    try:
        with db.begin_nested():
            return fonction(db, *args, **kwargs)
    except Exception:  # noqa: BLE001
        logger.exception("Écriture comptable automatique impossible (%s)", getattr(fonction, "__name__", fonction))
        return None


# ------------------------------------------------------------- historique
def diagnostic(db: Session) -> dict:
    """Nombre d'opérations existantes sans écriture comptable correspondante."""
    def ids(st: str, ev: str):
        return select(EcritureComptable.source_id).where(
            EcritureComptable.source_type == st, EcritureComptable.source_evenement == ev
        )

    F, FL, D = models.Facture, models.FactureLocation, models.Depense
    P = PaiementFacture
    payee = models.StatutFacture.payee
    pf = select(P.facture_id).where(P.facture_id.is_not(None))
    pl = select(P.facture_location_id).where(P.facture_location_id.is_not(None))
    reglements_sans_ecriture = db.query(P.id).filter(~P.id.in_(ids("paiement_facture", "reglement")))
    res = {
        "factures_sans_ecriture": db.query(F.id).filter(F.montant_ttc > 0, ~F.id.in_(ids("facture", "emission"))).count(),
        "paiements_sans_ecriture": db.query(F.id).filter(F.statut == payee, F.montant_ttc > 0, ~F.id.in_(pf)).count()
        + reglements_sans_ecriture.filter(P.facture_id.is_not(None)).count(),
        "locations_sans_ecriture": db.query(FL.id).filter(FL.montant_ttc > 0, ~FL.id.in_(ids("facture_location", "emission"))).count(),
        "paiements_location_sans_ecriture": db.query(FL.id).filter(FL.statut == payee, FL.montant_ttc > 0, ~FL.id.in_(pl)).count()
        + reglements_sans_ecriture.filter(P.facture_location_id.is_not(None)).count(),
        "depenses_sans_ecriture": db.query(D.id).filter(D.montant > 0, ~D.id.in_(ids("depense", "charge"))).count(),
    }
    res["total"] = sum(res.values())
    return res


def rattrapage(db: Session) -> dict:
    """Génère les écritures manquantes pour tout l'historique. Idempotent :
    peut être relancé sans créer de doublons. Traite par lots pour limiter la
    mémoire (le serveur de production est contraint)."""
    total = {"factures": 0, "paiements": 0, "locations": 0, "paiements_location": 0, "depenses": 0, "erreurs": 0}
    LOT = 200

    def traiter(modele, sync, cles):
        ids = [i for (i,) in db.query(modele.id).order_by(modele.id).all()]
        for debut in range(0, len(ids), LOT):
            for obj in db.query(modele).filter(modele.id.in_(ids[debut:debut + LOT])).all():
                r = executer_sans_casser(db, sync, obj)
                if r is None:
                    total["erreurs"] += 1
                    continue
                for cle_res, cle_tot in cles.items():
                    total[cle_tot] += r.get(cle_res, 0)
            db.commit()
            db.expire_all()

    traiter(models.Facture, sync_facture, {"emission": "factures"})
    traiter(models.FactureLocation, sync_facture_location, {"emission": "locations"})
    try:
        with db.begin_nested():
            total["paiements"] = migrer_paiements_legacy(db) + completer_ecritures_paiements(db)
        db.commit()
    except Exception:  # noqa: BLE001
        logger.exception("Rattrapage des règlements impossible")
        total["erreurs"] += 1
    traiter(models.Depense, sync_depense_si_absente, {"depense": "depenses"})
    return total


def rattraper_emissions(db: Session) -> int:
    """Crée les écritures de vente (journal VT) manquantes des factures et factures de location.
    Idempotent : une facture qui a déjà son écriture est ignorée."""
    n = 0
    for modele, sync in ((models.Facture, sync_facture), (models.FactureLocation, sync_facture_location)):
        ids = [i for (i,) in db.query(modele.id).order_by(modele.id).all()]
        for obj in db.query(modele).filter(modele.id.in_(ids)).all() if ids else []:
            r = executer_sans_casser(db, sync, obj)
            n += (r or {}).get("emission", 0)
        db.commit()
    return n


def sync_depense_si_absente(db: Session, d: models.Depense) -> dict:
    """Variante pour le rattrapage : ne touche pas une dépense déjà comptabilisée."""
    if _existe(db, "depense", d.id, "charge"):
        return {"depense": 0}
    return sync_depense(db, d)


# --------------------------------------------------------------- tableau de bord
def _sommes(db: Session, *conditions, du: date | None = None, au: date | None = None) -> tuple[Decimal, Decimal]:
    q = (
        db.query(func.coalesce(func.sum(LigneEcriture.debit), 0), func.coalesce(func.sum(LigneEcriture.credit), 0))
        .join(EcritureComptable, EcritureComptable.id == LigneEcriture.ecriture_id)
        .join(CompteComptable, CompteComptable.id == LigneEcriture.compte_id)
    )
    for c in conditions:
        q = q.filter(c)
    if du:
        q = q.filter(EcritureComptable.date >= du)
    if au:
        q = q.filter(EcritureComptable.date <= au)
    d, c = q.one()
    return dec(d), dec(c)


def _solde_debiteur(db, numero, au, du=None):
    d, c = _sommes(db, CompteComptable.numero == numero, du=du, au=au)
    return d - c


def _solde_crediteur(db, numero, au, du=None):
    d, c = _sommes(db, CompteComptable.numero == numero, du=du, au=au)
    return c - d


def tableau_de_bord(db: Session, du: date, au: date) -> dict:
    # --- Soldes de trésorerie et tiers : cumul depuis l'origine jusqu'à `au`.
    solde_banque = _solde_debiteur(db, COMPTE_BANQUE, au)
    solde_caisse = _solde_debiteur(db, COMPTE_CAISSE, au)
    creances = _solde_debiteur(db, COMPTE_CLIENTS, au)
    dettes = _solde_crediteur(db, COMPTE_FOURNISSEURS, au)

    # --- Flux sur la période.
    d7, c7 = _sommes(db, CompteComptable.classe == 7, du=du, au=au)
    d6, c6 = _sommes(db, CompteComptable.classe == 6, du=du, au=au)
    d70, c70 = _sommes(db, CompteComptable.numero.like("70%"), du=du, au=au)
    recettes, depenses, ca = c7 - d7, d6 - c6, c70 - d70

    debut_mois = date(au.year, au.month, 1)
    fin_mois = date(au.year, au.month, monthrange(au.year, au.month)[1])
    m_d7, m_c7 = _sommes(db, CompteComptable.classe == 7, du=debut_mois, au=fin_mois)
    m_d6, m_c6 = _sommes(db, CompteComptable.classe == 6, du=debut_mois, au=fin_mois)

    tva_collectee = _solde_crediteur(db, COMPTE_TVA_COLLECTEE, au, du)
    tva_deductible = _solde_debiteur(db, COMPTE_TVA_DEDUCTIBLE, au, du)

    # --- Paiements en attente : factures non soldées (source : factures).
    nb_f, mt_f = db.query(func.count(models.Facture.id), func.coalesce(func.sum(models.Facture.montant_ttc), 0)).filter(
        models.Facture.statut != models.StatutFacture.payee).one()
    nb_l, mt_l = db.query(func.count(models.FactureLocation.id), func.coalesce(func.sum(models.FactureLocation.montant_ttc), 0)).filter(
        models.FactureLocation.statut != models.StatutFacture.payee).one()

    # --- Séries mensuelles (année civile de `au`, ou plage complète si multi-années).
    debut_serie = date(du.year, 1, 1) if du.year == au.year else date(du.year, du.month, 1)
    fin_serie = date(au.year, 12, 31) if du.year == au.year else fin_mois
    y, m = extract("year", EcritureComptable.date), extract("month", EcritureComptable.date)

    def par_mois(*conditions):
        q = (
            db.query(y, m, func.coalesce(func.sum(LigneEcriture.debit), 0), func.coalesce(func.sum(LigneEcriture.credit), 0))
            .select_from(LigneEcriture)
            .join(EcritureComptable, EcritureComptable.id == LigneEcriture.ecriture_id)
            .join(CompteComptable, CompteComptable.id == LigneEcriture.compte_id)
            .filter(EcritureComptable.date >= debut_serie, EcritureComptable.date <= fin_serie)
        )
        for c in conditions:
            q = q.filter(c)
        return {(int(a), int(b)): (dec(d), dec(c)) for a, b, d, c in q.group_by(y, m).all()}

    s7, s6, s70 = par_mois(CompteComptable.classe == 7), par_mois(CompteComptable.classe == 6), par_mois(CompteComptable.numero.like("70%"))
    serie, (ay, am) = [], (debut_serie.year, debut_serie.month)
    while (ay, am) <= (fin_serie.year, fin_serie.month) and len(serie) < 60:
        r = s7.get((ay, am), (ZERO, ZERO)); c = s6.get((ay, am), (ZERO, ZERO)); k = s70.get((ay, am), (ZERO, ZERO))
        rec, dep = r[1] - r[0], c[0] - c[1]
        serie.append({"mois": f"{ay}-{am:02d}", "recettes": float(rec), "depenses": float(dep), "resultat": float(rec - dep), "ca": float(k[1] - k[0])})
        ay, am = (ay + 1, 1) if am == 12 else (ay, am + 1)

    # --- Répartition des charges de la période.
    lignes = (
        db.query(CompteComptable.numero, CompteComptable.libelle,
                 func.coalesce(func.sum(LigneEcriture.debit), 0) - func.coalesce(func.sum(LigneEcriture.credit), 0))
        .select_from(LigneEcriture)
        .join(EcritureComptable, EcritureComptable.id == LigneEcriture.ecriture_id)
        .join(CompteComptable, CompteComptable.id == LigneEcriture.compte_id)
        .filter(CompteComptable.classe == 6, EcritureComptable.date >= du, EcritureComptable.date <= au)
        .group_by(CompteComptable.numero, CompteComptable.libelle)
        .all()
    )
    repartition = sorted(
        [{"numero": n, "libelle": lib, "total": float(dec(t))} for n, lib, t in lignes if dec(t) > 0],
        key=lambda x: x["total"], reverse=True,
    )

    return {
        "date_du": du.isoformat(), "date_au": au.isoformat(),
        "solde_banque": float(solde_banque), "solde_caisse": float(solde_caisse),
        "total_recettes": float(recettes), "total_depenses": float(depenses), "chiffre_affaires": float(ca),
        "resultat_periode": float(recettes - depenses),
        "creances_clients": float(creances), "dettes_fournisseurs": float(dettes),
        "resultat_mois": float((m_c7 - m_d7) - (m_d6 - m_c6)),
        "tva_collectee": float(tva_collectee), "tva_deductible": float(tva_deductible),
        "tva_a_payer": float(tva_collectee - tva_deductible),
        "paiements_en_attente": {"nombre": int(nb_f) + int(nb_l), "montant": float(dec(mt_f) + dec(mt_l))},
        "serie_mensuelle": serie,
        "repartition_charges": repartition,
        "diagnostic": diagnostic(db),
    }


# =====================================================================
# ORGANISATION EN DOSSIERS : comptabilité manuelle, traçabilité, clôture
# =====================================================================
def renseigner_tracabilite(db: Session) -> int:
    """Au démarrage : range les écritures créées avant l'organisation en dossiers
    (origine « automatique » + dossier comptable). Idempotent."""
    n = 0
    anciennes = db.query(EcritureComptable).filter(
        EcritureComptable.source_type.is_not(None),
        (EcritureComptable.origine != ORIGINE_AUTO) | (EcritureComptable.dossier.is_(None)),
    ).all()
    for e in anciennes:
        e.origine = ORIGINE_AUTO
        if not e.dossier:
            e.dossier = dossier_comptable_auto(e.type_operation, e.journal)
        n += 1
    sans_dossier = db.query(EcritureComptable).filter(
        EcritureComptable.source_type.is_(None), EcritureComptable.dossier.is_(None)
    ).all()
    for e in sans_dossier:  # écritures manuelles d'avant : dossier déduit des comptes mouvementés
        numeros = {l.compte.numero for l in e.lignes}
        if COMPTE_BANQUE_DEVISES in numeros:
            e.dossier = "banque2"
        elif COMPTE_BANQUE in numeros:
            e.dossier = "banque1"
        elif COMPTE_CAISSE in numeros:
            e.dossier = "caisse"
        elif COMPTE_FOURNISSEURS in numeros:
            e.dossier = "fournisseur"
        else:
            e.dossier = "client"
        n += 1
    db.flush()
    return n


def date_cloture(db: Session) -> date | None:
    """Date jusqu'à laquelle la comptabilité est clôturée (plus grande date d'écriture clôturée)."""
    return db.query(func.max(EcritureComptable.date)).filter(EcritureComptable.cloturee.is_(True)).scalar()


def verifier_periode_ouverte(db: Session, d: date) -> None:
    limite = date_cloture(db)
    if limite and d <= limite:
        raise ComptaError(
            f"La période est clôturée jusqu'au {limite.strftime('%d/%m/%Y')} : "
            "aucune écriture ne peut être saisie à une date antérieure ou égale."
        )


def cloturer(db: Session, jusqu_au: date) -> int:
    if jusqu_au > date.today():
        raise ComptaError("On ne peut pas clôturer une période qui n'est pas encore terminée.")
    n = 0
    for e in db.query(EcritureComptable).filter(EcritureComptable.date <= jusqu_au, EcritureComptable.cloturee.is_(False)).all():
        e.cloturee = True
        n += 1
    db.flush()
    return n


def _config_dossier(dossier: str) -> dict:
    cfg = DOSSIERS_MANUELS.get(dossier)
    if not cfg:
        raise ComptaError("Dossier inconnu : choisissez Clients, Fournisseurs, Banque 1, Banque 2 ou Caisse.")
    return cfg


def _doublon_manuel(db: Session, dossier: str, d: date, libelle: str, reference: str | None, total: Decimal, ignorer_id: int | None = None) -> bool:
    """Doublon = même dossier, même date, même référence (renseignée), même libellé et même montant."""
    ref = (reference or "").strip()
    if not ref:
        return False
    for e in db.query(EcritureComptable).filter(
        EcritureComptable.origine == ORIGINE_MANUELLE, EcritureComptable.dossier == dossier,
        EcritureComptable.date == d, EcritureComptable.reference == ref,
        EcritureComptable.libelle == libelle.strip()[:255], EcritureComptable.id != ignorer_id,
    ).all():
        if sum((l.debit for l in e.lignes), ZERO) == total:
            return True
    return False


def controler_dossier(e: EcritureComptable, dossier: str, type_operation: str = "manuelle") -> None:
    """Cohérence d'une écriture avec son dossier (comptes obligatoires, devises)."""
    cfg = _config_dossier(dossier)
    numeros = {l.compte.numero for l in e.lignes}
    if cfg["tresorerie"] and cfg["tresorerie"] not in numeros:
        raise ComptaError(f"Dossier {cfg['label']} : l'écriture doit mouvementer le compte {cfg['tresorerie']}.")
    if cfg["tiers_compte"] and cfg["tiers_compte"] not in numeros and type_operation != "regularisation":
        raise ComptaError(f"Dossier {cfg['label']} : l'écriture doit mouvementer le compte {cfg['tiers_compte']}.")
    if dossier == "banque2":
        if any(l.compte.numero == COMPTE_BANQUE_DEVISES and l.devise == "TND" for l in e.lignes):
            raise ComptaError("Banque 2 - Devises : indiquez la devise, le montant en devise et le taux de change.")
    elif any(l.devise != "TND" for l in e.lignes):
        raise ComptaError("Les opérations en devises se saisissent uniquement dans le dossier Banque 2 - Devises.")


def creer_ecriture_manuelle(
    db: Session, *, dossier: str, date_ecriture: date, libelle: str, lignes: list[dict],
    reference: str | None = None, tiers: str | None = None, observation: str | None = None,
    journal: str | None = None, numero_piece: str | None = None, utilisateur_id: int | None = None,
    type_operation: str = "manuelle", regularise_id: int | None = None,
) -> EcritureComptable:
    """Saisie du comptable dans un des 5 dossiers de la comptabilité manuelle.
    Vérifie l'équilibre, la période ouverte, les doublons et la cohérence avec le dossier."""
    cfg = _config_dossier(dossier)
    verifier_periode_ouverte(db, date_ecriture)
    tiers = (tiers or "").strip() or None
    if cfg["tiers_compte"] and not tiers:
        raise ComptaError(f"Dossier {cfg['label']} : indiquez le {'client' if dossier == 'client' else 'fournisseur'} concerné.")
    e = creer_ecriture(
        db, date_ecriture=date_ecriture, libelle=libelle, lignes=lignes, journal=journal or cfg["journal"],
        type_operation=type_operation, reference=reference, numero_piece=numero_piece, utilisateur_id=utilisateur_id,
        origine=ORIGINE_MANUELLE, dossier=dossier, tiers=tiers, observation=observation, regularise_id=regularise_id,
    )
    controler_dossier(e, dossier, type_operation)
    total = sum((l.debit for l in e.lignes), ZERO)
    if _doublon_manuel(db, dossier, date_ecriture, e.libelle, e.reference, total, ignorer_id=e.id):
        raise ComptaError("Doublon : une écriture identique (dossier, date, référence, libellé, montant) existe déjà.")
    return e


def saisie_tresorerie(
    db: Session, *, dossier: str, sens: str, date_ecriture: date, montant, contrepartie_id: int, libelle: str,
    devise: str = "TND", taux=None, reference: str | None = None, tiers: str | None = None,
    observation: str | None = None, utilisateur_id: int | None = None,
) -> EcritureComptable:
    """Saisie simplifiée d'un mouvement de banque ou de caisse (entrée / sortie) :
    génère les deux lignes équilibrées. Pour Banque 2, le montant est en devise et
    converti en TND avec le taux pour que l'écriture reste équilibrée."""
    cfg = _config_dossier(dossier)
    if not cfg["tresorerie"]:
        raise ComptaError("La saisie de mouvement concerne uniquement la banque et la caisse.")
    if sens not in ("entree", "sortie"):
        raise ComptaError("Choisissez entrée ou sortie.")
    montant = dec(montant)
    if montant <= 0:
        raise ComptaError("Le montant doit être supérieur à 0.")
    contre = db.get(CompteComptable, contrepartie_id)
    if not contre or not contre.actif:
        raise ComptaError("Compte de contrepartie introuvable ou désactivé.")
    if contre.numero == cfg["tresorerie"]:
        raise ComptaError("Le compte de contrepartie doit être différent du compte de trésorerie.")
    devise = (devise or "TND").upper()
    ligne_treso: dict = {"compte_numero": cfg["tresorerie"], "libelle": libelle}
    if dossier == "banque2":
        if devise not in DEVISES:
            raise ComptaError("Choisissez la devise : EUR, USD ou GBP.")
        if taux is None or Decimal(str(taux)) <= 0:
            raise ComptaError("Le taux de change est obligatoire (valeur d'une unité de devise en TND).")
        montant_tnd = (montant * Decimal(str(taux))).quantize(Decimal("0.001"))
        if montant_tnd <= 0:
            raise ComptaError("Le montant converti en TND est nul : vérifiez le montant et le taux.")
        ligne_treso.update(devise=devise, montant_devise=montant, taux_change=taux)
    else:
        if devise != "TND":
            raise ComptaError("Ce dossier fonctionne uniquement en TND.")
        montant_tnd = montant
    ligne_contre: dict = {"compte_id": contre.id, "libelle": libelle, "compte_auxiliaire": (tiers or "").strip() or None}
    if sens == "entree":
        ligne_treso["debit"], ligne_contre["credit"] = montant_tnd, montant_tnd
    else:
        ligne_treso["credit"], ligne_contre["debit"] = montant_tnd, montant_tnd
    return creer_ecriture_manuelle(
        db, dossier=dossier, date_ecriture=date_ecriture, libelle=libelle, lignes=[ligne_treso, ligne_contre],
        reference=reference, tiers=tiers, observation=observation, utilisateur_id=utilisateur_id,
    )


def definir_solde_initial(
    db: Session, *, dossier: str, montant, date_ecriture: date, devise: str = "TND", taux=None,
    utilisateur_id: int | None = None,
) -> EcritureComptable | None:
    """Solde d'ouverture d'un compte de trésorerie : une seule écriture par dossier (et par devise),
    contrepassée sur 110000 Report à nouveau. Remplacée à chaque nouvelle saisie."""
    cfg = _config_dossier(dossier)
    if not cfg["tresorerie"]:
        raise ComptaError("Le solde initial concerne uniquement la banque et la caisse.")
    verifier_periode_ouverte(db, date_ecriture)
    devise = (devise or "TND").upper()
    montant = dec(montant)
    if dossier == "banque2":
        if devise not in DEVISES:
            raise ComptaError("Choisissez la devise : EUR, USD ou GBP.")
    elif devise != "TND":
        raise ComptaError("Ce dossier fonctionne uniquement en TND.")
    for e in db.query(EcritureComptable).filter(
        EcritureComptable.type_operation == "solde_initial", EcritureComptable.dossier == dossier
    ).all():
        if any(l.devise == devise and l.compte.numero == cfg["tresorerie"] for l in e.lignes):
            if e.cloturee:
                raise ComptaError("Le solde initial appartient à une période clôturée : il ne peut plus être modifié.")
            db.delete(e)
    db.flush()
    if montant == 0:
        return None
    absolu = abs(montant)
    ligne_treso: dict = {"compte_numero": cfg["tresorerie"], "libelle": "Solde initial"}
    if dossier == "banque2":
        if taux is None or Decimal(str(taux)) <= 0:
            raise ComptaError("Le taux de change est obligatoire pour enregistrer un solde initial en devise.")
        tnd = (absolu * Decimal(str(taux))).quantize(Decimal("0.001"))
        ligne_treso.update(devise=devise, montant_devise=absolu, taux_change=taux)
    else:
        tnd = absolu
    contre = {"compte_numero": COMPTE_REPORT_A_NOUVEAU, "libelle": "Solde initial"}
    if montant > 0:
        ligne_treso["debit"], contre["credit"] = tnd, tnd
    else:
        ligne_treso["credit"], contre["debit"] = tnd, tnd
    suffixe = f" {devise}" if dossier == "banque2" else ""
    return creer_ecriture(
        db, date_ecriture=date_ecriture, libelle=f"Solde initial — {cfg['label']}{suffixe}", lignes=[ligne_treso, contre],
        journal=cfg["journal"], type_operation="solde_initial", reference="SOLDE-INITIAL",
        origine=ORIGINE_MANUELLE, dossier=dossier, utilisateur_id=utilisateur_id,
    )


def regulariser(db: Session, ecriture_id: int, *, date_ecriture: date | None = None, motif: str | None = None,
                utilisateur_id: int | None = None) -> EcritureComptable:
    """Correction d'une écriture (surtout automatique) : écriture de régularisation inverse,
    manuelle et rattachée à l'originale. L'écriture d'origine n'est jamais modifiée."""
    e = db.get(EcritureComptable, ecriture_id)
    if not e:
        raise ComptaError("Écriture introuvable.")
    if e.type_operation == "regularisation":
        raise ComptaError("Une écriture de régularisation ne peut pas être régularisée : saisissez une nouvelle écriture.")
    deja = db.query(EcritureComptable).filter(EcritureComptable.regularise_id == e.id).first()
    if deja:
        raise ComptaError(f"Cette écriture est déjà régularisée par {deja.numero_piece}.")
    d = date_ecriture or date.today()
    verifier_periode_ouverte(db, d)
    inverse = [
        {"compte_id": l.compte_id, "compte_auxiliaire": l.compte_auxiliaire, "libelle": f"Régularisation {l.libelle or ''}".strip(),
         "debit": l.credit, "credit": l.debit, "devise": l.devise, "montant_devise": l.montant_devise, "taux_change": l.taux_change}
        for l in e.lignes
    ]
    detail = (motif or "").strip() or e.libelle
    return creer_ecriture(
        db, date_ecriture=d, libelle=f"Régularisation de {e.numero_piece} — {detail}", lignes=inverse,
        journal="OD", type_operation="regularisation", reference=e.reference or e.numero_piece,
        origine=ORIGINE_MANUELLE, dossier=e.dossier or "client", tiers=e.tiers, regularise_id=e.id,
        observation=f"Régularisation de l'écriture {e.numero_piece}", utilisateur_id=utilisateur_id,
    )


# ------------------------------------------------------------- soldes et résumés
def _flux_tresorerie(db: Session, numero_compte: str):
    init = case((EcritureComptable.type_operation == "solde_initial", 1), else_=0)
    md = func.coalesce(LigneEcriture.montant_devise, 0)
    return (
        db.query(
            LigneEcriture.devise, init, EcritureComptable.origine,
            func.coalesce(func.sum(LigneEcriture.debit), 0), func.coalesce(func.sum(LigneEcriture.credit), 0),
            func.coalesce(func.sum(case((LigneEcriture.debit > 0, md), else_=0)), 0),
            func.coalesce(func.sum(case((LigneEcriture.credit > 0, md), else_=0)), 0),
        )
        .select_from(LigneEcriture)
        .join(EcritureComptable, EcritureComptable.id == LigneEcriture.ecriture_id)
        .join(CompteComptable, CompteComptable.id == LigneEcriture.compte_id)
        .filter(CompteComptable.numero == numero_compte)
        .group_by(LigneEcriture.devise, init, EcritureComptable.origine)
        .all()
    )


def resume_tresorerie(db: Session, dossier: str) -> dict:
    """Solde initial, entrées, sorties et solde actuel d'un dossier de trésorerie.
    Une ligne par devise : les devises ne sont JAMAIS additionnées entre elles."""
    cfg = _config_dossier(dossier)
    if not cfg["tresorerie"]:
        raise ComptaError("Ce dossier n'est pas un compte de trésorerie.")
    devises: dict[str, dict] = {}

    def entree(dv: str) -> dict:
        return devises.setdefault(dv, {
            "devise": dv, "solde_initial": ZERO, "entrees": ZERO, "sorties": ZERO,
            "dont_auto_entrees": ZERO, "dont_auto_sorties": ZERO, "valeur_tnd": ZERO,
        })

    if dossier == "banque2":
        for dv in DEVISES:
            entree(dv)
    else:
        entree("TND")
    for dv, init, origine, debit, credit, md_debit, md_credit in _flux_tresorerie(db, cfg["tresorerie"]):
        r = entree(dv or "TND")
        d_in, d_out = (dec(md_debit), dec(md_credit)) if dossier == "banque2" else (dec(debit), dec(credit))
        r["valeur_tnd"] += dec(debit) - dec(credit)
        if init:
            r["solde_initial"] += d_in - d_out
            continue
        r["entrees"] += d_in
        r["sorties"] += d_out
        if origine == ORIGINE_AUTO:
            r["dont_auto_entrees"] += d_in
            r["dont_auto_sorties"] += d_out
    lignes = []
    for dv, r in devises.items():
        r["solde"] = r["solde_initial"] + r["entrees"] - r["sorties"]
        lignes.append({k: (float(v) if isinstance(v, Decimal) else v) for k, v in r.items()})
    return {"dossier": dossier, "compte": cfg["tresorerie"], "devises": lignes}


def resume_dossiers_manuels(db: Session) -> list[dict]:
    comptes = dict(
        db.query(EcritureComptable.dossier, func.count(EcritureComptable.id))
        .filter(EcritureComptable.origine == ORIGINE_MANUELLE, EcritureComptable.type_operation != "solde_initial")
        .group_by(EcritureComptable.dossier).all()
    )
    resultat = []
    for cle, cfg in DOSSIERS_MANUELS.items():
        r = {"cle": cle, "numero": cfg["numero"], "label": cfg["label"], "titre": cfg["titre"], "icone": cfg["icone"],
             "description": cfg["description"], "nb_ecritures": int(comptes.get(cle, 0)), "tresorerie": None}
        if cfg["tresorerie"]:
            r["tresorerie"] = resume_tresorerie(db, cle)["devises"]
        resultat.append(r)
    return resultat


def resume_dossiers_auto(db: Session) -> list[dict]:
    rows = (
        db.query(EcritureComptable.type_operation, func.count(func.distinct(EcritureComptable.id)),
                 func.coalesce(func.sum(LigneEcriture.debit), 0), func.max(EcritureComptable.date))
        .join(LigneEcriture, LigneEcriture.ecriture_id == EcritureComptable.id)
        .filter(EcritureComptable.origine == ORIGINE_AUTO)
        .group_by(EcritureComptable.type_operation).all()
    )
    agg: dict[str, dict] = {cle: {"nb": 0, "total": ZERO, "derniere": None} for cle in DOSSIERS_AUTO}
    for type_op, nb, total, derniere in rows:
        a = agg[dossier_auto_de(type_op)]
        a["nb"] += int(nb)
        a["total"] += dec(total)
        if derniere and (a["derniere"] is None or derniere > a["derniere"]):
            a["derniere"] = derniere
    return [
        {"cle": cle, "label": d["label"], "icone": d["icone"], "description": d["description"], "source": d["source"],
         "nb_ecritures": agg[cle]["nb"], "total": float(agg[cle]["total"]),
         "derniere_date": agg[cle]["derniere"].isoformat() if agg[cle]["derniere"] else None}
        for cle, d in DOSSIERS_AUTO.items()
    ]


# ------------------------------------------------------------- TVA et rapports
def tva_periode(db: Session, du: date, au: date) -> dict:
    y, m = extract("year", EcritureComptable.date), extract("month", EcritureComptable.date)
    q = (
        db.query(y, m, CompteComptable.numero, func.coalesce(func.sum(LigneEcriture.debit), 0), func.coalesce(func.sum(LigneEcriture.credit), 0))
        .select_from(LigneEcriture)
        .join(EcritureComptable, EcritureComptable.id == LigneEcriture.ecriture_id)
        .join(CompteComptable, CompteComptable.id == LigneEcriture.compte_id)
        .filter(CompteComptable.numero.in_([COMPTE_TVA_COLLECTEE, COMPTE_TVA_DEDUCTIBLE, COMPTE_TIMBRE]),
                EcritureComptable.date >= du, EcritureComptable.date <= au)
        .group_by(y, m, CompteComptable.numero).all()
    )
    mois: dict[tuple[int, int], dict] = {}
    for a, mo, numero, d, c in q:
        r = mois.setdefault((int(a), int(mo)), {"mois": f"{int(a)}-{int(mo):02d}", "collectee": ZERO, "deductible": ZERO, "timbre": ZERO})
        if numero == COMPTE_TVA_COLLECTEE:
            r["collectee"] += dec(c) - dec(d)
        elif numero == COMPTE_TVA_DEDUCTIBLE:
            r["deductible"] += dec(d) - dec(c)
        else:
            r["timbre"] += dec(c) - dec(d)
    lignes = []
    for cle in sorted(mois):
        r = mois[cle]
        lignes.append({"mois": r["mois"], "collectee": float(r["collectee"]), "deductible": float(r["deductible"]),
                       "timbre": float(r["timbre"]), "a_payer": float(r["collectee"] - r["deductible"])})
    tc, td, tt = (sum(l[k] for l in lignes) for k in ("collectee", "deductible", "timbre"))
    return {"date_du": du.isoformat(), "date_au": au.isoformat(), "lignes": lignes,
            "total_collectee": round(tc, 3), "total_deductible": round(td, 3), "total_timbre": round(tt, 3),
            "total_a_payer": round(tc - td, 3)}


def balance_generale(db: Session, du: date | None, au: date | None) -> dict:
    q = (
        db.query(CompteComptable.numero, CompteComptable.libelle,
                 func.coalesce(func.sum(LigneEcriture.debit), 0), func.coalesce(func.sum(LigneEcriture.credit), 0))
        .select_from(LigneEcriture)
        .join(EcritureComptable, EcritureComptable.id == LigneEcriture.ecriture_id)
        .join(CompteComptable, CompteComptable.id == LigneEcriture.compte_id)
    )
    if du:
        q = q.filter(EcritureComptable.date >= du)
    if au:
        q = q.filter(EcritureComptable.date <= au)
    lignes, td, tc = [], ZERO, ZERO
    for numero, libelle, d, c in q.group_by(CompteComptable.numero, CompteComptable.libelle).order_by(CompteComptable.numero).all():
        d, c = dec(d), dec(c)
        td += d
        tc += c
        lignes.append({"numero": numero, "libelle": libelle, "debit": float(d), "credit": float(c),
                       "solde_debiteur": float(d - c) if d > c else 0.0, "solde_crediteur": float(c - d) if c > d else 0.0})
    return {"lignes": lignes, "total_debit": float(td), "total_credit": float(tc), "equilibre": td == tc}
