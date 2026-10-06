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

from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session

from . import models
from .compta_plan import (
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
        resultat.append({"compte_id": compte.id, "compte_auxiliaire": aux, "libelle": lib, "debit": debit, "credit": credit})
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
    utilisateur_id: int | None = None,
) -> EcritureComptable:
    libelle = (libelle or "").strip()
    if not libelle:
        raise ComptaError("Le libellé de l'écriture est obligatoire.")
    if journal not in JOURNAUX:
        raise ComptaError("Journal inconnu.")
    lignes_ok = _normaliser_lignes(db, lignes)
    e = EcritureComptable(
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
    }i