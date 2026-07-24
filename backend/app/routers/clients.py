from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_admin, exiger_utilisateur_connecte

router = APIRouter(prefix="/clients", tags=["Clients"])


@router.get("/", response_model=list[schemas.ClientOut], dependencies=[Depends(exiger_utilisateur_connecte)])
def liste_clients(recherche: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Client)
    if recherche:
        like = f"%{recherche}%"
        q = q.filter(
            (models.Client.nom_societe.ilike(like)) | (models.Client.responsable.ilike(like))
        )
    return q.order_by(models.Client.nom_societe).all()


@router.post("/", response_model=schemas.ClientOut, status_code=201, dependencies=[Depends(exiger_admin)])
def creer_client(payload: schemas.ClientCreate, db: Session = Depends(get_db)):
    if db.query(models.Client).filter(models.Client.nom_societe == payload.nom_societe).first():
        raise HTTPException(400, "Un client avec ce nom de société existe déjà.")
    obj = models.Client(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{client_id}", response_model=schemas.ClientOut, dependencies=[Depends(exiger_admin)])
def modifier_client(client_id: int, payload: schemas.ClientCreate, db: Session = Depends(get_db)):
    obj = db.query(models.Client).get(client_id)
    if not obj:
        raise HTTPException(404, "Client introuvable.")
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{client_id}", status_code=204, dependencies=[Depends(exiger_admin)])
def supprimer_client(client_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Client).get(client_id)
    if not obj:
        raise HTTPException(404, "Client introuvable.")
    if db.query(models.Mouvement).filter(models.Mouvement.client_id == client_id).first():
        raise HTTPException(400, "Ce client est lié à des mouvements/factures existants : suppression bloquée.")
    db.delete(obj)
    db.commit()
