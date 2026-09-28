"""Importe hotels_tunisie.sql dans la table `hotels` du projet.

Le fichier fourni ne correspond pas exactement à la table réelle :
  - colonne `categorie`  -> la table utilise `categorie_etoiles`
  - pas de colonne `actif` (NOT NULL côté table) -> on la renseigne à TRUE
  - ON CONFLICT (nom, ville) suppose une contrainte UNIQUE qui n'existe pas

Ce script relit donc les lignes INSERT du fichier et les réécrit à la volée
(sans toucher au schéma). Un hôtel n'est inséré que s'il n'existe pas déjà
(même nom + même ville, sans tenir compte des majuscules) : le script est
donc rejouable sans créer de doublons, et ne touche pas aux hôtels déjà saisis.

Usage (depuis le dossier backend, avec le même .env que l'application) :
    python import_hotels_tunisie.py chemin\\vers\\hotels_tunisie.sql --dry-run
    python import_hotels_tunisie.py chemin\\vers\\hotels_tunisie.sql
"""

import re
import sys
from pathlib import Path

from sqlalchemy import text

from app.database import engine

LIGNE = re.compile(
    r"^INSERT INTO hotels \(.*?\) VALUES \("
    r"'((?:[^']|'')*)', "        # nom
    r"'((?:[^']|'')*)', "        # ville
    r"'((?:[^']|'')*)', "        # pays
    r"(\d+|NULL),",              # catégorie (étoiles)
    re.IGNORECASE,
)


def lire_hotels(chemin: Path):
    """Retourne la liste de (nom, ville, pays, etoiles) lus dans le fichier
    (les apostrophes restent doublées, prêtes à être réinjectées en SQL)."""
    hotels, ignorees = [], []
    for ligne in chemin.read_text(encoding="utf-8-sig").splitlines():
        if not ligne.lstrip().upper().startswith("INSERT INTO HOTELS"):
            continue
        m = LIGNE.match(ligne.strip())
        if m:
            hotels.append(m.groups())
        else:
            ignorees.append(ligne[:100])
    return hotels, ignorees


def requete(nom, ville, pays, etoiles):
    return (
        "INSERT INTO hotels (nom, ville, pays, categorie_etoiles, actif) "
        f"SELECT '{nom}', '{ville}', '{pays}', {etoiles}, TRUE "
        "WHERE NOT EXISTS (SELECT 1 FROM hotels "
        f"WHERE lower(nom) = lower('{nom}') AND lower(ville) = lower('{ville}'))"
    )


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    if not args:
        sys.exit(__doc__)

    hotels, ignorees = lire_hotels(Path(args[0]))
    print(f"{len(hotels)} hôtels lus dans le fichier.")
    if ignorees:
        print(f"ATTENTION : {len(ignorees)} ligne(s) INSERT non reconnue(s), ignorée(s) :")
        for l in ignorees:
            print("   ", l)
    if dry_run:
        print("Mode --dry-run : rien n'a été écrit.")
        return

    with engine.begin() as conn:  # une seule transaction : tout ou rien
        avant = conn.exec_driver_sql("SELECT count(*) FROM hotels").scalar()
        for h in hotels:
            conn.exec_driver_sql(requete(*h))
        apres = conn.exec_driver_sql("SELECT count(*) FROM hotels").scalar()

    print(f"Hôtels avant : {avant} — après : {apres} — insérés : {apres - avant}")
    print(f"Déjà présents (ignorés, doublons) : {len(hotels) - (apres - avant)}")


if __name__ == "__main__":
    main()