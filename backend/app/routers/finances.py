from calendar import monthrange
from datetime import date
from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from .. import models
from ..database import get_db
from ..deps import exiger_admin

router = APIRouter(prefix="/finances", tags=["Finances"])

# Toutes les routes de ce module donnent une vue complète de la rentabilité de
# l'entreprise (chiffre d'affaires ET dépenses) : réservées aux administrateurs.


def _bornes_periode(date_du: str | None, date_au: str | None) -> tuple[date, date]:
    """Par défaut : le mois civil en cours."""
    aujourdhui = date.today()
    if date_du and date_au:
        return date.fromisoformat(date_du), date.fromisoformat(date_au)
    premier_jour = date(aujourdhui.year, aujourdhui.month, 1)
    dernier_jour = date(aujourdhui.year, aujourdhui.month, monthrange(aujourdhui.year, aujourdhui.month)[1])
    return premier_jour, dernier_jour


def _charger_mouvements(db: Session, du: date, au: date):
    mouvements = (
        db.query(models.Mouvement)
        .options(joinedload(models.Mouvement.client), joinedload(models.Mouvement.vehicule))
        .filter(models.Mouvement.date >= du, models.Mouvement.date <= au)
        .all()
    )
    mouvements_location = (
        db.query(models.MouvementLocation)
        .options(joinedload(models.MouvementLocation.vehicule))
        .filter(models.MouvementLocation.date >= du, models.MouvementLocation.date <= au)
        .all()
    )
    return mouvements, mouvements_location


def _charger_depenses(db: Session, du: date, au: date):
    return (
        db.query(models.Depense)
        .options(joinedload(models.Depense.vehicule), joinedload(models.Depense.chauffeur))
        .filter(models.Depense.date >= du, models.Depense.date <= au)
        .all()
    )


LABELS_CATEGORIE = {
    "salaire_chauffeur": "Dépenses chauffeurs",
    "cnss": "CNSS et charges sociales",
    "carburant": "Carburant",
    "entretien": "Entretien et réparation",
    "assurance": "Assurances",
    "taxe": "Taxes et autres charges",
    "autre": "Autres dépenses d'exploitation",
}


@router.get("/resume", dependencies=[Depends(exiger_admin)])
def resume_financier(date_du: str | None = None, date_au: str | None = None, db: Session = Depends(get_db)):
    """Vue d'ensemble de la rentabilité sur une période : chiffre d'affaires,
    dépenses par catégorie, bénéfice net, marge, et répartitions par client et
    par véhicule."""
    du, au = _bornes_periode(date_du, date_au)

    mouvements, mouvements_location = _charger_mouvements(db, du, au)
    depenses = _charger_depenses(db, du, au)

    chiffre_affaires_transport = sum(float(m.prix_applique) for m in mouvements)
    chiffre_affaires_location = sum(float(m.prix) for m in mouvements_location)
    total_revenus = chiffre_affaires_transport + chiffre_affaires_location
    nb_mouvements = len(mouvements) + len(mouvements_location)

    # ---------- Dépenses par catégorie ----------
    depenses_par_categorie_brut: dict[str, float] = defaultdict(float)
    for d in depenses:
        depenses_par_categorie_brut[d.categorie.value] += float(d.montant)
    depenses_par_categorie = [
        {"categorie": cle, "label": LABELS_CATEGORIE.get(cle, cle), "total": round(total, 3)}
        for cle, total in sorted(depenses_par_categorie_brut.items(), key=lambda x: x[1], reverse=True)
    ]
    total_depenses = sum(float(d.montant) for d in depenses)

    benefice_net = total_revenus - total_depenses
    marge_beneficiaire = (benefice_net / total_revenus * 100) if total_revenus > 0 else 0.0
    taux_cout = (total_depenses / total_revenus) if total_revenus > 0 else 0.0

    # ---------- Revenus / bénéfice par client (transport + location fusionnés par nom) ----------
    par_client: dict[str, dict] = {}

    def _cumuler_client(nom: str, montant: float, client_id: int | None):
        cle = nom.strip().lower()
        if cle not in par_client:
            par_client[cle] = {"client_id": client_id, "nom_client": nom.strip(), "revenu": 0.0, "nb": 0}
        if client_id is not None:
            par_client[cle]["client_id"] = client_id
        par_client[cle]["revenu"] += montant
        par_client[cle]["nb"] += 1

    for m in mouvements:
        _cumuler_client(m.client.nom_societe, float(m.prix_applique), m.client_id)
    for m in mouvements_location:
        _cumuler_client(m.client, float(m.prix), None)

    benefice_par_client = []
    for info in par_client.values():
        depenses_allouees = round(info["revenu"] * taux_cout, 3)
        benefice = round(info["revenu"] - depenses_allouees, 3)
        benefice_par_client.append({
            "client_id": info["client_id"],
            "nom_client": info["nom_client"],
            "nb_mouvements": info["nb"],
            "revenu": round(info["revenu"], 3),
            "depenses_allouees": depenses_allouees,
            "benefice": benefice,
            "marge_pct": round((benefice / info["revenu"] * 100), 1) if info["revenu"] > 0 else 0.0,
        })
    benefice_par_client.sort(key=lambda x: x["revenu"], reverse=True)

    # ---------- Bénéfice par véhicule ----------
    revenu_vehicule: dict[int, dict] = {}

    def _cumuler_vehicule(vid: int, matricule: str, montant: float):
        if vid not in revenu_vehicule:
            revenu_vehicule[vid] = {"vehicule_id": vid, "matricule": matricule, "revenu": 0.0, "nb": 0}
        revenu_vehicule[vid]["revenu"] += montant
        revenu_vehicule[vid]["nb"] += 1

    for m in mouvements:
        if m.vehicule_id:
            _cumuler_vehicule(m.vehicule_id, m.vehicule.matricule if m.vehicule else "—", float(m.prix_applique))
    for m in mouvements_location:
        if m.vehicule_id:
            _cumuler_vehicule(m.vehicule_id, m.vehicule.matricule if m.vehicule else "—", float(m.prix))

    depenses_vehicule: dict[int, float] = defaultdict(float)
    for d in depenses:
        if d.vehicule_id:
            depenses_vehicule[d.vehicule_id] += float(d.montant)

    ids_vehicules = set(revenu_vehicule.keys()) | set(depenses_vehicule.keys())
    benefice_par_vehicule = []
    for vid in ids_vehicules:
        infos = revenu_vehicule.get(vid, {"matricule": None, "revenu": 0.0, "nb": 0})
        if infos["matricule"] is None:
            vehicule = db.query(models.Vehicule).get(vid)
            infos["matricule"] = vehicule.matricule if vehicule else "—"
        rev = round(infos["revenu"], 3)
        dep = round(depenses_vehicule.get(vid, 0.0), 3)
        benefice_par_vehicule.append({
            "vehicule_id": vid,
            "matricule": infos["matricule"],
            "nb_mouvements": infos["nb"],
            "revenu": rev,
            "depenses": dep,
            "benefice": round(rev - dep, 3),
        })
    benefice_par_vehicule.sort(key=lambda x: x["benefice"], reverse=True)

    return {
        "date_du": du.isoformat(),
        "date_au": au.isoformat(),
        "chiffre_affaires_transport": round(chiffre_affaires_transport, 3),
        "chiffre_affaires_location": round(chiffre_affaires_location, 3),
        "total_revenus": round(total_revenus, 3),
        "nb_mouvements": nb_mouvements,
        "depenses_par_categorie": depenses_par_categorie,
        "total_depenses": round(total_depenses, 3),
        "benefice_net": round(benefice_net, 3),
        "marge_beneficiaire": round(marge_beneficiaire, 1),
        "benefice_par_client": benefice_par_client,
        "benefice_par_vehicule": benefice_par_vehicule,
    }


@router.get("/benefice-par-mouvement", dependencies=[Depends(exiger_admin)])
def benefice_par_mouvement(
    date_du: str | None = None,
    date_au: str | None = None,
    vehicule_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Détail du bénéfice estimé mouvement par mouvement : le revenu est exact
    (prix appliqué), le coût est une estimation obtenue en répartissant les
    dépenses du véhicule concerné (carburant, entretien, assurance...) sur la
    période, également entre tous ses mouvements de la période."""
    du, au = _bornes_periode(date_du, date_au)
    mouvements, mouvements_location = _charger_mouvements(db, du, au)
    depenses = _charger_depenses(db, du, au)

    depenses_vehicule: dict[int, float] = defaultdict(float)
    for d in depenses:
        if d.vehicule_id:
            depenses_vehicule[d.vehicule_id] += float(d.montant)

    nb_mouvements_vehicule: dict[int, int] = defaultdict(int)
    for m in mouvements:
        if m.vehicule_id:
            nb_mouvements_vehicule[m.vehicule_id] += 1
    for m in mouvements_location:
        if m.vehicule_id:
            nb_mouvements_vehicule[m.vehicule_id] += 1

    def _cout_estime(vid: int | None) -> float:
        if not vid or nb_mouvements_vehicule.get(vid, 0) == 0:
            return 0.0
        return depenses_vehicule.get(vid, 0.0) / nb_mouvements_vehicule[vid]

    resultats = []
    for m in mouvements:
        if vehicule_id and m.vehicule_id != vehicule_id:
            continue
        cout = round(_cout_estime(m.vehicule_id), 3)
        revenu = float(m.prix_applique)
        resultats.append({
            "type": "transport",
            "mouvement_id": m.id,
            "date": m.date.isoformat(),
            "heure": m.heure.isoformat(),
            "client": m.client.nom_societe if m.client else "—",
            "vehicule": m.vehicule.matricule if m.vehicule else "—",
            "revenu": round(revenu, 3),
            "cout_estime": cout,
            "benefice": round(revenu - cout, 3),
        })
    for m in mouvements_location:
        if vehicule_id and m.vehicule_id != vehicule_id:
            continue
        cout = round(_cout_estime(m.vehicule_id), 3)
        revenu = float(m.prix)
        resultats.append({
            "type": "location",
            "mouvement_id": m.id,
            "date": m.date.isoformat(),
            "heure": m.heure.isoformat(),
            "client": m.client,
            "vehicule": m.vehicule.matricule if m.vehicule else "—",
            "revenu": round(revenu, 3),
            "cout_estime": cout,
            "benefice": round(revenu - cout, 3),
        })

    resultats.sort(key=lambda x: (x["date"], x["heure"]), reverse=True)
    return resultats


@router.get("/evolution-annuelle", dependencies=[Depends(exiger_admin)])
def evolution_annuelle(annee: int, db: Session = Depends(get_db)):
    """Revenus, dépenses et bénéfice mois par mois pour l'année donnée."""
    resultats = []
    for mois in range(1, 13):
        du = date(annee, mois, 1)
        au = date(annee, mois, monthrange(annee, mois)[1])
        mouvements, mouvements_location = _charger_mouvements(db, du, au)
        depenses = _charger_depenses(db, du, au)

        revenus = sum(float(m.prix_applique) for m in mouvements) + sum(float(m.prix) for m in mouvements_location)
        total_dep = sum(float(d.montant) for d in depenses)

        resultats.append({
            "mois": mois,
            "revenus": round(revenus, 3),
            "depenses": round(total_dep, 3),
            "benefice": round(revenus - total_dep, 3),
        })
    return resultats
