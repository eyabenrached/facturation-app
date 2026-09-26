from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_admin, exiger_utilisateur_connecte

router = APIRouter(prefix="/hotels", tags=["Hôtels"])


@router.get("/", response_model=list[schemas.HotelOut], dependencies=[Depends(exiger_utilisateur_connecte)])
def liste_hotels(
    recherche: str | None = None,
    ville: str | None = None,
    actif: bool | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Hotel)
    if recherche:
        terme = f"%{recherche}%"
        q = q.filter(
            models.Hotel.nom.ilike(terme)
            | models.Hotel.ville.ilike(terme)
            | models.Hotel.pays.ilike(terme)
        )
    if ville:
        q = q.filter(models.Hotel.ville.ilike(f"%{ville}%"))
    if actif is not None:
        q = q.filter(models.Hotel.actif == actif)
    return q.order_by(models.Hotel.nom).all()


@router.get("/{hotel_id}", response_model=schemas.HotelOut, dependencies=[Depends(exiger_utilisateur_connecte)])
def obtenir_hotel(hotel_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Hotel).get(hotel_id)
    if not obj:
        raise HTTPException(404, "Hôtel introuvable.")
    return obj


@router.post("/", response_model=schemas.HotelOut, status_code=201, dependencies=[Depends(exiger_utilisateur_connecte)])
def creer_hotel(payload: schemas.HotelCreate, db: Session = Depends(get_db)):
    obj = models.Hotel(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{hotel_id}", response_model=schemas.HotelOut, dependencies=[Depends(exiger_admin)])
def modifier_hotel(hotel_id: int, payload: schemas.HotelCreate, db: Session = Depends(get_db)):
    obj = db.query(models.Hotel).get(hotel_id)
    if not obj:
        raise HTTPException(404, "Hôtel introuvable.")
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{hotel_id}", status_code=204, dependencies=[Depends(exiger_admin)])
def supprimer_hotel(hotel_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Hotel).get(hotel_id)
    if not obj:
        raise HTTPException(404, "Hôtel introuvable.")
    lie_a_une_reservation = (
        db.query(models.ReservationHotel)
        .filter(
            (models.ReservationHotel.hotel_id == hotel_id)
            | (models.ReservationHotel.hotel_remplacement_id == hotel_id)
        )
        .first()
    )
    if lie_a_une_reservation:
        raise HTTPException(
            400,
            "Cet hôtel est lié à des réservations existantes : suppression bloquée. "
            "Vous pouvez le passer en inactif à la place.",
        )
    db.delete(obj)
    db.commit()