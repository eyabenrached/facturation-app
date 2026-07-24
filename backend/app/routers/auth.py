from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import verify_password, creer_access_token
from ..deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentification"])


@router.post("/login", response_model=schemas.TokenOut)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.Utilisateur).filter(models.Utilisateur.email == payload.email).first()
    if not user or not user.actif or not verify_password(payload.password, user.mot_de_passe_hash):
        raise HTTPException(401, "E-mail ou mot de passe incorrect.")

    token = creer_access_token({"sub": str(user.id), "role": user.role.value})
    return schemas.TokenOut(access_token=token, utilisateur=user)


@router.get("/me", response_model=schemas.UtilisateurOut)
def me(user: models.Utilisateur = Depends(get_current_user)):
    return user
