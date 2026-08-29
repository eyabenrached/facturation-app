from datetime import date
from datetime import time as time_cls
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_utilisateur_connecte
from ..pricing import apprendre_tarif_si_absent, calculer_prix, type_vehicule_du_vehicule
from ..recap import construire_recap_transporteurs

router = APIRouter(prefix="/mouvements", tags=["Mouvements"])


@router.get("/recap-transporteurs", response_model=schemas.RecapTransporteursOut, dependencies=[Depends(exiger_utilisateur_connecte)])
def recap_transporteurs(
    date_du: date | None = None,
    date_au: date | None = None,
    db: Session = Depends(get_db),
):
    """Nombre de mouvements (chrono) par heure et par transporteur choisi, sur la période."""
    q = db.query(models.Mouvement).options(joinedload(models.Mouvement.transporteur))
    if date_du:
        q = q.filter(models.Mouvement.date >= date_du)
    if date_au:
        q = q.filter(models.Mouvement.date <= date_au)
    return construire_recap_transporteurs(q.all())


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
        h, m = heure.split(":")[:2]
        q = q.filter(models.Mouvement.heure == time_cls(int(h), int(m)))
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

    type_vehicule = type_vehicule_du_vehicule(db, payload.vehicule_id)
    prix = payload.prix_applique
    if prix is None:
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
    # Apprentissage auto : si ce client + circuit n'a encore aucun tarif,
    # le prix saisi ici devient le tarif de référence pour la prochaine fois.
    apprendre_tarif_si_absent(db, payload.client_id, payload.circuit_id, payload.heure, type_vehicule, prix)
    db.commit()
    db.refresh(obj)
    return obj


@router.post("/dupliquer-groupe", response_model=list[schemas.MouvementOut], status_code=201, dependencies=[Depends(exiger_utilisateur_connecte)])
def dupliquer_groupe(payload: schemas.MouvementsDupliquerGroupeIn, db: Session = Depends(get_db)):
    """Duplique une sélection de mouvements (ex : mouvements à refaire) à une nouvelle date.
    Les mouvements d'origine restent inchangés ; les copies créées sont toujours non facturées."""
    if not payload.ids:
        raise HTTPException(400, "Aucun mouvement sélectionné.")

    objs = db.query(models.Mouvement).filter(models.Mouvement.id.in_(payload.ids)).all()
    trouves = {o.id for o in objs}
    manquants = set(payload.ids) - trouves
    if manquants:
        raise HTTPException(404, f"Mouvement(s) introuvable(s) : {sorted(manquants)}")

    nouveaux = []
    for obj in objs:
        type_vehicule = type_vehicule_du_vehicule(db, obj.vehicule_id)
        # Le prix est récupéré depuis le tarif client reconnu au moment de la
        # duplication (et non recopié tel quel depuis le mouvement d'origine) :
        # si un tarif a changé entre-temps, la copie reflète le tarif à jour.
        prix = calculer_prix(db, obj.client_id, obj.circuit_id, obj.heure, type_vehicule)
        nouveaux.append(models.Mouvement(
            date=payload.nouvelle_date,
            heure=obj.heure,
            client_id=obj.client_id,
            circuit_id=obj.circuit_id,
            chauffeur_id=obj.chauffeur_id,
            vehicule_id=obj.vehicule_id,
            transporteur_id=obj.transporteur_id,
            nb_personnes=obj.nb_personnes,
            prix_applique=prix,
        ))
    db.add_all(nouveaux)
    db.commit()
    for n in nouveaux:
        db.refresh(n)
    return nouveaux


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

    type_vehicule = type_vehicule_du_vehicule(db, payload.vehicule_id)
    prix = payload.prix_applique
    if prix is None:
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

    # Apprentissage auto : même logique qu'à la création.
    apprendre_tarif_si_absent(db, payload.client_id, payload.circuit_id, payload.heure, type_vehicule, prix)
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