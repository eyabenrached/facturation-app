from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_admin, exiger_utilisateur_connecte

router = APIRouter(prefix="/agences", tags=["Agences"])


@router.get("/", response_model=list[schemas.AgenceOut], dependencies=[Depends(exiger_utilisateur_connecte)])
def liste_agences(recherche: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Agence)
    if recherche:
        like = f"%{recherche}%"
        q = q.filter(
            (models.Agence.nom_agence.ilike(like)) | (models.Agence.responsable.ilike(like))
        )
    return q.order_by(models.Agence.nom_agence).all()


@router.post("/", response_model=schemas.AgenceOut, status_code=201, dependencies=[Depends(exiger_admin)])
def creer_agence(payload: schemas.AgenceCreate, db: Session = Depends(get_db)):
    if db.query(models.Agence).filter(models.Agence.nom_agence == payload.nom_agence).first():
        raise HTTPException(400, "Une agence avec ce nom existe déjà.")
    obj = models.Agence(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{agence_id}", response_model=schemas.AgenceOut, dependencies=[Depends(exiger_admin)])
def modifier_agence(agence_id: int, payload: schemas.AgenceCreate, db: Session = Depends(get_db)):
    obj = db.query(models.Agence).get(agence_id)
    if not obj:
        raise HTTPException(404, "Agence introuvable.")
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{agence_id}", status_code=204, dependencies=[Depends(exiger_admin)])
def supprimer_agence(agence_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Agence).get(agence_id)
    if not obj:
        raise HTTPException(404, "Agence introuvable.")
    if db.query(models.Vehicule).filter(models.Vehicule.agence_id == agence_id).first():
        raise HTTPException(400, "Cette agence possède des véhicules : suppression bloquée.")
    db.delete(obj)
    db.commit()
