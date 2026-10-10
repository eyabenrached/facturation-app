from datetime import date
from datetime import time as time_cls
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_utilisateur_connecte
from ..pricing import apprendre_tarif_si_absent, calculer_prix, determiner_prix_mouvement, type_vehicule_du_vehicule
from ..recap import construire_recap_transporteurs

router = APIRouter(prefix="/mouvements", tags=["Mouvements"])


@router.get("/recap-transporteurs", response_model=schemas.RecapTransporteursOut, dependencies=[Depends(exiger_utilisateur_connecte)])
def recap_transporteurs(
    date_du: date | None = None,
    date_au: date | None = None,
    db: Session = Depends(get_db),
):
    """Nombre de mouvements (chrono) par heure et par transporteur choisi, sur la période."""
    return construire_recap_transporteurs(db, models.Mouvement, date_du, date_au)


@router.get("/", response_model=list[schemas.MouvementOut], dependencies=[Depends(exiger_utilisateur_connecte)])
def liste_mouvements(
    date_du: date | None = None,
    date_au: date | None = None,
    client_id: int | None = None,
    circuit_id: int | None = None,
    heure: str | None = None,
    transporteur_id: int | None = None,
    chauffeur_id: int | None = None,
    type_vehicule: models.TypeVehicule | None = None,  # mini_bus | microbus | quatre_quatre
    prix_min: float | None = None,
    prix_max: float | None = None,
    statut: str | None = None,  # "facture" | "non_facture"
    remplacement: bool | None = None,  # True : uniquement les véhicules de remplacement
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
    if type_vehicule or remplacement:
        q = q.join(models.Vehicule, models.Mouvement.vehicule_id == models.Vehicule.id)
        if type_vehicule:
            q = q.filter(models.Vehicule.type_vehicule == type_vehicule)
        if remplacement:
            q = q.filter(
                models.Mouvement.type_vehicule_demande.isnot(None),
                models.Mouvement.type_vehicule_demande != models.Vehicule.type_vehicule,
            )
    if prix_min is not None:
        q = q.filter(models.Mouvement.prix_applique >= prix_min)
    if prix_max is not None:
        q = q.filter(models.Mouvement.prix_applique <= prix_max)
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

    try:
        calc = determiner_prix_mouvement(
            db, client_id=payload.client_id, circuit_id=payload.circuit_id, heure=payload.heure,
            vehicule_id=payload.vehicule_id, offert=payload.offert, type_demande=payload.type_vehicule_demande,
            mode=payload.mode_prix_remplacement, prix_saisi=payload.prix_applique,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    prix, type_vehicule = calc.prix, calc.type_vehicule

    obj = models.Mouvement(
        type_vehicule_demande=calc.type_demande,
        mode_prix_remplacement=calc.mode,
        date=payload.date,
        heure=payload.heure,
        client_id=payload.client_id,
        circuit_id=payload.circuit_id,
        chauffeur_id=payload.chauffeur_id,
        vehicule_id=payload.vehicule_id,
        transporteur_id=payload.transporteur_id,
        nb_personnes=payload.nb_personnes,
        prix_applique=prix,
        offert=payload.offert,
    )
    db.add(obj)
    # Apprentissage auto : si ce client + circuit n'a encore aucun tarif,
    # le prix saisi ici devient le tarif de référence pour la prochaine fois.
    # Jamais pour un mouvement offert (sinon le prix 0 deviendrait le tarif du client),
    # ni pour un remplacement de véhicule (prix de dépannage, pas un tarif du client).
    if not payload.offert and not calc.remplacement:
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
        # Le prix est récupéré depuis le tarif client reconnu au moment de la
        # duplication (et non recopié tel quel depuis le mouvement d'origine) :
        # si un tarif a changé entre-temps, la copie reflète le tarif à jour.
        # Remplacement de véhicule : même règle de prix que l'original (un prix manuel est conservé).
        heure = payload.nouvelle_heure or obj.heure
        try:
            calc = determiner_prix_mouvement(
                db, client_id=obj.client_id, circuit_id=obj.circuit_id, heure=heure, vehicule_id=obj.vehicule_id,
                offert=obj.offert, type_demande=obj.type_vehicule_demande, mode=obj.mode_prix_remplacement,
                prix_saisi=float(obj.prix_applique) if obj.mode_prix_remplacement == "manuel" else None,
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
        prix = calc.prix
        nouveaux.append(models.Mouvement(
            type_vehicule_demande=calc.type_demande,
            mode_prix_remplacement=calc.mode,
            date=payload.nouvelle_date,
            heure=heure,
            client_id=obj.client_id,
            circuit_id=obj.circuit_id,
            chauffeur_id=obj.chauffeur_id,
            vehicule_id=obj.vehicule_id,
            transporteur_id=obj.transporteur_id,
            nb_personnes=obj.nb_personnes,
            prix_applique=prix,
            offert=obj.offert,
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

    try:
        calc = determiner_prix_mouvement(
            db, client_id=payload.client_id, circuit_id=payload.circuit_id, heure=payload.heure,
            vehicule_id=payload.vehicule_id, offert=payload.offert, type_demande=payload.type_vehicule_demande,
            mode=payload.mode_prix_remplacement, prix_saisi=payload.prix_applique,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    prix, type_vehicule = calc.prix, calc.type_vehicule

    obj.type_vehicule_demande = calc.type_demande
    obj.mode_prix_remplacement = calc.mode
    obj.date = payload.date
    obj.heure = payload.heure
    obj.client_id = payload.client_id
    obj.circuit_id = payload.circuit_id
    obj.chauffeur_id = payload.chauffeur_id
    obj.vehicule_id = payload.vehicule_id
    obj.transporteur_id = payload.transporteur_id
    obj.nb_personnes = payload.nb_personnes
    obj.prix_applique = prix
    obj.offert = payload.offert

    # Apprentissage auto : même logique qu'à la création (sauf mouvement offert ou remplacement).
    if not payload.offert and not calc.remplacement:
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
    type_demande: models.TypeVehicule | None = None,
    mode: str | None = None,
    db: Session = Depends(get_db),
):
    """Aide au formulaire : renvoie le prix calculé avant même de créer le mouvement
    (en tenant compte d'un éventuel remplacement de véhicule)."""
    from datetime import time as time_cls
    h, m = heure.split(":")[:2]
    heure_obj = time_cls(int(h), int(m))
    try:
        calc = determiner_prix_mouvement(
            db, client_id=client_id, circuit_id=circuit_id, heure=heure_obj, vehicule_id=vehicule_id,
            offert=False, type_demande=type_demande, mode=mode if mode != "manuel" else "demande",
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"prix_suggere": calc.prix, "type_vehicule": calc.type_vehicule.value, "remplacement": calc.remplacement}
