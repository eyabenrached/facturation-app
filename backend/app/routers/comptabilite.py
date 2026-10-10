"""Routes du module Comptabilité (phase 1 : tableau de bord, plan comptable, journal).

Toutes les routes sont réservées aux administrateurs, comme /factures,
/depenses et /finances (données de rentabilité de l'entreprise).
"""
from calendar import monthrange
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import compta_export, compta_service as svc, compta_tiers
from ..compta_plan import (
    DEVISES, DOSSIERS_AUTO, DOSSIERS_MANUELS, JOURNAUX, LABELS_DOSSIER, ORIGINE_AUTO, ORIGINE_MANUELLE, TYPES_OPERATION,
)
from ..database import get_db
from ..deps import exiger_admin
from ..models import Agence, Client, Hotel, Utilisateur
from ..models_compta import CompteComptable, EcritureComptable, LigneEcriture
from ..schemas_compta import (
    ClotureIn, CompteIn, EcritureIn, MouvementTresorerieIn, PaiementIn, RegularisationIn, SoldeInitialIn,
)

router = APIRouter(prefix="/comptabilite", tags=["Comptabilité"], dependencies=[Depends(exiger_admin)])


def _periode(date_du: date | None, date_au: date | None) -> tuple[date, date]:
    if date_du and date_au:
        if date_du > date_au:
            raise HTTPException(400, "La date de début doit précéder la date de fin.")
        return date_du, date_au
    t = date.today()
    return date(t.year, t.month, 1), date(t.year, t.month, monthrange(t.year, t.month)[1])


def _erreur(e: svc.ComptaError) -> HTTPException:
    return HTTPException(400, str(e))


# ------------------------------------------------------------------ tableau de bord
@router.get("/dashboard")
def dashboard(date_du: date | None = None, date_au: date | None = None, db: Session = Depends(get_db)):
    du, au = _periode(date_du, date_au)
    return svc.tableau_de_bord(db, du, au)


@router.get("/diagnostic")
def diagnostic(db: Session = Depends(get_db)):
    return svc.diagnostic(db)


@router.post("/rattrapage")
def rattrapage(db: Session = Depends(get_db)):
    """Génère les écritures manquantes de l'historique (idempotent, sans doublon)."""
    return {"crees": svc.rattrapage(db), "diagnostic": svc.diagnostic(db)}


# ------------------------------------------------------------------ plan comptable
def _compte_out(c: CompteComptable, nb: int = 0) -> dict:
    return {"id": c.id, "numero": c.numero, "libelle": c.libelle, "classe": c.classe, "actif": c.actif, "systeme": c.systeme, "nb_lignes": nb}


@router.get("/comptes")
def liste_comptes(q: str | None = None, classe: int | None = None, actif: bool | None = None, db: Session = Depends(get_db)):
    req = db.query(CompteComptable, func.count(LigneEcriture.id)).outerjoin(LigneEcriture, LigneEcriture.compte_id == CompteComptable.id)
    if q:
        req = req.filter(or_(CompteComptable.numero.ilike(f"{q}%"), CompteComptable.libelle.ilike(f"%{q}%")))
    if classe:
        req = req.filter(CompteComptable.classe == classe)
    if actif is not None:
        req = req.filter(CompteComptable.actif == actif)
    lignes = req.group_by(CompteComptable.id).order_by(CompteComptable.numero).all()
    return [_compte_out(c, nb) for c, nb in lignes]


@router.post("/comptes", status_code=201)
def creer_compte(payload: CompteIn, db: Session = Depends(get_db)):
    if db.query(CompteComptable).filter(CompteComptable.numero == payload.numero).first():
        raise HTTPException(400, "Ce numéro de compte existe déjà.")
    c = CompteComptable(numero=payload.numero, libelle=payload.libelle.strip(), classe=int(payload.numero[0]), actif=payload.actif)
    db.add(c)
    db.commit()
    db.refresh(c)
    return _compte_out(c)


@router.put("/comptes/{compte_id}")
def modifier_compte(compte_id: int, payload: CompteIn, db: Session = Depends(get_db)):
    c = db.get(CompteComptable, compte_id)
    if not c:
        raise HTTPException(404, "Compte introuvable.")
    nb = db.query(func.count(LigneEcriture.id)).filter(LigneEcriture.compte_id == c.id).scalar() or 0
    if payload.numero != c.numero:
        if c.systeme:
            raise HTTPException(400, "Le numéro d'un compte système (utilisé par les écritures automatiques) ne peut pas être modifié.")
        if nb:
            raise HTTPException(400, "Ce compte est déjà utilisé dans des écritures : son numéro ne peut plus être modifié.")
        if db.query(CompteComptable).filter(CompteComptable.numero == payload.numero, CompteComptable.id != c.id).first():
            raise HTTPException(400, "Ce numéro de compte existe déjà.")
        c.numero, c.classe = payload.numero, int(payload.numero[0])
    if c.systeme and not payload.actif:
        raise HTTPException(400, "Un compte système ne peut pas être désactivé.")
    c.libelle, c.actif = payload.libelle.strip(), payload.actif
    db.commit()
    return _compte_out(c, nb)


@router.patch("/comptes/{compte_id}/actif")
def basculer_compte(compte_id: int, db: Session = Depends(get_db)):
    c = db.get(CompteComptable, compte_id)
    if not c:
        raise HTTPException(404, "Compte introuvable.")
    if c.systeme and c.actif:
        raise HTTPException(400, "Un compte système (utilisé par les écritures automatiques) ne peut pas être désactivé.")
    c.actif = not c.actif
    db.commit()
    return _compte_out(c)


# ---------------------------------------------------------------------- journal
def _ecriture_out(e: EcritureComptable, regularisee_par: str | None = None) -> dict:
    td = sum(float(l.debit) for l in e.lignes)
    tc = sum(float(l.credit) for l in e.lignes)
    auto = e.origine == ORIGINE_AUTO
    return {
        "id": e.id, "date": e.date.isoformat(), "numero_piece": e.numero_piece, "journal": e.journal,
        "libelle": e.libelle, "reference": e.reference, "type_operation": e.type_operation,
        "automatique": auto, "origine": e.origine, "dossier": e.dossier, "dossier_label": LABELS_DOSSIER.get(e.dossier or "", ""),
        "tiers": e.tiers, "observation": e.observation,
        "utilisateur": e.utilisateur.nom if e.utilisateur else None,
        "date_creation": e.date_creation.isoformat() if e.date_creation else None,
        "regularise_id": e.regularise_id, "regularisee_par": regularisee_par,
        "cloturee": e.cloturee,
        "modifiable": (not auto) and (not e.cloturee) and e.type_operation != "solde_initial",
        "total_debit": round(td, 3), "total_credit": round(tc, 3),
        "lignes": [
            {"id": l.id, "compte_id": l.compte_id, "compte_numero": l.compte.numero, "compte_libelle": l.compte.libelle,
             "compte_auxiliaire": l.compte_auxiliaire, "libelle": l.libelle, "debit": float(l.debit), "credit": float(l.credit),
             "devise": l.devise, "montant_devise": float(l.montant_devise) if l.montant_devise is not None else None,
             "taux_change": float(l.taux_change) if l.taux_change is not None else None}
            for l in e.lignes
        ],
    }


def _sorties(db: Session, ecritures: list[EcritureComptable]) -> list[dict]:
    """Sérialise des écritures en indiquant, pour chacune, la régularisation qui l'a corrigée."""
    ids = [e.id for e in ecritures]
    corrigees = {}
    if ids:
        corrigees = dict(
            db.query(EcritureComptable.regularise_id, EcritureComptable.numero_piece)
            .filter(EcritureComptable.regularise_id.in_(ids)).all()
        )
    return [_ecriture_out(e, corrigees.get(e.id)) for e in ecritures]


def _requete_ecritures(db: Session, q, date_du, date_au, compte_id, type_operation, journal,
                       origine=None, dossier=None, categorie=None, devise=None):
    req = db.query(EcritureComptable)
    if devise:
        req = req.filter(EcritureComptable.lignes.any(LigneEcriture.devise == devise.upper()))
    if origine:
        req = req.filter(EcritureComptable.origine == origine)
    if dossier:
        req = req.filter(EcritureComptable.dossier == dossier)
    if categorie:  # dossier de la comptabilité automatique
        cfg = DOSSIERS_AUTO.get(categorie)
        if not cfg:
            raise HTTPException(400, "Dossier automatique inconnu.")
        req = req.filter(EcritureComptable.origine == ORIGINE_AUTO)
        if categorie == "autres":
            connus = [t for d in DOSSIERS_AUTO.values() for t in d["types"]]
            req = req.filter(EcritureComptable.type_operation.not_in(connus))
        else:
            req = req.filter(EcritureComptable.type_operation.in_(cfg["types"]))
    if date_du:
        req = req.filter(EcritureComptable.date >= date_du)
    if date_au:
        req = req.filter(EcritureComptable.date <= date_au)
    if type_operation:
        req = req.filter(EcritureComptable.type_operation == type_operation)
    if journal:
        req = req.filter(EcritureComptable.journal == journal)
    if compte_id:
        req = req.filter(EcritureComptable.lignes.any(LigneEcriture.compte_id == compte_id))
    if q and q.strip():
        motif = f"%{q.strip()}%"
        req = req.filter(or_(
            EcritureComptable.libelle.ilike(motif), EcritureComptable.numero_piece.ilike(motif), EcritureComptable.reference.ilike(motif),
            EcritureComptable.tiers.ilike(motif), EcritureComptable.observation.ilike(motif),
            EcritureComptable.lignes.any(or_(
                LigneEcriture.compte_auxiliaire.ilike(motif), LigneEcriture.libelle.ilike(motif),
                LigneEcriture.compte.has(CompteComptable.numero.ilike(f"{q.strip()}%")),
                LigneEcriture.compte.has(CompteComptable.libelle.ilike(motif)),
            )),
        ))
    return req


@router.get("/ecritures")
def liste_ecritures(
    q: str | None = None, date_du: date | None = None, date_au: date | None = None, compte_id: int | None = None,
    type_operation: str | None = None, journal: str | None = None, page: int = 1, taille: int = 25,
    origine: str | None = None, dossier: str | None = None, categorie: str | None = None, devise: str | None = None,
    db: Session = Depends(get_db),
):
    page, taille = max(page, 1), min(max(taille, 1), 200)
    req = _requete_ecritures(db, q, date_du, date_au, compte_id, type_operation, journal, origine, dossier, categorie, devise)
    total = req.count()
    ids_sous_requete = req.with_entities(EcritureComptable.id).statement
    td, tc = db.query(func.coalesce(func.sum(LigneEcriture.debit), 0), func.coalesce(func.sum(LigneEcriture.credit), 0)).filter(
        LigneEcriture.ecriture_id.in_(ids_sous_requete)).one()
    items = (
        req.options(selectinload(EcritureComptable.lignes).joinedload(LigneEcriture.compte))
        .order_by(EcritureComptable.date.desc(), EcritureComptable.id.desc())
        .offset((page - 1) * taille).limit(taille).all()
    )
    return {"items": _sorties(db, items), "total": total, "page": page, "taille": taille,
            "total_debit": float(td), "total_credit": float(tc),
            "journaux": JOURNAUX, "types": TYPES_OPERATION, "dossiers": LABELS_DOSSIER}


def _charger(db: Session, ecriture_id: int) -> EcritureComptable:
    e = db.query(EcritureComptable).options(selectinload(EcritureComptable.lignes).joinedload(LigneEcriture.compte)).get(ecriture_id)
    if not e:
        raise HTTPException(404, "Écriture introuvable.")
    return e


def _verifier_modifiable(e: EcritureComptable):
    if e.cloturee:
        raise HTTPException(400, "Cette écriture appartient à une période clôturée : elle ne peut plus être modifiée ni supprimée.")
    if e.origine == ORIGINE_AUTO:
        raise HTTPException(
            400,
            "Cette écriture est générée automatiquement : elle ne se modifie pas. "
            "Modifiez la facture, le paiement ou la dépense d'origine, ou créez une écriture de régularisation.",
        )
    if e.type_operation == "solde_initial":
        raise HTTPException(400, "Le solde initial se modifie depuis le dossier de trésorerie (bouton « Solde initial »).")


@router.post("/ecritures", status_code=201)
def creer_ecriture(payload: EcritureIn, db: Session = Depends(get_db), user: Utilisateur = Depends(exiger_admin)):
    if not payload.dossier:
        raise HTTPException(400, "Choisissez le dossier de la comptabilité manuelle (Clients, Fournisseurs, Banque 1, Banque 2 ou Caisse).")
    try:
        e = svc.creer_ecriture_manuelle(
            db, dossier=payload.dossier, date_ecriture=payload.date, libelle=payload.libelle,
            lignes=[l.model_dump() for l in payload.lignes], journal=payload.journal, reference=payload.reference,
            numero_piece=payload.numero_piece, tiers=payload.tiers, observation=payload.observation, utilisateur_id=user.id,
        )
        db.commit()
    except svc.ComptaError as err:
        db.rollback()
        raise _erreur(err)
    return _sorties(db, [_charger(db, e.id)])[0]


@router.put("/ecritures/{ecriture_id}")
def modifier_ecriture(ecriture_id: int, payload: EcritureIn, db: Session = Depends(get_db)):
    e = _charger(db, ecriture_id)
    _verifier_modifiable(e)
    if payload.journal not in JOURNAUX:
        raise HTTPException(400, "Journal inconnu.")
    if not payload.libelle.strip():
        raise HTTPException(400, "Le libellé de l'écriture est obligatoire.")
    try:
        svc.verifier_periode_ouverte(db, payload.date)
        svc.remplacer_lignes(db, e, [l.model_dump() for l in payload.lignes])
        if payload.dossier:
            e.dossier = payload.dossier
        e.tiers = (payload.tiers or "").strip()[:150] or None
        e.observation = (payload.observation or "").strip()[:500] or None
        db.flush()
        db.refresh(e)
        if e.dossier:
            svc.controler_dossier(e, e.dossier, e.type_operation)
        e.date, e.libelle, e.journal = payload.date, payload.libelle.strip()[:255], payload.journal
        e.reference = (payload.reference or "").strip()[:100] or None
        if payload.numero_piece and payload.numero_piece.strip():
            e.numero_piece = payload.numero_piece.strip()[:40]
        db.commit()
    except svc.ComptaError as err:
        db.rollback()
        raise _erreur(err)
    return _sorties(db, [_charger(db, ecriture_id)])[0]


@router.delete("/ecritures/{ecriture_id}", status_code=204)
def supprimer_ecriture(ecriture_id: int, db: Session = Depends(get_db)):
    e = _charger(db, ecriture_id)
    _verifier_modifiable(e)
    db.delete(e)
    db.commit()


# ---------------------------------------------------------------------- exports
def _export_donnees(db, q, date_du, date_au, compte_id, type_operation, journal, origine=None, dossier=None, categorie=None):
    req = _requete_ecritures(db, q, date_du, date_au, compte_id, type_operation, journal, origine, dossier, categorie)
    if req.count() > 20000:
        raise HTTPException(400, "Trop d'écritures pour un export : affinez la période (maximum 20 000).")
    ecritures = (
        req.options(selectinload(EcritureComptable.lignes).joinedload(LigneEcriture.compte))
        .order_by(EcritureComptable.date, EcritureComptable.id).all()
    )
    if date_du and date_au:
        titre = f"Période du {date_du.strftime('%d/%m/%Y')} au {date_au.strftime('%d/%m/%Y')}"
    else:
        titre = "Toutes périodes"
    return ecritures, titre


@router.get("/ecritures/export/xlsx")
def export_xlsx(q: str | None = None, date_du: date | None = None, date_au: date | None = None, compte_id: int | None = None,
                type_operation: str | None = None, journal: str | None = None, origine: str | None = None,
                dossier: str | None = None, categorie: str | None = None, db: Session = Depends(get_db)):
    ecritures, titre = _export_donnees(db, q, date_du, date_au, compte_id, type_operation, journal, origine, dossier, categorie)
    return Response(
        content=compta_export.journal_xlsx(ecritures, titre),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="journal-comptable.xlsx"'},
    )


@router.get("/ecritures/export/pdf")
def export_pdf(q: str | None = None, date_du: date | None = None, date_au: date | None = None, compte_id: int | None = None,
               type_operation: str | None = None, journal: str | None = None, origine: str | None = None,
                dossier: str | None = None, categorie: str | None = None, db: Session = Depends(get_db)):
    ecritures, titre = _export_donnees(db, q, date_du, date_au, compte_id, type_operation, journal, origine, dossier, categorie)
    return Response(
        content=compta_export.journal_pdf(ecritures, titre),
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="journal-comptable.pdf"'},
    )


# ------------------------------------------------------- clients / créances
@router.get("/creances")
def creances(q: str | None = None, statut: str | None = None, db: Session = Depends(get_db)):
    return compta_tiers.liste_creances(db, q, statut)


@router.get("/creances/detail")
def creances_detail(nom: str, db: Session = Depends(get_db)):
    d = compta_tiers.detail_client(db, nom)
    if not d:
        raise HTTPException(404, "Client introuvable.")
    return d


@router.get("/creances/releve/pdf")
def creances_releve_pdf(nom: str, date_du: date | None = None, date_au: date | None = None, db: Session = Depends(get_db)):
    rel = compta_tiers.releve(db, nom, date_du, date_au)
    if not rel:
        raise HTTPException(404, "Client introuvable.")
    return Response(content=compta_export.releve_client_pdf(rel), media_type="application/pdf",
                    headers={"Content-Disposition": 'inline; filename="releve-client.pdf"'})


@router.get("/creances/relance/pdf")
def creances_relance_pdf(nom: str, db: Session = Depends(get_db)):
    factures = compta_tiers.factures_a_relancer(db, nom)
    if not factures:
        raise HTTPException(400, "Aucune facture impayée pour ce client.")
    return Response(content=compta_export.relance_client_pdf(factures[0]["client"], factures, compta_tiers.DELAI_PAIEMENT_JOURS),
                    media_type="application/pdf", headers={"Content-Disposition": 'inline; filename="relance-client.pdf"'})


@router.post("/paiements", status_code=201)
def creer_paiement(payload: PaiementIn, db: Session = Depends(get_db), user: Utilisateur = Depends(exiger_admin)):
    try:
        p = svc.ajouter_paiement(
            db, payload.type_facture, payload.facture_id, montant=payload.montant, date_paiement=payload.date,
            mode=payload.mode, reference=payload.reference, note=payload.note, utilisateur_id=user.id,
        )
        db.commit()
    except svc.ComptaError as err:
        db.rollback()
        raise _erreur(err)
    return {"id": p.id, "montant": float(p.montant)}


@router.delete("/paiements/{paiement_id}", status_code=204)
def supprimer_paiement(paiement_id: int, db: Session = Depends(get_db)):
    try:
        svc.supprimer_paiement(db, paiement_id)
        db.commit()
    except svc.ComptaError as err:
        db.rollback()
        raise _erreur(err)


# =====================================================================
# ORGANISATION EN DOSSIERS
# =====================================================================
@router.get("/automatique/dossiers")
def dossiers_automatiques(db: Session = Depends(get_db)):
    return {"dossiers": svc.resume_dossiers_auto(db), "diagnostic": svc.diagnostic(db)}


@router.get("/manuel/dossiers")
def dossiers_manuels(db: Session = Depends(get_db)):
    return {"dossiers": svc.resume_dossiers_manuels(db), "devises": DEVISES}


@router.get("/manuel/tresorerie/{dossier}")
def tresorerie(dossier: str, db: Session = Depends(get_db)):
    try:
        return svc.resume_tresorerie(db, dossier)
    except svc.ComptaError as err:
        raise _erreur(err)


@router.get("/manuel/tiers")
def tiers_suggeres(dossier: str, db: Session = Depends(get_db)):
    """Noms proposés à la saisie : tables existantes (clients, hôtels, transporteurs) + tiers déjà utilisés."""
    if dossier == "client":
        noms = {n for (n,) in db.query(Client.nom_societe).all()}
    elif dossier == "fournisseur":
        noms = {n for (n,) in db.query(Hotel.nom).filter(Hotel.actif.is_(True)).all()}
        noms |= {n for (n,) in db.query(Agence.nom_agence).all()}
    else:
        noms = set()
    noms |= {n for (n,) in db.query(EcritureComptable.tiers).filter(EcritureComptable.dossier == dossier, EcritureComptable.tiers.is_not(None)).distinct().all()}
    return sorted(n for n in noms if n)


@router.post("/manuel/mouvements", status_code=201)
def creer_mouvement(payload: MouvementTresorerieIn, db: Session = Depends(get_db), user: Utilisateur = Depends(exiger_admin)):
    try:
        e = svc.saisie_tresorerie(
            db, dossier=payload.dossier, sens=payload.sens, date_ecriture=payload.date, montant=payload.montant,
            contrepartie_id=payload.contrepartie_id, libelle=payload.libelle, devise=payload.devise, taux=payload.taux,
            reference=payload.reference, tiers=payload.tiers, observation=payload.observation, utilisateur_id=user.id,
        )
        db.commit()
    except svc.ComptaError as err:
        db.rollback()
        raise _erreur(err)
    return _sorties(db, [_charger(db, e.id)])[0]


@router.put("/manuel/solde-initial")
def solde_initial(payload: SoldeInitialIn, db: Session = Depends(get_db), user: Utilisateur = Depends(exiger_admin)):
    try:
        svc.definir_solde_initial(
            db, dossier=payload.dossier, montant=payload.montant, date_ecriture=payload.date,
            devise=payload.devise, taux=payload.taux, utilisateur_id=user.id,
        )
        db.commit()
    except svc.ComptaError as err:
        db.rollback()
        raise _erreur(err)
    return svc.resume_tresorerie(db, payload.dossier)


@router.post("/ecritures/{ecriture_id}/regularisation", status_code=201)
def regulariser(ecriture_id: int, payload: RegularisationIn, db: Session = Depends(get_db), user: Utilisateur = Depends(exiger_admin)):
    try:
        e = svc.regulariser(db, ecriture_id, date_ecriture=payload.date, motif=payload.motif, utilisateur_id=user.id)
        db.commit()
    except svc.ComptaError as err:
        db.rollback()
        raise _erreur(err)
    return _sorties(db, [_charger(db, e.id)])[0]


# ------------------------------------------------------------ TVA, rapports, clôture
@router.get("/tva")
def tva(date_du: date | None = None, date_au: date | None = None, db: Session = Depends(get_db)):
    t = date.today()
    du, au = (date_du, date_au) if date_du and date_au else (date(t.year, 1, 1), date(t.year, 12, 31))
    if du > au:
        raise HTTPException(400, "La date de début doit précéder la date de fin.")
    return svc.tva_periode(db, du, au)


@router.get("/balance")
def balance(date_du: date | None = None, date_au: date | None = None, db: Session = Depends(get_db)):
    return svc.balance_generale(db, date_du, date_au)


@router.get("/cloture")
def etat_cloture(db: Session = Depends(get_db)):
    limite = svc.date_cloture(db)
    ouvertes = db.query(func.count(EcritureComptable.id)).filter(EcritureComptable.cloturee.is_(False)).scalar() or 0
    derniere = db.query(func.max(EcritureComptable.date)).filter(EcritureComptable.cloturee.is_(False)).scalar()
    return {"cloture_jusqu_au": limite.isoformat() if limite else None, "ecritures_ouvertes": ouvertes,
            "derniere_ecriture_ouverte": derniere.isoformat() if derniere else None}


@router.post("/cloture")
def cloturer(payload: ClotureIn, db: Session = Depends(get_db)):
    try:
        n = svc.cloturer(db, payload.jusqu_au)
        db.commit()
    except svc.ComptaError as err:
        db.rollback()
        raise _erreur(err)
    return {"cloturees": n, **etat_cloture(db)}
