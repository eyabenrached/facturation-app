from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_admin, exiger_utilisateur_connecte

router = APIRouter(prefix="/circuits", tags=["Circuits"])


@router.get("/", response_model=list[schemas.CircuitOut], dependencies=[Depends(exiger_utilisateur_connecte)])
def liste_circuits(db: Session = Depends(get_db)):
    return db.query(models.Circuit).order_by(models.Circuit.point_depart).all()


@router.post("/", response_model=schemas.CircuitOut, status_code=201, dependencies=[Depends(exiger_utilisateur_connecte)])
def creer_circuit(payload: schemas.CircuitCreate, db: Session = Depends(get_db)):
    obj = models.Circuit(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{circuit_id}", response_model=schemas.CircuitOut, dependencies=[Depends(exiger_admin)])
def modifier_circuit(circuit_id: int, payload: schemas.CircuitCreate, db: Session = Depends(get_db)):
    obj = db.query(models.Circuit).get(circuit_id)
    if not obj:
        raise HTTPException(404, "Circuit introuvable.")
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{circuit_id}", status_code=204, dependencies=[Depends(exiger_admin)])
def supprimer_circuit(circuit_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Circuit).get(circuit_id)
    if not obj:
        raise HTTPException(404, "Circuit introuvable.")
    if db.query(models.Mouvement).filter(models.Mouvement.circuit_id == circuit_id).first():
        raise HTTPException(400, "Ce circuit est lié à des mouvements existants : suppression bloquée.")
    db.delete(obj)
    db.commit()


# ---------- Tarifs spécifiques client+circuit (surcharge de prix) ----------
@router.get("/tarifs/", response_model=list[schemas.TarifClientOut], dependencies=[Depends(exiger_admin)])
def liste_tarifs(client_id: int | None = None, circuit_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(models.TarifClient)
    if client_id:
        q = q.filter(models.TarifClient.client_id == client_id)
    if circuit_id:
        q = q.filter(models.TarifClient.circuit_id == circuit_id)
    return q.all()


@router.post("/tarifs/", response_model=schemas.TarifClientOut, status_code=201, dependencies=[Depends(exiger_admin)])
def creer_tarif(payload: schemas.TarifClientCreate, db: Session = Depends(get_db)):
    obj = models.TarifClient(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/tarifs/{tarif_id}", status_code=204, dependencies=[Depends(exiger_admin)])
def supprimer_tarif(tarif_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.TarifClient).get(tarif_id)
    if not obj:
        raise HTTPException(404, "Tarif introuvable.")
    db.delete(obj)
    db.commit()


@router.post("/tarifs/supprimer-groupe", status_code=200, dependencies=[Depends(exiger_admin)])
def supprimer_tarifs_groupe(payload: schemas.TarifsSuppressionGroupee, db: Session = Depends(get_db)):
    if not payload.ids:
        raise HTTPException(400, "Aucun tarif sélectionné.")
    nb = (
        db.query(models.TarifClient)
        .filter(models.TarifClient.id.in_(payload.ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"supprimes": nb}


@router.put("/tarifs/{tarif_id}", response_model=schemas.TarifClientOut, dependencies=[Depends(exiger_admin)])
def modifier_tarif(tarif_id: int, payload: schemas.TarifClientCreate, db: Session = Depends(get_db)):
    obj = db.query(models.TarifClient).get(tarif_id)
    if not obj:
        raise HTTPException(404, "Tarif introuvable.")
    
    # Mettre à jour les champs
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    
    db.commit()
    db.refresh(obj)
    return obj