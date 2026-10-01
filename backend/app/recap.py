"""Construction du récapitulatif "chrono par heure et par transporteur",
réutilisé par les Mouvements & Facturation et par les Mouvements Location.

Le calcul se fait en SQL (GROUP BY) : on ne charge plus tous les mouvements
de la période en mémoire, seulement quelques lignes de comptage.
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models


def construire_recap_transporteurs(db: Session, modele, date_du=None, date_au=None) -> dict:
    """modele : models.Mouvement ou models.MouvementLocation (colonnes id, date,
    heure, transporteur_id). Seuls les transporteurs effectivement choisis sur
    au moins un mouvement de la période apparaissent dans le récapitulatif.
    """
    q = db.query(modele.heure, modele.transporteur_id, func.count(modele.id)).filter(
        modele.transporteur_id.isnot(None)
    )
    if date_du:
        q = q.filter(modele.date >= date_du)
    if date_au:
        q = q.filter(modele.date <= date_au)
    comptes_bruts = q.group_by(modele.heure, modele.transporteur_id).all()

    ids = {tid for _, tid, _ in comptes_bruts}
    transporteurs = (
        db.query(models.Agence)
        .filter(models.Agence.id.in_(ids))
        .order_by(models.Agence.nom_agence)
        .all()
        if ids
        else []
    )
    ids_tries = [str(t.id) for t in transporteurs]

    par_heure: dict = {}
    for heure, tid, n in comptes_bruts:
        par_heure.setdefault(heure, {})[str(tid)] = n

    lignes = []
    totaux = {tid: 0 for tid in ids_tries}
    for h in sorted(par_heure):
        comptes = {tid: par_heure[h].get(tid, 0) for tid in ids_tries}
        for tid, c in comptes.items():
            totaux[tid] += c
        lignes.append({"heure": h, "comptes": comptes, "total": sum(comptes.values())})

    return {
        "transporteurs": transporteurs,
        "lignes": lignes,
        "totaux": totaux,
        "total_general": sum(totaux.values()),
    }
