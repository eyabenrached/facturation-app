-- Migration : ajout du champ Transporteur (agence) sur les mouvements,
-- independant de l'agence du vehicule.
--
-- A exécuter UNE FOIS sur chaque base existante (locale ET Neon) :
--   psql "TA_CHAINE_DE_CONNEXION" -f migration_transporteur.sql

ALTER TABLE mouvements
    ADD COLUMN IF NOT EXISTS transporteur_id INTEGER NULL
    REFERENCES agences(id);