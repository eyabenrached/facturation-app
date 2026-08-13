-- Migration : ajout du type de mouvement (transport / location) et rend
-- circuit_id optionnel pour permettre les mouvements de location.
--
-- A exécuter UNE FOIS sur chaque base existante (locale ET Neon) :
--   psql "TA_CHAINE_DE_CONNEXION" -f migration_type_mouvement.sql

DO $$ BEGIN
    CREATE TYPE type_mouvement AS ENUM ('transport', 'location');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE mouvements
    ADD COLUMN IF NOT EXISTS type_mouvement type_mouvement NOT NULL DEFAULT 'transport';

ALTER TABLE mouvements
    ADD COLUMN IF NOT EXISTS description_location VARCHAR(255) NULL;

ALTER TABLE mouvements
    ADD COLUMN IF NOT EXISTS point_depart_manuel VARCHAR(150) NULL;

ALTER TABLE mouvements
    ADD COLUMN IF NOT EXISTS point_arrivee_manuel VARCHAR(150) NULL;

ALTER TABLE mouvements
    ALTER COLUMN circuit_id DROP NOT NULL;