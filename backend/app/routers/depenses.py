from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_admin

router = APIRouter(prefix="/depenses", tags=["Dépenses"])

# Les dépenses touchent directement à la rentabilité de l'entreprise :
# réservées aux administrateurs, comme pour les factures.


@router.get("/", response_model=list[schemas.DepenseOut], dependencies=[Depends(exiger_admin)])
def liste_depenses(
    date_du: str | None = None,
    date_au: str | None = None,
    categorie: models.CategorieDepense | None = None,
    vehicule_id: int | None = None,
    chauffeur_id: int | None = None,
    transporteur_id: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Depense).options(
        joinedload(models.Depense.vehicule),
        joinedload(models.Depense.chauffeur),
        joinedload(models.Depense.transporteur),
    )
    if date_du:
        q = q.filter(models.Depense.date >= date_du)
    if date_au:
        q = q.filter(models.Depense.date <= date_au)
    if categorie:
        q = q.filter(models.Depense.categorie == categorie)
    if vehicule_id:
        q = q.filter(models.Depense.vehicule_id == vehicule_id)
    if chauffeur_id:
        q = q.filter(models.Depense.chauffeur_id == chauffeur_id)
    if transporteur_id:
        q = q.filter(models.Depense.transporteur_id == transporteur_id)
    return q.order_by(models.Depense.date.desc()).all()


@router.post("/", response_model=schemas.DepenseOut, status_code=201, dependencies=[Depends(exiger_admin)])
def creer_depense(payload: schemas.DepenseCreate, db: Session = Depends(get_db)):
    obj = models.Depense(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{depense_id}", response_model=schemas.DepenseOut, dependencies=[Depends(exiger_admin)])
def modifier_depense(depense_id: int, payload: schemas.DepenseCreate, db: Session = Depends(get_db)):
    obj = db.query(models.Depense).get(depense_id)
    if not obj:
        raise HTTPException(404, "Dépense introuvable.")
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{depense_id}", status_code=204, dependencies=[Depends(exiger_admin)])
def supprimer_depense(depense_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Depense).get(depense_id)
    if not obj:
        raise HTTPException(404, "Dépense introuvable.")
    db.delete(obj)
    db.commit()
