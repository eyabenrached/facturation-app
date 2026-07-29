from datetime import time
from sqlalchemy.orm import Session

from . import models

HEURE_DEBUT_JOUR = time(6, 0)
HEURE_FIN_JOUR = time(19, 0)

# Multiplicateurs appliqués au prix de référence (Mini bus) du circuit,
# quand aucun tarif spécifique client n'est défini pour ce type de véhicule.
MULTIPLICATEURS_TYPE_VEHICULE = {
    models.TypeVehicule.mini_bus: 1.0,
    models.TypeVehicule.quatre_quatre: 1.2,
    models.TypeVehicule.microbus: 1.3,
    models.TypeVehicule.bus: 1.8,
}


def est_heure_jour(heure: time) -> bool:
    return HEURE_DEBUT_JOUR <= heure < HEURE_FIN_JOUR


def _tarif_heure_correspond(tarif: "models.TarifClient", heure: time) -> bool:
    """Un tarif sans heure_debut/heure_fin est valable à toute heure."""
    if tarif.heure_debut is None or tarif.heure_fin is None:
        return True
    if tarif.heure_debut == tarif.heure_fin:
        # Même heure de début et de fin -> tarif valable à cette heure PRECISE
        return heure == tarif.heure_debut
    return tarif.heure_debut <= heure < tarif.heure_fin


def type_vehicule_du_vehicule(db: Session, vehicule_id: int | None) -> "models.TypeVehicule":
    """Renvoie le type du véhicule choisi, ou Mini bus par défaut si aucun véhicule n'est précisé."""
    if vehicule_id is None:
        return models.TypeVehicule.mini_bus
    vehicule = db.query(models.Vehicule).filter(models.Vehicule.id == vehicule_id).first()
    if vehicule is None:
        return models.TypeVehicule.mini_bus
    return vehicule.type_vehicule


def calculer_prix(
    db: Session,
    client_id: int,
    circuit_id: int,
    heure: time,
    type_vehicule: "models.TypeVehicule | None" = None,
) -> float:
    """
    Priorité de calcul du prix d'un mouvement :
    1) Tarif spécifique Client + Circuit + Type de véhicule + créneau horaire (le plus précis)
    2) Tarif spécifique Client + Circuit + Type de véhicule (toute heure)
    3) Tarif spécifique Client + Circuit + créneau horaire (tout type de véhicule)
    4) Tarif spécifique Client + Circuit (toute heure, tout type de véhicule)
    5) Prix de référence du circuit (jour/nuit) x multiplicateur du type de véhicule
    """
    if type_vehicule is None:
        type_vehicule = models.TypeVehicule.mini_bus

    tarifs = (
        db.query(models.TarifClient)
        .filter(
            models.TarifClient.client_id == client_id,
            models.TarifClient.circuit_id == circuit_id,
        )
        .all()
    )

    meilleur_score = None
    meilleur_prix = None

    for t in tarifs:
        if not _tarif_heure_correspond(t, heure):
            continue
        if t.type_vehicule is not None and t.type_vehicule != type_vehicule:
            continue

        heure_specifique = t.heure_debut is not None and t.heure_fin is not None
        type_specifique = t.type_vehicule is not None
        score = (2 if type_specifique else 0) + (1 if heure_specifique else 0)

        if meilleur_score is None or score > meilleur_score:
            meilleur_score = score
            meilleur_prix = float(t.prix)

    if meilleur_prix is not None:
        return meilleur_prix

    # Aucun tarif spécifique -> prix de référence du circuit x multiplicateur du type
    circuit = db.query(models.Circuit).filter(models.Circuit.id == circuit_id).first()
    if circuit is None:
        raise ValueError("Circuit introuvable")

    base = float(circuit.prix_jour if est_heure_jour(heure) else circuit.prix_nuit)
    multiplicateur = MULTIPLICATEURS_TYPE_VEHICULE.get(type_vehicule, 1.0)
    return round(base * multiplicateur, 3)