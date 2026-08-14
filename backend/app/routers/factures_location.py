from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_admin
from ..pdf import generer_facture_location_pdf

router = APIRouter(prefix="/factures-location", tags=["Factures Location"])


def _suggerer_numero(db: Session) -> str:
    """Numérotation automatique par défaut : LOC-<année>-<compteur séquentiel>,
    distincte de la numérotation des factures classiques (FAC-...)."""
    annee = datetime.now().year
    prefixe = f"LOC-{annee}-"
    nb = (
        db.query(models.FactureLocation)
        .filter(models.FactureLocation.numero_facture.like(f"{prefixe}%"))
        .count()
    )
    return f"{prefixe}{nb + 1:04d}"


@router.get("/next-numero", response_model=schemas.NextNumeroOut, dependencies=[Depends(exiger_admin)])
def next_numero(db: Session = Depends(get_db)):
    return {"numero_suggere": _suggerer_numero(db)}


@router.get("/", response_model=list[schemas.FactureLocationOut], dependencies=[Depends(exiger_admin)])
def liste_factures_location(
    client: str | None = None,
    statut: str | None = None,
    date_du: date | None = None,
    date_au: date | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.FactureLocation).options(joinedload(models.FactureLocation.mouvements))
    if client:
        q = q.filter(models.FactureLocation.client.ilike(f"%{client}%"))
    if statut:
        q = q.filter(models.FactureLocation.statut == statut)
    if date_du:
        q = q.filter(models.FactureLocation.date_fin >= date_du)
    if date_au:
        q = q.filter(models.FactureLocation.date_debut <= date_au)
    return q.order_by(models.FactureLocation.date_creation.desc()).all()


@router.post("/", response_model=schemas.FactureLocationOut, status_code=201, dependencies=[Depends(exiger_admin)])
def generer_facture_location(payload: schemas.FactureLocationGenerateRequest, db: Session = Depends(get_db)):
    nom_client = payload.client.strip()
    if not nom_client:
        raise HTTPException(400, "Le nom du client est obligatoire.")

    if db.query(models.FactureLocation).filter(models.FactureLocation.numero_facture == payload.numero_facture).first():
        raise HTTPException(400, "Ce numéro de facture est déjà utilisé. Merci d'en choisir un autre.")

    # Correspondance insensible à la casse/espaces, car "client" est un champ texte libre.
    mouvements = (
        db.query(models.MouvementLocation)
        .filter(
            func.lower(func.trim(models.MouvementLocation.client)) == nom_client.lower(),
            models.MouvementLocation.date >= payload.date_debut,
            models.MouvementLocation.date <= payload.date_fin,
            models.MouvementLocation.facture_id.is_(None),
        )
        .all()
    )
    if not mouvements:
        raise HTTPException(400, "Aucun mouvement de location non facturé trouvé pour ce client sur cette période.")

    montant_ht = sum(float(m.prix) for m in mouvements)
    montant_tva = round(montant_ht * payload.taux_tva / 100, 3)
    montant_ttc = round(montant_ht + montant_tva, 3)

    facture = models.FactureLocation(
        client=nom_client,
        numero_facture=payload.numero_facture,
        date_debut=payload.date_debut,
        date_fin=payload.date_fin,
        montant_ht=montant_ht,
        taux_tva=payload.taux_tva,
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
def supprimer_facture_location(facture_id: int, db: Session = Depends(get_db)):
    facture = db.query(models.FactureLocation).get(facture_id)
    if not facture:
        raise HTTPException(404, "Facture introuvable.")

    for m in facture.mouvements:
        m.facture_id = None

    db.delete(facture)
    db.commit()


@router.patch("/{facture_id}/statut", response_model=schemas.FactureLocationOut, dependencies=[Depends(exiger_admin)])
def changer_statut(facture_id: int, payload: schemas.FactureStatutUpdate, db: Session = Depends(get_db)):
    facture = db.query(models.FactureLocation).get(facture_id)
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
        db.query(models.FactureLocation)
        .options(joinedload(models.FactureLocation.mouvements))
        .filter(models.FactureLocation.id == facture_id)
        .first()
    )
    if not facture:
        raise HTTPException(404, "Facture introuvable.")

    pdf_bytes = generer_facture_location_pdf(facture)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{facture.numero_facture}.pdf"'},
    )
