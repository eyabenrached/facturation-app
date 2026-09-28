from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_utilisateur_connecte

router = APIRouter(prefix="/reservations-hotels", tags=["Réservations hôtels"])


@router.get(
    "/",
    response_model=list[schemas.ReservationHotelOut],
    dependencies=[Depends(exiger_utilisateur_connecte)],
)
def liste_reservations(
    etat: str | None = None,
    hotel_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Vue transversale de toutes les réservations, tous dossiers confondus
    (utilisée par la page « Réservations hôtels » de la sidebar). Pour les
    ajouter/modifier/supprimer, voir les routes imbriquées sous
    /dossiers-hotels/{id}/reservations, qui restent la référence."""
    q = db.query(models.ReservationHotel).options(
        joinedload(models.ReservationHotel.hotel),
        joinedload(models.ReservationHotel.hotel_remplacement),
    )
    if etat:
        q = q.filter(models.ReservationHotel.etat == etat)
    if hotel_id:
        q = q.filter(models.ReservationHotel.hotel_id == hotel_id)
    return q.order_by(models.ReservationHotel.date_arrivee.desc()).all()
