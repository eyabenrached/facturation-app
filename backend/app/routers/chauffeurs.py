from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_admin, exiger_utilisateur_connecte

router = APIRouter(prefix="/chauffeurs", tags=["Chauffeurs"])


@router.get("/", response_model=list[schemas.ChauffeurOut], dependencies=[Depends(exiger_utilisateur_connecte)])
def liste_chauffeurs(recherche: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Chauffeur)
    if recherche:
        like = f"%{recherche}%"
        q = q.filter(
            (models.Chauffeur.nom.ilike(like))
            | (models.Chauffeur.prenom.ilike(like))
            | (models.Chauffeur.cin.ilike(like))
        )
    return q.order_by(models.Chauffeur.nom).all()


@router.post("/", response_model=schemas.ChauffeurOut, status_code=201, dependencies=[Depends(exiger_admin)])
def creer_chauffeur(payload: schemas.ChauffeurCreate, db: Session = Depends(get_db)):
    if db.query(models.Chauffeur).filter(models.Chauffeur.cin == payload.cin).first():
        raise HTTPException(400, "Un chauffeur avec ce CIN existe déjà.")
    obj = models.Chauffeur(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{chauffeur_id}", response_model=schemas.ChauffeurOut, dependencies=[Depends(exiger_admin)])
def modifier_chauffeur(chauffeur_id: int, payload: schemas.ChauffeurCreate, db: Session = Depends(get_db)):
    obj = db.query(models.Chauffeur).get(chauffeur_id)
    if not obj:
        raise HTTPException(404, "Chauffeur introuvable.")
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{chauffeur_id}", status_code=204, dependencies=[Depends(exiger_admin)])
def supprimer_chauffeur(chauffeur_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Chauffeur).get(chauffeur_id)
    if not obj:
        raise HTTPException(404, "Chauffeur introuvable.")
    if db.query(models.Mouvement).filter(models.Mouvement.chauffeur_id == chauffeur_id).first():
        raise HTTPException(400, "Ce chauffeur est lié à des mouvements existants : suppression bloquée.")
    db.delete(obj)
    db.commit()
