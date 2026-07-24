from datetime import time
from sqlalchemy.orm import Session

from . import models

HEURE_DEBUT_JOUR = time(6, 0)
HEURE_FIN_JOUR = time(19, 0)


def est_heure_jour(heure: time) -> bool:
    return HEURE_DEBUT_JOUR <= heure < HEURE_FIN_JOUR


def calculer_prix(db: Session, client_id: int, circuit_id: int, heure: time) -> float:
    """
    Priorité (cf. cahier des charges, règles de gestion) :
    1) tarif spécifique Client + Circuit + créneau horaire
    2) tarif spécifique Client + Circuit (sans créneau)
    3) tarif standard du circuit selon jour/nuit
    """
    tarifs = (
        db.query(models.TarifClient)
        .filter(
            models.TarifClient.client_id == client_id,
            models.TarifClient.circuit_id == circuit_id,
        )
        .all()
    )

    # 1) créneau horaire précis
    for t in tarifs:
        if t.heure_debut is not None and t.heure_fin is not None:
            if t.heure_debut == t.heure_fin:
                # Même heure de début et de fin -> tarif valable à cette heure PRECISE
                if heure == t.heure_debut:
                    return float(t.prix)
            elif t.heure_debut <= heure < t.heure_fin:
                return float(t.prix)

    # 2) tarif spécifique sans créneau
    for t in tarifs:
        if t.heure_debut is None and t.heure_fin is None:
            return float(t.prix)

    # 3) tarif standard du circuit
    circuit = db.query(models.Circuit).filter(models.Circuit.id == circuit_id).first()
    if circuit is None:
        raise ValueError("Circuit introuvable")

    return float(circuit.prix_jour if est_heure_jour(heure) else circuit.prix_nuit)