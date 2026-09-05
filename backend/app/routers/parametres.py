from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_admin, exiger_utilisateur_connecte

router = APIRouter(prefix="/parametres", tags=["Paramètres"])


def _obtenir_ou_creer(db: Session) -> models.Parametres:
    obj = db.query(models.Parametres).first()
    if not obj:
        obj = models.Parametres(duplication_mouvements_active=True)
        db.add(obj)
        db.commit()
        db.refresh(obj)
    return obj


@router.get("/", response_model=schemas.ParametresOut, dependencies=[Depends(exiger_utilisateur_connecte)])
def lire_parametres(db: Session = Depends(get_db)):
    return _obtenir_ou_creer(db)


@router.put("/", response_model=schemas.ParametresOut, dependencies=[Depends(exiger_admin)])
def modifier_parametres(payload: schemas.ParametresUpdate, db: Session = Depends(get_db)):
    obj = _obtenir_ou_creer(db)
    if payload.duplication_mouvements_active is not None:
        obj.duplication_mouvements_active = payload.duplication_mouvements_active
    db.commit()
    db.refresh(obj)
    return obj