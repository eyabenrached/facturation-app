from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_utilisateur_connecte
from ..recap import construire_recap_transporteurs

router = APIRouter(prefix="/mouvements-location", tags=["Mouvements Location"])


def _options(q):
    return q.options(
        joinedload(models.MouvementLocation.chauffeur),
        joinedload(models.MouvementLocation.vehicule),
        joinedload(models.MouvementLocation.transporteur),
    )


@router.get("/recap-transporteurs", response_model=schemas.RecapTransporteursOut, dependencies=[Depends(exiger_utilisateur_connecte)])
def recap_transporteurs(
    date_du: date | None = None,
    date_au: date | None = None,
    db: Session = Depends(get_db),
):
    """Nombre de mouvements de location (chrono) par heure et par transporteur choisi."""
    q = db.query(models.MouvementLocation).options(joinedload(models.MouvementLocation.transporteur))
    if date_du:
        q = q.filter(models.MouvementLocation.date >= date_du)
    if date_au:
        q = q.filter(models.MouvementLocation.date <= date_au)
    return construire_recap_transporteurs(q.all())


@router.get("/", response_model=list[schemas.MouvementLocationOut], dependencies=[Depends(exiger_utilisateur_connecte)])
def liste_mouvements_location(
    date_du: date | None = None,
    date_au: date | None = None,
    client: str | None = None,
    transporteur_id: int | None = None,
    chauffeur_id: int | None = None,
    db: Session = Depends(get_db),
):
    q = _options(db.query(models.MouvementLocation))
    if date_du:
        q = q.filter(models.MouvementLocation.date >= date_du)
    if date_au:
        q = q.filter(models.MouvementLocation.date <= date_au)
    if client:
        q = q.filter(models.MouvementLocation.client.ilike(f"%{client}%"))
    if transporteur_id:
        q = q.filter(models.MouvementLocation.transporteur_id == transporteur_id)
    if chauffeur_id:
        q = q.filter(models.MouvementLocation.chauffeur_id == chauffeur_id)
    return q.order_by(models.MouvementLocation.date, models.MouvementLocation.heure).all()


@router.post("/", response_model=schemas.MouvementLocationOut, status_code=201, dependencies=[Depends(exiger_utilisateur_connecte)])
def creer_mouvement_location(payload: schemas.MouvementLocationCreate, db: Session = Depends(get_db)):
    obj = models.MouvementLocation(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{mouvement_id}", response_model=schemas.MouvementLocationOut, dependencies=[Depends(exiger_utilisateur_connecte)])
def modifier_mouvement_location(mouvement_id: int, payload: schemas.MouvementLocationCreate, db: Session = Depends(get_db)):
    obj = db.query(models.MouvementLocation).get(mouvement_id)
    if not obj:
        raise HTTPException(404, "Mouvement de location introuvable.")
    for champ, valeur in payload.model_dump().items():
        setattr(obj, champ, valeur)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{mouvement_id}", status_code=204, dependencies=[Depends(exiger_utilisateur_connecte)])
def supprimer_mouvement_location(mouvement_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.MouvementLocation).get(mouvement_id)
    if not obj:
        raise HTTPException(404, "Mouvement de location introuvable.")
    db.delete(obj)
    db.commit()
