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


MODES_PRIX_REMPLACEMENT = ("demande", "fourni", "manuel")


class PrixMouvement:
    """Résultat de la règle de prix d'un mouvement (voir `determiner_prix_mouvement`)."""

    def __init__(self, prix: float, type_vehicule: "models.TypeVehicule", type_demande, mode, remplacement: bool):
        self.prix = prix
        self.type_vehicule = type_vehicule      # type utilisé pour le calcul / l'apprentissage
        self.type_demande = type_demande        # à mémoriser sur le mouvement (None si pas de remplacement)
        self.mode = mode                        # à mémoriser sur le mouvement (None si pas de remplacement)
        self.remplacement = remplacement


def determiner_prix_mouvement(
    db: Session, *, client_id: int, circuit_id: int, heure: time, vehicule_id: int | None, offert: bool,
    type_demande: "models.TypeVehicule | None" = None, mode: str | None = None, prix_saisi: float | None = None,
) -> PrixMouvement:
    """Règle de prix d'un mouvement, y compris le remplacement de véhicule.

    - Pas de remplacement (aucun type demandé, ou type demandé = type fourni) : prix saisi s'il y en a un,
      sinon tarif du type du véhicule (comportement historique).
    - Pas encore de véhicule affecté mais un type demandé : le prix suit le type demandé.
    - Remplacement (véhicule fourni d'un autre type que celui demandé) : trois règles
        « demande » (défaut) : prix du véhicule demandé, « fourni » : tarif du véhicule fourni,
        « manuel » : prix saisi (obligatoire).
    Un mouvement offert vaut toujours 0.
    """
    fourni = type_vehicule_du_vehicule(db, vehicule_id)
    remplacement = vehicule_id is not None and type_demande is not None and type_demande != fourni

    if not remplacement:
        type_calcul = type_demande if (vehicule_id is None and type_demande is not None) else fourni
        if offert:
            prix = 0.0
        elif prix_saisi is not None:
            prix = prix_saisi
        else:
            prix = calculer_prix(db, client_id, circuit_id, heure, type_calcul)
        # Sans véhicule, on conserve le type demandé comme information ; sinon rien à mémoriser.
        return PrixMouvement(prix, type_calcul, type_demande if vehicule_id is None else None, None, False)

    mode = mode or "demande"
    if mode not in MODES_PRIX_REMPLACEMENT:
        raise ValueError("Règle de prix du remplacement inconnue.")
    if offert:
        prix = 0.0
    elif mode == "manuel":
        if prix_saisi is None:
            raise ValueError("Remplacement en prix manuel : saisissez le prix à facturer.")
        prix = prix_saisi
    elif mode == "demande":
        prix = calculer_prix(db, client_id, circuit_id, heure, type_demande)
    else:
        prix = calculer_prix(db, client_id, circuit_id, heure, fourni)
    return PrixMouvement(prix, fourni, type_demande, mode, True)


def apprendre_tarif_si_absent(
    db: Session,
    client_id: int,
    circuit_id: int,
    heure: time,
    type_vehicule: "models.TypeVehicule",
    prix: float,
) -> "models.TarifClient | None":
    """
    Système d'apprentissage automatique des tarifs client.

    Dès qu'un mouvement est créé (ou modifié) pour un couple client + circuit
    qui n'a ENCORE AUCUN tarif enregistré (même approximatif), le prix saisi
    est automatiquement mémorisé comme nouveau tarif client, précis sur
    l'heure et le type de véhicule de ce mouvement.

    Une fois ce premier tarif appris, les mouvements suivants pour ce même
    couple client + circuit ne déclenchent plus d'apprentissage : le prix
    est alors reconnu et généré automatiquement par calculer_prix() ci-dessus.
    """
    tarif_existant = (
        db.query(models.TarifClient)
        .filter(
            models.TarifClient.client_id == client_id,
            models.TarifClient.circuit_id == circuit_id,
        )
        .first()
    )
    if tarif_existant is not None:
        return None

    nouveau_tarif = models.TarifClient(
        client_id=client_id,
        circuit_id=circuit_id,
        type_vehicule=type_vehicule,
        heure_debut=heure,
        heure_fin=heure,
        prix=prix,
    )
    db.add(nouveau_tarif)
    return nouveau_tarif