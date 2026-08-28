from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_admin, exiger_utilisateur_connecte

router = APIRouter(prefix="/clients", tags=["Clients"])


@router.get("/", response_model=list[schemas.ClientOut], dependencies=[Depends(exiger_utilisateur_connecte)])
def liste_clients(recherche: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Client)
    if recherche:
        like = f"%{recherche}%"
        q = q.filter(
            (models.Client.nom_societe.ilike(like)) | (models.Client.responsable.ilike(like))
        )
    return q.order_by(models.Client.nom_societe).all()


@router.post("/", response_model=schemas.ClientOut, status_code=201, dependencies=[Depends(exiger_admin)])
def creer_client(payload: schemas.ClientCreate, db: Session = Depends(get_db)):
    if db.query(models.Client).filter(models.Client.nom_societe == payload.nom_societe).first():
        raise HTTPException(400, "Un client avec ce nom de société existe déjà.")
    obj = models.Client(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{client_id}", response_model=schemas.ClientOut, dependencies=[Depends(exiger_admin)])
def modifier_client(client_id: int, payload: schemas.ClientCreate, db: Session = Depends(get_db)):
    obj = db.query(models.Client).get(client_id)
    if not obj:
        raise HTTPException(404, "Client introuvable.")
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{client_id}", status_code=204, dependencies=[Depends(exiger_admin)])
def supprimer_client(client_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Client).get(client_id)
    if not obj:
        raise HTTPException(404, "Client introuvable.")
    if db.query(models.Mouvement).filter(models.Mouvement.client_id == client_id).first():
        raise HTTPException(400, "Ce client est lié à des mouvements/factures existants : suppression bloquée.")
    db.delete(obj)
    db.commit()


@router.get("/{client_id}/fiche", response_model=schemas.ClientFicheOut, dependencies=[Depends(exiger_utilisateur_connecte)])
def fiche_client(client_id: int, db: Session = Depends(get_db)):
    """Vue détaillée d'un client : tarifs spécifiques, historique de mouvements,
    factures et chiffre d'affaires cumulé (facturé / encaissé / impayé)."""
    client = db.query(models.Client).get(client_id)
    if not client:
        raise HTTPException(404, "Client introuvable.")

    tarifs = (
        db.query(models.TarifClient)
        .filter(models.TarifClient.client_id == client_id)
        .all()
    )
    mouvements = (
        db.query(models.Mouvement)
        .filter(models.Mouvement.client_id == client_id)
        .order_by(models.Mouvement.date.desc(), models.Mouvement.heure.desc())
        .all()
    )
    factures = (
        db.query(models.Facture)
        .filter(models.Facture.client_id == client_id)
        .order_by(models.Facture.date_debut.desc())
        .all()
    )

    ca_facture = sum(float(f.montant_ttc) for f in factures)
    ca_encaisse = sum(float(f.montant_ttc) for f in factures if f.statut == models.StatutFacture.payee)
    ca_impaye = sum(
        float(f.montant_ttc)
        for f in factures
        if f.statut in (models.StatutFacture.impayee, models.StatutFacture.partielle)
    )

    return schemas.ClientFicheOut(
        client=client,
        tarifs=tarifs,
        mouvements=mouvements,
        factures=factures,
        nb_mouvements=len(mouvements),
        chiffre_affaires_facture=round(ca_facture, 3),
        chiffre_affaires_encaisse=round(ca_encaisse, 3),
        chiffre_affaires_impaye=round(ca_impaye, 3),
    )