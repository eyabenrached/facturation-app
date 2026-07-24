from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_admin, exiger_utilisateur_connecte

router = APIRouter(prefix="/vehicules", tags=["Véhicules"])


@router.get("/", response_model=list[schemas.VehiculeOut], dependencies=[Depends(exiger_utilisateur_connecte)])
def liste_vehicules(agence_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Vehicule).options(joinedload(models.Vehicule.agence))
    if agence_id:
        q = q.filter(models.Vehicule.agence_id == agence_id)
    return q.order_by(models.Vehicule.matricule).all()


@router.post("/", response_model=schemas.VehiculeOut, status_code=201, dependencies=[Depends(exiger_admin)])
def creer_vehicule(payload: schemas.VehiculeCreate, db: Session = Depends(get_db)):
    if db.query(models.Vehicule).filter(models.Vehicule.matricule == payload.matricule).first():
        raise HTTPException(400, "Un véhicule avec ce matricule existe déjà.")
    if not db.query(models.Agence).get(payload.agence_id):
        raise HTTPException(400, "Agence introuvable.")
    obj = models.Vehicule(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{vehicule_id}", response_model=schemas.VehiculeOut, dependencies=[Depends(exiger_admin)])
def modifier_vehicule(vehicule_id: int, payload: schemas.VehiculeCreate, db: Session = Depends(get_db)):
    obj = db.query(models.Vehicule).get(vehicule_id)
    if not obj:
        raise HTTPException(404, "Véhicule introuvable.")
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{vehicule_id}", status_code=204, dependencies=[Depends(exiger_admin)])
def supprimer_vehicule(vehicule_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Vehicule).get(vehicule_id)
    if not obj:
        raise HTTPException(404, "Véhicule introuvable.")
    if db.query(models.Mouvement).filter(models.Mouvement.vehicule_id == vehicule_id).first():
        raise HTTPException(400, "Ce véhicule est lié à des mouvements existants : suppression bloquée.")
    db.delete(obj)
    db.commit()
