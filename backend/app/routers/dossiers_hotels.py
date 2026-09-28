from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_admin, exiger_utilisateur_connecte, get_current_user
from ..pdf_hotels import LABELS_ETAT, generer_dossier_hotel_pdf

router = APIRouter(prefix="/dossiers-hotels", tags=["Dossiers hôtels"])


def _options_chargement():
    return (
        joinedload(models.DossierHotel.reservations).joinedload(models.ReservationHotel.hotel),
        joinedload(models.DossierHotel.reservations).joinedload(models.ReservationHotel.hotel_remplacement),
        selectinload(models.DossierHotel.historique).joinedload(models.HistoriqueDossierHotel.utilisateur),
    )


def _journaliser(db: Session, dossier_id: int, action: str, details: str | None, user) -> None:
    """Ajoute une ligne au journal du dossier (commit fait par l'appelant)."""
    db.add(models.HistoriqueDossierHotel(
        dossier_id=dossier_id,
        action=action[:100],
        details=details,
        utilisateur_id=getattr(user, "id", None),
    ))


def _nettoyer_textes(donnees: dict) -> dict:
    """Agence / circuit saisis à la main : espaces retirés, vide → None."""
    for cle in ("agence_nom", "circuit_nom"):
        v = donnees.get(cle)
        donnees[cle] = v.strip() if isinstance(v, str) and v.strip() else None
    return donnees


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
    agence: str | None = None,
    statut: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.DossierHotel).options(*_options_chargement())
    if agence and agence.strip():
        q = q.filter(models.DossierHotel.agence_nom.ilike(f"%{agence.strip()}%"))
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
def creer_dossier(payload: schemas.DossierHotelCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    donnees = _nettoyer_textes(payload.model_dump())
    if not donnees.get("agence_nom"):
        raise HTTPException(400, "Merci de saisir le nom de l'agence.")

    obj = models.DossierHotel(numero_dossier=_suggerer_numero(db), **donnees)
    db.add(obj)
    db.flush()
    _journaliser(db, obj.id, "Création du dossier", obj.numero_dossier, user)
    db.commit()
    db.refresh(obj)
    return _get_dossier_ou_404(obj.id, db)


@router.put("/{dossier_id}", response_model=schemas.DossierHotelOut, dependencies=[Depends(exiger_utilisateur_connecte)])
def modifier_dossier(dossier_id: int, payload: schemas.DossierHotelCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    obj = db.query(models.DossierHotel).get(dossier_id)
    if not obj:
        raise HTTPException(404, "Dossier hôtelier introuvable.")
    donnees = _nettoyer_textes(payload.model_dump())
    if not donnees.get("agence_nom"):
        raise HTTPException(400, "Merci de saisir le nom de l'agence.")
    for k, v in donnees.items():
        setattr(obj, k, v)
    _journaliser(db, dossier_id, "Modification du dossier", None, user)
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
def ajouter_reservation(dossier_id: int, payload: schemas.ReservationHotelCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    dossier = db.query(models.DossierHotel).get(dossier_id)
    if not dossier:
        raise HTTPException(404, "Dossier hôtelier introuvable.")
    if not db.query(models.Hotel).get(payload.hotel_id):
        raise HTTPException(400, "Hôtel introuvable.")
    if payload.date_depart <= payload.date_arrivee:
        raise HTTPException(400, "La date de départ doit être postérieure à la date d'arrivée.")

    obj = models.ReservationHotel(dossier_id=dossier_id, **payload.model_dump())
    db.add(obj)
    hotel = db.query(models.Hotel).get(payload.hotel_id)
    _journaliser(db, dossier_id, f"Ajout de {hotel.nom}" if hotel else "Ajout d'une réservation", None, user)
    db.commit()
    return _get_dossier_ou_404(dossier_id, db)


@router.put(
    "/{dossier_id}/reservations/{reservation_id}",
    response_model=schemas.DossierHotelOut,
    dependencies=[Depends(exiger_utilisateur_connecte)],
)
def modifier_reservation(
    dossier_id: int, reservation_id: int, payload: schemas.ReservationHotelCreate,
    db: Session = Depends(get_db), user=Depends(get_current_user),
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
    ancien_etat = getattr(obj.etat, "value", obj.etat)
    ancien_remplacement = obj.hotel_remplacement_id
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    nom = obj.hotel.nom if obj.hotel else f"réservation n°{reservation_id}"
    nouvel_etat = getattr(payload.etat, "value", payload.etat)
    modifs = []
    if nouvel_etat != ancien_etat:
        modifs.append(f"Changement statut {nom} : {LABELS_ETAT.get(nouvel_etat, nouvel_etat)}")
    if payload.hotel_remplacement_id != ancien_remplacement:
        modifs.append(f"Modification hôtel remplacement ({nom})")
    for texte in modifs or [f"Modification de {nom}"]:
        _journaliser(db, dossier_id, texte, None, user)
    db.commit()
    return _get_dossier_ou_404(dossier_id, db)


@router.delete(
    "/{dossier_id}/reservations/{reservation_id}",
    response_model=schemas.DossierHotelOut,
    dependencies=[Depends(exiger_utilisateur_connecte)],
)
def supprimer_reservation(dossier_id: int, reservation_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    obj = (
        db.query(models.ReservationHotel)
        .filter(models.ReservationHotel.id == reservation_id, models.ReservationHotel.dossier_id == dossier_id)
        .first()
    )
    if not obj:
        raise HTTPException(404, "Réservation introuvable pour ce dossier.")
    nom = obj.hotel.nom if obj.hotel else f"réservation n°{reservation_id}"
    db.delete(obj)
    _journaliser(db, dossier_id, f"Suppression de {nom}", None, user)
    db.commit()
    return _get_dossier_ou_404(dossier_id, db)