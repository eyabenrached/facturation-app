from fastapi import APIRouter, Depends

from sqlalchemy.orm import Session



from .. import models, schemas

from ..database import get_db

from ..deps import exiger_admin, get_current_user



router = APIRouter(prefix="/parametres", tags=["Paramètres"])





def obtenir_ou_creer(db: Session) -> models.ParametresApp:

    obj = db.query(models.ParametresApp).get(1)

    if not obj:

        obj = models.ParametresApp(

            id=1, duplication_mouvements_active=True, prix_automatique_actif=True

        )

        db.add(obj)

        db.commit()

        db.refresh(obj)

    return obj





@router.get("/", response_model=schemas.ParametresOut, dependencies=[Depends(get_current_user)])

def lire_parametres(db: Session = Depends(get_db)):

    return obtenir_ou_creer(db)





@router.put("/", response_model=schemas.ParametresOut, dependencies=[Depends(exiger_admin)])

def modifier_parametres(payload: schemas.ParametresUpdate, db: Session = Depends(get_db)):

    obj = obtenir_ou_creer(db)

    donnees = payload.model_dump(exclude_unset=True)

    for champ, valeur in donnees.items():

        setattr(obj, champ, valeur)

    db.commit()

    db.refresh(obj)

    return obj