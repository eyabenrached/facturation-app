from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_utilisateur_connecte
from ..pricing import calculer_prix, type_vehicule_du_vehicule

router = APIRouter(prefix="/mouvements", tags=["Mouvements"])


@router.get("/", response_model=list[schemas.MouvementOut], dependencies=[Depends(exiger_utilisateur_connecte)])
def liste_mouvements(
    date_du: date | None = None,
    date_au: date | None = None,
    client_id: int | None = None,
    circuit_id: int | None = None,
    heure: str | None = None,
    transporteur_id: int | None = None,
    chauffeur_id: int | None = None,
    statut: str | None = None,  # "facture" | "non_facture"
    db: Session = Depends(get_db),
):
    q = db.query(models.Mouvement).options(
        joinedload(models.Mouvement.client),
        joinedload(models.Mouvement.circuit),
        joinedload(models.Mouvement.chauffeur),
        joinedload(models.Mouvement.vehicule).joinedload(models.Vehicule.agence),
        joinedload(models.Mouvement.transporteur),
    )
    if date_du:
        q = q.filter(models.Mouvement.date >= date_du)
    if date_au:
        q = q.filter(models.Mouvement.date <= date_au)
    if client_id:
        q = q.filter(models.Mouvement.client_id == client_id)
    if circuit_id:
        q = q.filter(models.Mouvement.circuit_id == circuit_id)
    if heure:
        q = q.filter(models.Mouvement.heure == heure)
    if transporteur_id:
        q = q.filter(models.Mouvement.transporteur_id == transporteur_id)
    if chauffeur_id:
        q = q.filter(models.Mouvement.chauffeur_id == chauffeur_id)
    if statut == "facture":
        q = q.filter(models.Mouvement.facture_id.isnot(None))
    elif statut == "non_facture":
        q = q.filter(models.Mouvement.facture_id.is_(None))
    return q.order_by(models.Mouvement.date, models.Mouvement.heure).all()


@router.post("/", response_model=schemas.MouvementOut, status_code=201, dependencies=[Depends(exiger_utilisateur_connecte)])
def creer_mouvement(payload: schemas.MouvementCreate, db: Session = Depends(get_db)):
    if not db.query(models.Client).get(payload.client_id):
        raise HTTPException(400, "Client introuvable.")
    if not db.query(models.Circuit).get(payload.circuit_id):
        raise HTTPException(400, "Circuit introuvable.")

    prix = payload.prix_applique
    if prix is None:
        type_vehicule = type_vehicule_du_vehicule(db, payload.vehicule_id)
        prix = calculer_prix(db, payload.client_id, payload.circuit_id, payload.heure, type_vehicule)

    obj = models.Mouvement(
        date=payload.date,
        heure=payload.heure,
        client_id=payload.client_id,
        circuit_id=payload.circuit_id,
        chauffeur_id=payload.chauffeur_id,
        vehicule_id=payload.vehicule_id,
        transporteur_id=payload.transporteur_id,
        nb_personnes=payload.nb_personnes,
        prix_applique=prix,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{mouvement_id}", response_model=schemas.MouvementOut, dependencies=[Depends(exiger_utilisateur_connecte)])
def modifier_mouvement(mouvement_id: int, payload: schemas.MouvementCreate, db: Session = Depends(get_db)):
    obj = db.query(models.Mouvement).get(mouvement_id)
    if not obj:
        raise HTTPException(404, "Mouvement introuvable.")
    if obj.facture_id is not None:
        raise HTTPException(400, "Ce mouvement est déjà facturé : modification bloquée.")
    if not db.query(models.Client).get(payload.client_id):
        raise HTTPException(400, "Client introuvable.")
    if not db.query(models.Circuit).get(payload.circuit_id):
        raise HTTPException(400, "Circuit introuvable.")

    prix = payload.prix_applique
    if prix is None:
        type_vehicule = type_vehicule_du_vehicule(db, payload.vehicule_id)
        prix = calculer_prix(db, payload.client_id, payload.circuit_id, payload.heure, type_vehicule)

    obj.date = payload.date
    obj.heure = payload.heure
    obj.client_id = payload.client_id
    obj.circuit_id = payload.circuit_id
    obj.chauffeur_id = payload.chauffeur_id
    obj.vehicule_id = payload.vehicule_id
    obj.transporteur_id = payload.transporteur_id
    obj.nb_personnes = payload.nb_personnes
    obj.prix_applique = prix

    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{mouvement_id}", status_code=204, dependencies=[Depends(exiger_utilisateur_connecte)])
def supprimer_mouvement(mouvement_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Mouvement).get(mouvement_id)
    if not obj:
        raise HTTPException(404, "Mouvement introuvable.")
    if obj.facture_id is not None:
        raise HTTPException(400, "Ce mouvement est déjà facturé : suppression bloquée.")
    db.delete(obj)
    db.commit()


@router.get("/prix-suggere", dependencies=[Depends(exiger_utilisateur_connecte)])
def prix_suggere(
    client_id: int,
    circuit_id: int,
    heure: str,
    vehicule_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Aide au formulaire : renvoie le prix calculé avant même de créer le mouvement."""
    from datetime import time as time_cls
    h, m = heure.split(":")[:2]
    heure_obj = time_cls(int(h), int(m))
    type_vehicule = type_vehicule_du_vehicule(db, vehicule_id)
    prix = calculer_prix(db, client_id, circuit_id, heure_obj, type_vehicule)
    return {"prix_suggere": prix, "type_vehicule": type_vehicule.value}