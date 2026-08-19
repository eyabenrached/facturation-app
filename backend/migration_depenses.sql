-- Migration : ajout du module financier (dépenses d'exploitation).
--
-- La table "depenses" est entièrement nouvelle : si l'application tourne déjà
-- (Base.metadata.create_all au démarrage dans main.py), elle sera créée
-- automatiquement au prochain redémarrage du backend, SANS avoir besoin
-- d'exécuter ce script.
--
-- Ce script n'est utile que si tu préfères créer la table explicitement
-- (ex. base de production Neon, avant de redéployer le backend) :
--   psql "TA_CHAINE_DE_CONNEXION" -f migration_depenses.sql

DO $$ BEGIN
    CREATE TYPE categorie_depense AS ENUM (
        'salaire_chauffeur', 'cnss', 'carburant', 'entretien', 'assurance', 'taxe', 'autre'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS depenses (
    id SERIAL PRIMARY KEY,
    categorie categorie_depense NOT NULL,
    date DATE NOT NULL,
    montant NUMERIC(12, 3) NOT NULL,
    description TEXT NULL,
    vehicule_id INTEGER NULL REFERENCES vehicules(id),
    chauffeur_id INTEGER NULL REFERENCES chauffeurs(id),
    transporteur_id INTEGER NULL REFERENCES agences(id),
    date_creation TIMESTAMP NOT NULL DEFAULT now()
);

-- Si la table "depenses" existe déjà (installation précédente sans ce champ) :
ALTER TABLE depenses ADD COLUMN IF NOT EXISTS transporteur_id INTEGER NULL REFERENCES agences(id);

CREATE INDEX IF NOT EXISTS ix_depenses_date ON depenses (date);
CREATE INDEX IF NOT EXISTS ix_depenses_vehicule_id ON depenses (vehicule_id);
CREATE INDEX IF NOT EXISTS ix_depenses_chauffeur_id ON depenses (chauffeur_id);
CREATE INDEX IF NOT EXISTS ix_depenses_transporteur_id ON depenses (transporteur_id);
