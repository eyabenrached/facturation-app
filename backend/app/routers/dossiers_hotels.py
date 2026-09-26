from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_admin, exiger_utilisateur_connecte
from ..pdf_hotels import generer_dossier_hotel_pdf

router = APIRouter(prefix="/dossiers-hotels", tags=["Dossiers hôtels"])


def _options_chargement():
    return (
        joinedload(models.DossierHotel.agence),
        joinedload(models.DossierHotel.circuit),
        joinedload(models.DossierHotel.reservations).joinedload(models.ReservationHotel.hotel),
        joinedload(models.DossierHotel.reservations).joinedload(models.ReservationHotel.hotel_remplacement),
    )


def _suggerer_numero(db: Session) -> str:
    """Même logique que la numérotation des factures : DOS-<année>-0001."""
    annee = date.today().year
    prefixe = f"DOS-{annee}-"
    nb = (
        db.query(models.DossierHotel)
        .filter(models.DossierHotel.numero_dossier.like(f"{prefixe}%"))
        .count()
    )
    return f"{prefixe}{nb + 1:04d}"


def _get_dossier_ou_404(dossier_id: int, db: Session) -> models.DossierHotel:
    dossier = (
        db.query(models.DossierHotel)
        .options(*_options_chargement())
        .filter(models.DossierHotel.id == dossier_id)
        .first()
    )
    if not dossier:
        raise HTTPException(404, "Dossier hôtelier introuvable.")
    return dossier


@router.get("/next-numero", response_model=schemas.NextNumeroDossierOut, dependencies=[Depends(exiger_utilisateur_connecte)])
def next_numero(db: Session = Depends(get_db)):
    return {"numero_suggere": _suggerer_numero(db)}


@router.get("/", response_model=list[schemas.DossierHotelOut], dependencies=[Depends(exiger_utilisateur_connecte)])
def liste_dossiers(
    agence_id: int | None = None,
    statut: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.DossierHotel).options(*_options_chargement())
    if agence_id:
        q = q.filter(models.DossierHotel.agence_id == agence_id)
    dossiers = q.order_by(models.DossierHotel.date_creation.desc()).all()
    # Le statut global est calculé en Python (propriété du modèle) : le
    # filtre ne peut donc pas se faire en SQL, on filtre après coup.
    if statut:
        dossiers = [d for d in dossiers if d.statut_global == statut]
    return dossiers


@router.get("/{dossier_id}", response_model=schemas.DossierHotelOut, dependencies=[Depends(exiger_utilisateur_connecte)])
def obtenir_dossier(dossier_id: int, db: Session = Depends(get_db)):
    return _get_dossier_ou_404(dossier_id, db)


@router.post("/", response_model=schemas.DossierHotelOut, status_code=201, dependencies=[Depends(exiger_utilisateur_connecte)])
def creer_dossier(payload: schemas.DossierHotelCreate, db: Session = Depends(get_db)):
    if payload.agence_id and not db.query(models.Agence).get(payload.agence_id):
        raise HTTPException(400, "Agence introuvable.")
    if payload.circuit_id and not db.query(models.Circuit).get(payload.circuit_id):
        raise HTTPException(400, "Circuit introuvable.")

    obj = models.DossierHotel(numero_dossier=_suggerer_numero(db), **payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _get_dossier_ou_404(obj.id, db)


@router.put("/{dossier_id}", response_model=schemas.DossierHotelOut, dependencies=[Depends(exiger_utilisateur_connecte)])
def modifier_dossier(dossier_id: int, payload: schemas.DossierHotelCreate, db: Session = Depends(get_db)):
    obj = db.query(models.DossierHotel).get(dossier_id)
    if not obj:
        raise HTTPException(404, "Dossier hôtelier introuvable.")
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return _get_dossier_ou_404(dossier_id, db)


@router.delete("/{dossier_id}", status_code=204, dependencies=[Depends(exiger_admin)])
def supprimer_dossier(dossier_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.DossierHotel).get(dossier_id)
    if not obj:
        raise HTTPException(404, "Dossier hôtelier introuvable.")
    db.delete(obj)  # cascade="all, delete-orphan" supprime aussi ses réservations
    db.commit()


@router.get("/{dossier_id}/pdf", dependencies=[Depends(exiger_utilisateur_connecte)])
def export_pdf(dossier_id: int, db: Session = Depends(get_db)):
    dossier = _get_dossier_ou_404(dossier_id, db)
    pdf_bytes = generer_dossier_hotel_pdf(dossier)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{dossier.numero_dossier}.pdf"'},
    )


# ---------- Réservations hôtelières imbriquées dans un dossier ----------

@router.post(
    "/{dossier_id}/reservations",
    response_model=schemas.DossierHotelOut,
    status_code=201,
    dependencies=[Depends(exiger_utilisateur_connecte)],
)
def ajouter_reservation(dossier_id: int, payload: schemas.ReservationHotelCreate, db: Session = Depends(get_db)):
    dossier = db.query(models.DossierHotel).get(dossier_id)
    if not dossier:
        raise HTTPException(404, "Dossier hôtelier introuvable.")
    if not db.query(models.Hotel).get(payload.hotel_id):
        raise HTTPException(400, "Hôtel introuvable.")
    if payload.date_depart <= payload.date_arrivee:
        raise HTTPException(400, "La date de départ doit être postérieure à la date d'arrivée.")

    obj = models.ReservationHotel(dossier_id=dossier_id, **payload.model_dump())
    db.add(obj)
    db.commit()
    return _get_dossier_ou_404(dossier_id, db)


@router.put(
    "/{dossier_id}/reservations/{reservation_id}",
    response_model=schemas.DossierHotelOut,
    dependencies=[Depends(exiger_utilisateur_connecte)],
)
def modifier_reservation(
    dossier_id: int, reservation_id: int, payload: schemas.ReservationHotelCreate, db: Session = Depends(get_db)
):
    obj = (
        db.query(models.ReservationHotel)
        .filter(models.ReservationHotel.id == reservation_id, models.ReservationHotel.dossier_id == dossier_id)
        .first()
    )
    if not obj:
        raise HTTPException(404, "Réservation introuvable pour ce dossier.")
    if payload.date_depart <= payload.date_arrivee:
        raise HTTPException(400, "La date de départ doit être postérieure à la date d'arrivée.")
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    return _get_dossier_ou_404(dossier_id, db)


@router.delete(
    "/{dossier_id}/reservations/{reservation_id}",
    response_model=schemas.DossierHotelOut,
    dependencies=[Depends(exiger_utilisateur_connecte)],
)
def supprimer_reservation(dossier_id: int, reservation_id: int, db: Session = Depends(get_db)):
    obj = (
        db.query(models.ReservationHotel)
        .filter(models.ReservationHotel.id == reservation_id, models.ReservationHotel.dossier_id == dossier_id)
        .first()
    )
    if not obj:
        raise HTTPException(404, "Réservation introuvable pour ce dossier.")
    db.delete(obj)
    db.commit()
    return _get_dossier_ou_404(dossier_id, db)