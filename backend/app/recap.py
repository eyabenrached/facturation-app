"""Construction du récapitulatif "chrono par heure et par transporteur",
réutilisé par les Mouvements & Facturation et par les Mouvements Location.
"""


def construire_recap_transporteurs(rows) -> dict:
    """rows : itérable d'objets possédant .heure, .transporteur_id, .transporteur
    (relation Agence, nullable). Seuls les transporteurs effectivement choisis
    sur au moins un mouvement de la période apparaissent dans le récapitulatif.
    """
    transporteurs_par_id = {}
    for r in rows:
        if r.transporteur is not None:
            transporteurs_par_id[r.transporteur.id] = r.transporteur

    transporteurs = sorted(transporteurs_par_id.values(), key=lambda a: a.nom_agence)
    ids_tries = [str(t.id) for t in transporteurs]

    heures = sorted({r.heure for r in rows if r.transporteur_id in transporteurs_par_id})

    lignes = []
    totaux = {tid: 0 for tid in ids_tries}

    for h in heures:
        comptes = {tid: 0 for tid in ids_tries}
        for r in rows:
            if r.heure == h and r.transporteur_id in transporteurs_par_id:
                comptes[str(r.transporteur_id)] += 1
        for tid, c in comptes.items():
            totaux[tid] += c
        lignes.append({"heure": h, "comptes": comptes, "total": sum(comptes.values())})

    return {
        "transporteurs": transporteurs,
        "lignes": lignes,
        "totaux": totaux,
        "total_general": sum(totaux.values()),
    }