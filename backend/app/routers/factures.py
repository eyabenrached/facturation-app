from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_admin, exiger_utilisateur_connecte
from ..pdf import generer_facture_pdf

router = APIRouter(prefix="/factures", tags=["Factures"])


def _suggerer_numero(db: Session) -> str:
    """
    Numérotation automatique par défaut : FAC-<année>-<compteur séquentiel>.
    Reste modifiable par l'utilisateur avant validation (cf. besoin exprimé).
    """
    annee = datetime.now().year
    prefixe = f"FAC-{annee}-"
    nb = (
        db.query(models.Facture)
        .filter(models.Facture.numero_facture.like(f"{prefixe}%"))
        .count()
    )
    return f"{prefixe}{nb + 1:04d}"


@router.get("/next-numero", response_model=schemas.NextNumeroOut, dependencies=[Depends(exiger_admin)])
def next_numero(db: Session = Depends(get_db)):
    """Numéro suggéré automatiquement, à afficher pré-rempli (et modifiable) dans le formulaire."""
    return {"numero_suggere": _suggerer_numero(db)}


@router.get("/", response_model=list[schemas.FactureOut], dependencies=[Depends(exiger_admin)])
def liste_factures(
    client_id: int | None = None,
    statut: str | None = None,
    date_du: date | None = None,
    date_au: date | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Facture).options(
        joinedload(models.Facture.client),
        joinedload(models.Facture.mouvements).joinedload(models.Mouvement.circuit),
        joinedload(models.Facture.mouvements).joinedload(models.Mouvement.vehicule),
    )
    if client_id:
        q = q.filter(models.Facture.client_id == client_id)
    if statut:
        q = q.filter(models.Facture.statut == statut)
    if date_du:
        q = q.filter(models.Facture.date_fin >= date_du)
    if date_au:
        q = q.filter(models.Facture.date_debut <= date_au)
    return q.order_by(models.Facture.date_creation.desc()).all()


@router.post("/", response_model=schemas.FactureOut, status_code=201, dependencies=[Depends(exiger_admin)])
def generer_facture(payload: schemas.FactureGenerateRequest, db: Session = Depends(get_db)):
    client = db.query(models.Client).get(payload.client_id)
    if not client:
        raise HTTPException(400, "Client introuvable.")

    if db.query(models.Facture).filter(models.Facture.numero_facture == payload.numero_facture).first():
        raise HTTPException(400, "Ce numéro de facture est déjà utilisé. Merci d'en choisir un autre.")

    mouvements = (
        db.query(models.Mouvement)
        .filter(
            models.Mouvement.client_id == payload.client_id,
            models.Mouvement.date >= payload.date_debut,
            models.Mouvement.date <= payload.date_fin,
            models.Mouvement.facture_id.is_(None),
        )
        .all()
    )
    if not mouvements:
        raise HTTPException(400, "Aucun mouvement non facturé trouvé pour ce client sur cette période.")

    montant_ht = sum(float(m.prix_applique) for m in mouvements)
    taux_tva = float(client.taux_tva)
    montant_tva = round(montant_ht * taux_tva / 100, 3)
    montant_ttc = round(montant_ht + montant_tva, 3)

    facture = models.Facture(
        client_id=payload.client_id,
        numero_facture=payload.numero_facture,
        date_debut=payload.date_debut,
        date_fin=payload.date_fin,
        montant_ht=montant_ht,
        taux_tva=taux_tva,
        montant_tva=montant_tva,
        montant_ttc=montant_ttc,
        statut=models.StatutFacture.impayee,
    )
    db.add(facture)
    db.flush()  # pour obtenir facture.id avant de lier les mouvements

    for m in mouvements:
        m.facture_id = facture.id

    db.commit()
    db.refresh(facture)
    return facture


@router.delete("/{facture_id}", status_code=204, dependencies=[Depends(exiger_admin)])
def supprimer_facture(facture_id: int, db: Session = Depends(get_db)):
    facture = db.query(models.Facture).get(facture_id)
    if not facture:
        raise HTTPException(404, "Facture introuvable.")

    # Les mouvements liés à cette facture redeviennent "non facturés"
    # (ils pourront être inclus dans une nouvelle facture).
    for m in facture.mouvements:
        m.facture_id = None

    db.delete(facture)
    db.commit()


@router.patch("/{facture_id}/statut", response_model=schemas.FactureOut, dependencies=[Depends(exiger_admin)])
def changer_statut(facture_id: int, payload: schemas.FactureStatutUpdate, db: Session = Depends(get_db)):
    facture = db.query(models.Facture).get(facture_id)
    if not facture:
        raise HTTPException(404, "Facture introuvable.")
    facture.statut = payload.statut
    facture.date_paiement = payload.date_paiement
    db.commit()
    db.refresh(facture)
    return facture


@router.get("/{facture_id}/pdf", dependencies=[Depends(exiger_admin)])
def export_pdf(facture_id: int, db: Session = Depends(get_db)):
    facture = (
        db.query(models.Facture)
        .options(
            joinedload(models.Facture.client),
            joinedload(models.Facture.mouvements).joinedload(models.Mouvement.circuit),
            joinedload(models.Facture.mouvements).joinedload(models.Mouvement.vehicule),
        )
        .filter(models.Facture.id == facture_id)
        .first()
    )
    if not facture:
        raise HTTPException(404, "Facture introuvable.")

    pdf_bytes = generer_facture_pdf(facture)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{facture.numero_facture}.pdf"'},
    )