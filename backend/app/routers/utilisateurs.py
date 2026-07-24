from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import hash_password
from ..deps import exiger_admin, get_current_user

router = APIRouter(prefix="/utilisateurs", tags=["Utilisateurs"])


@router.get("/", response_model=list[schemas.UtilisateurOut], dependencies=[Depends(exiger_admin)])
def liste_utilisateurs(db: Session = Depends(get_db)):
    return db.query(models.Utilisateur).order_by(models.Utilisateur.nom).all()


@router.post("/", response_model=schemas.UtilisateurOut, status_code=201, dependencies=[Depends(exiger_admin)])
def creer_utilisateur(payload: schemas.UtilisateurCreate, db: Session = Depends(get_db)):
    if db.query(models.Utilisateur).filter(models.Utilisateur.email == payload.email).first():
        raise HTTPException(400, "Un utilisateur avec cet e-mail existe déjà.")
    obj = models.Utilisateur(
        nom=payload.nom,
        email=payload.email,
        mot_de_passe_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.patch("/{user_id}/desactiver", response_model=schemas.UtilisateurOut, dependencies=[Depends(exiger_admin)])
def desactiver_utilisateur(
    user_id: int, db: Session = Depends(get_db), admin: models.Utilisateur = Depends(get_current_user)
):
    obj = db.query(models.Utilisateur).get(user_id)
    if not obj:
        raise HTTPException(404, "Utilisateur introuvable.")
    if obj.id == admin.id:
        raise HTTPException(400, "Vous ne pouvez pas désactiver votre propre compte.")
    obj.actif = False
    db.commit()
    db.refresh(obj)
    return obj


@router.patch("/{user_id}/reactiver", response_model=schemas.UtilisateurOut, dependencies=[Depends(exiger_admin)])
def reactiver_utilisateur(user_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Utilisateur).get(user_id)
    if not obj:
        raise HTTPException(404, "Utilisateur introuvable.")
    obj.actif = True
    db.commit()
    db.refresh(obj)
    return obj
