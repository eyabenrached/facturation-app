"""Comptabilité clients : créances, détail par client, relevé de compte, relance.

Source des chiffres : factures (transport + location) et règlements
(`paiements_factures`). Ils sont en cohérence avec le compte 411000 du journal
puisque chaque facture et chaque règlement génère son écriture.
"""
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from . import models
from .compta_plan import DELAI_PAIEMENT_JOURS, MODES_PAIEMENT
from .compta_service import dec
from .models_compta import PaiementFacture


def _cle(nom: str) -> str:
    return " ".join((nom or "").lower().split())


def _montants_payes(db: Session) -> tuple[dict[int, Decimal], dict[int, Decimal]]:
    pf: dict[int, Decimal] = {}
    pl: dict[int, Decimal] = {}
    for fid, flid, total in (
        db.query(PaiementFacture.facture_id, PaiementFacture.facture_location_id, func.sum(PaiementFacture.montant))
        .group_by(PaiementFacture.facture_id, PaiementFacture.facture_location_id).all()
    ):
        if fid:
            pf[fid] = dec(total)
        else:
            pl[flid] = dec(total)
    return pf, pl


def toutes_les_factures(db: Session, today: date | None = None) -> list[dict]:
    """Une ligne par facture (transport et location), avec payé, reste, échéance, statut."""
    today = today or date.today()
    pf, pl = _montants_payes(db)
    lignes: list[dict] = []

    def ajouter(type_facture, obj, nom, client_id, email, telephone, paye):
        ttc = dec(obj.montant_ttc)
        reste = ttc - paye
        echeance = obj.date_fin + timedelta(days=DELAI_PAIEMENT_JOURS)
        if reste <= 0:
            statut = "payee"
        elif echeance < today:
            statut = "en_retard"
        elif paye > 0:
            statut = "partielle"
        else:
            statut = "en_attente"
        lignes.append({
            "type": type_facture, "id": obj.id, "numero": obj.numero_facture, "client": nom, "client_id": client_id,
            "email": email, "telephone": telephone, "date": obj.date_fin, "echeance": echeance, "ttc": ttc, "paye": paye,
            "reste": max(reste, Decimal("0")), "statut": statut,
            "jours_retard": (today - echeance).days if statut == "en_retard" else 0,
        })

    for f in db.query(models.Facture).options(joinedload(models.Facture.client)).all():
        c = f.client
        ajouter("facture", f, c.nom_societe if c else f"Client #{f.client_id}", f.client_id,
                c.email if c else None, c.telephone if c else None, pf.get(f.id, Decimal("0")))
    for f in db.query(models.FactureLocation).all():
        ajouter("location", f, f.client, None, None, None, pl.get(f.id, Decimal("0")))
    return lignes


def liste_creances(db: Session, q: str | None = None, statut: str | None = None) -> dict:
    groupes: dict[str, dict] = {}
    for l in toutes_les_factures(db):
        g = groupes.setdefault(_cle(l["client"]), {
            "client": l["client"], "total_facture": Decimal("0"), "total_paye": Decimal("0"), "reste": Decimal("0"),
            "echeance": None, "nb_factures": 0, "nb_impayees": 0, "jours_retard": 0,
        })
        g["total_facture"] += l["ttc"]
        g["total_paye"] += l["paye"]
        g["reste"] += l["reste"]
        g["nb_factures"] += 1
        if l["reste"] > 0:
            g["nb_impayees"] += 1
            if g["echeance"] is None or l["echeance"] < g["echeance"]:
                g["echeance"] = l["echeance"]
            g["jours_retard"] = max(g["jours_retard"], l["jours_retard"])

    lignes = []
    for g in groupes.values():
        g["statut"] = "solde" if g["reste"] <= 0 else "en_retard" if g["jours_retard"] > 0 else "en_cours"
        lignes.append(g)
    if q and q.strip():
        lignes = [g for g in lignes if q.strip().lower() in g["client"].lower()]
    if statut:
        lignes = [g for g in lignes if g["statut"] == statut]
    lignes.sort(key=lambda g: (-g["reste"], g["client"].lower()))

    def num(g):
        return {**g, **{k: float(g[k]) for k in ("total_facture", "total_paye", "reste")},
                "echeance": g["echeance"].isoformat() if g["echeance"] else None}

    return {
        "items": [num(g) for g in lignes],
        "total_facture": float(sum(g["total_facture"] for g in lignes)),
        "total_paye": float(sum(g["total_paye"] for g in lignes)),
        "total_reste": float(sum(g["reste"] for g in lignes)),
        "total_en_retard": float(sum(g["reste"] for g in lignes if g["statut"] == "en_retard")),
        "nb_clients_en_retard": sum(1 for g in lignes if g["statut"] == "en_retard"),
        "delai_jours": DELAI_PAIEMENT_JOURS,
    }


def detail_client(db: Session, nom: str) -> dict | None:
    factures = [l for l in toutes_les_factures(db) if _cle(l["client"]) == _cle(nom)]
    if not factures:
        return None
    factures.sort(key=lambda l: (l["date"], l["numero"]))
    par_cle = {(l["type"], l["id"]): l for l in factures}
    paiements = []
    for p in db.query(PaiementFacture).order_by(PaiementFacture.date.desc(), PaiementFacture.id.desc()).all():
        tf, fid = ("facture", p.facture_id) if p.facture_id else ("location", p.facture_location_id)
        l = par_cle.get((tf, fid))
        if l:
            paiements.append({
                "id": p.id, "date": p.date.isoformat(), "montant": float(p.montant), "mode": p.mode,
                "mode_label": MODES_PAIEMENT.get(p.mode, p.mode), "reference": p.reference, "note": p.note,
                "facture_numero": l["numero"], "facture_type": tf, "facture_id": fid,
            })
    infos = next((l for l in factures if l["email"] or l["telephone"]), factures[0])
    return {
        "client": factures[0]["client"], "email": infos["email"], "telephone": infos["telephone"],
        "total_facture": float(sum(l["ttc"] for l in factures)), "total_paye": float(sum(l["paye"] for l in factures)),
        "reste": float(sum(l["reste"] for l in factures)), "delai_jours": DELAI_PAIEMENT_JOURS,
        "modes": MODES_PAIEMENT,
        "factures": [{**l, "date": l["date"].isoformat(), "echeance": l["echeance"].isoformat(),
                      "ttc": float(l["ttc"]), "paye": float(l["paye"]), "reste": float(l["reste"])} for l in factures],
        "paiements": paiements,
    }


def releve(db: Session, nom: str, du: date | None = None, au: date | None = None) -> dict | None:
    """Relevé de compte : factures au débit, règlements au crédit, solde cumulé."""
    factures = [l for l in toutes_les_factures(db) if _cle(l["client"]) == _cle(nom)]
    if not factures:
        return None
    par_cle = {(l["type"], l["id"]): l for l in factures}
    mouvements = [
        {"date": l["date"], "ordre": 0, "piece": l["numero"], "libelle": "Facture", "debit": l["ttc"], "credit": Decimal("0")}
        for l in factures
    ]
    for p in db.query(PaiementFacture).all():
        tf, fid = ("facture", p.facture_id) if p.facture_id else ("location", p.facture_location_id)
        l = par_cle.get((tf, fid))
        if l:
            mouvements.append({
                "date": p.date, "ordre": 1, "piece": f"Règl. {l['numero']}",
                "libelle": f"Règlement ({MODES_PAIEMENT.get(p.mode, p.mode)}){' — ' + p.reference if p.reference else ''}",
                "debit": Decimal("0"), "credit": dec(p.montant),
            })
    mouvements.sort(key=lambda m: (m["date"], m["ordre"], m["piece"]))
    ouverture = sum((m["debit"] - m["credit"] for m in mouvements if du and m["date"] < du), Decimal("0"))
    solde = ouverture
    lignes = []
    for m in mouvements:
        if (du and m["date"] < du) or (au and m["date"] > au):
            continue
        solde += m["debit"] - m["credit"]
        lignes.append({**m, "solde": solde})
    return {"client": factures[0]["client"], "du": du, "au": au, "solde_ouverture": ouverture, "lignes": lignes, "solde_final": solde}


def factures_a_relancer(db: Session, nom: str) -> list[dict]:
    l = [f for f in toutes_les_factures(db) if _cle(f["client"]) == _cle(nom) and f["reste"] > 0]
    return sorted(l, key=lambda f: f["echeance"])
