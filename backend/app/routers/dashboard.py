from datetime import date
from calendar import monthrange

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import exiger_admin

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/revenu-mensuel", dependencies=[Depends(exiger_admin)])
def revenu_mensuel(annee: int, mois: int, db: Session = Depends(get_db)):
    """Statistiques de revenu pour un mois donné (réservé aux administrateurs)."""
    premier_jour = date(annee, mois, 1)
    dernier_jour = date(annee, mois, monthrange(annee, mois)[1])

    mouvements_du_mois = (
        db.query(models.Mouvement)
        .filter(models.Mouvement.date >= premier_jour, models.Mouvement.date <= dernier_jour)
        .all()
    )

    chiffre_affaires = sum(float(m.prix_applique) for m in mouvements_du_mois)
    nb_mouvements = len(mouvements_du_mois)

    # Répartition par client
    par_client: dict[int, dict] = {}
    for m in mouvements_du_mois:
        cid = m.client_id
        if cid not in par_client:
            par_client[cid] = {"client_id": cid, "nom_client": m.client.nom_societe, "total": 0.0, "nb": 0}
        par_client[cid]["total"] += float(m.prix_applique)
        par_client[cid]["nb"] += 1
    liste_par_client = sorted(par_client.values(), key=lambda x: x["total"], reverse=True)

    # Répartition par jour (pour graphique)
    par_jour: dict[int, float] = {j: 0.0 for j in range(1, monthrange(annee, mois)[1] + 1)}
    for m in mouvements_du_mois:
        par_jour[m.date.day] += float(m.prix_applique)
    liste_par_jour = [{"jour": j, "total": t} for j, t in sorted(par_jour.items())]

    # Facturation réelle (factures dont la période chevauche le mois)
    factures_du_mois = (
        db.query(models.Facture)
        .filter(models.Facture.date_debut <= dernier_jour, models.Facture.date_fin >= premier_jour)
        .all()
    )
    total_facture_ttc = sum(float(f.montant_ttc) for f in factures_du_mois)
    total_encaisse = sum(float(f.montant_ttc) for f in factures_du_mois if f.statut == models.StatutFacture.payee)
    total_impaye = sum(float(f.montant_ttc) for f in factures_du_mois if f.statut == models.StatutFacture.impayee)

    nb_non_factures = sum(1 for m in mouvements_du_mois if m.facture_id is None)

    # ---------- Mouvements Location (indépendants) ----------
    mouvements_location_du_mois = (
        db.query(models.MouvementLocation)
        .filter(models.MouvementLocation.date >= premier_jour, models.MouvementLocation.date <= dernier_jour)
        .all()
    )
    chiffre_affaires_location = sum(float(m.prix) for m in mouvements_location_du_mois)
    nb_mouvements_location = len(mouvements_location_du_mois)
    nb_location_non_factures = sum(1 for m in mouvements_location_du_mois if m.facture_id is None)

    par_client_location: dict[str, dict] = {}
    for m in mouvements_location_du_mois:
        cle = m.client.strip().lower()
        if cle not in par_client_location:
            par_client_location[cle] = {"nom_client": m.client.strip(), "total": 0.0, "nb": 0}
        par_client_location[cle]["total"] += float(m.prix)
        par_client_location[cle]["nb"] += 1
    liste_par_client_location = sorted(par_client_location.values(), key=lambda x: x["total"], reverse=True)

    factures_location_du_mois = (
        db.query(models.FactureLocation)
        .filter(models.FactureLocation.date_debut <= dernier_jour, models.FactureLocation.date_fin >= premier_jour)
        .all()
    )
    total_facture_location_ttc = sum(float(f.montant_ttc) for f in factures_location_du_mois)
    total_encaisse_location = sum(float(f.montant_ttc) for f in factures_location_du_mois if f.statut == models.StatutFacture.payee)
    total_impaye_location = sum(float(f.montant_ttc) for f in factures_location_du_mois if f.statut == models.StatutFacture.impayee)

    return {
        "annee": annee,
        "mois": mois,
        "chiffre_affaires": round(chiffre_affaires, 3),
        "nb_mouvements": nb_mouvements,
        "nb_mouvements_non_factures": nb_non_factures,
        "total_facture_ttc": round(total_facture_ttc, 3),
        "total_encaisse": round(total_encaisse, 3),
        "total_impaye": round(total_impaye, 3),
        "par_client": liste_par_client,
        "par_jour": liste_par_jour,
        "chiffre_affaires_location": round(chiffre_affaires_location, 3),
        "nb_mouvements_location": nb_mouvements_location,
        "nb_mouvements_location_non_factures": nb_location_non_factures,
        "total_facture_location_ttc": round(total_facture_location_ttc, 3),
        "total_encaisse_location": round(total_encaisse_location, 3),
        "total_impaye_location": round(total_impaye_location, 3),
        "par_client_location": liste_par_client_location,
    }