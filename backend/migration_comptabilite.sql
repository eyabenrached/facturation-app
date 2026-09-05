-- Migration : module comptabilité (paiements, échéances, trésorerie, TVA déductible)
-- À exécuter une fois sur la base existante (Base.metadata.create_all crée la
-- table paiements automatiquement au démarrage, mais pas les colonnes ajoutées
-- sur des tables déjà existantes).

DO $$ BEGIN
    CREATE TYPE mode_paiement AS ENUM ('especes', 'cheque', 'virement', 'traite', 'carte', 'autre');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE factures ADD COLUMN IF NOT EXISTS date_echeance DATE;
ALTER TABLE factures_location ADD COLUMN IF NOT EXISTS date_echeance DATE;

ALTER TABLE depenses ADD COLUMN IF NOT EXISTS tva_deductible NUMERIC(12, 3);
ALTER TABLE depenses ADD COLUMN IF NOT EXISTS payee BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE depenses ADD COLUMN IF NOT EXISTS mode_paiement mode_paiement;
ALTER TABLE depenses ADD COLUMN IF NOT EXISTS date_paiement DATE;

CREATE TABLE IF NOT EXISTS paiements (
    id SERIAL PRIMARY KEY,
    facture_id INTEGER REFERENCES factures(id) ON DELETE CASCADE,
    facture_location_id INTEGER REFERENCES factures_location(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    montant NUMERIC(12, 3) NOT NULL,
    mode_paiement mode_paiement,
    note TEXT,
    date_creation TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT paiement_facture_check CHECK (facture_id IS NOT NULL OR facture_location_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_paiements_facture_id ON paiements(facture_id);
CREATE INDEX IF NOT EXISTS ix_paiements_facture_location_id ON paiements(facture_location_id);

-- Échéance par défaut (date_fin + 30 jours) pour les factures déjà existantes,
-- afin que le module "factures en retard" fonctionne dès la mise à jour.
UPDATE factures SET date_echeance = date_fin + INTERVAL '30 days' WHERE date_echeance IS NULL;
UPDATE factures_location SET date_echeance = date_fin + INTERVAL '30 days' WHERE date_echeance IS NULL;

-- Reprise des factures déjà marquées "payee" en paiement unique, pour que le
-- solde restant soit cohérent avec l'historique.
INSERT INTO paiements (facture_id, date, montant, note)
SELECT id, COALESCE(date_paiement, date_creation::date), montant_ttc, 'Reprise historique (migration)'
FROM factures
WHERE statut = 'payee' AND id NOT IN (SELECT facture_id FROM paiements WHERE facture_id IS NOT NULL);

INSERT INTO paiements (facture_location_id, date, montant, note)
SELECT id, COALESCE(date_paiement, date_creation::date), montant_ttc, 'Reprise historique (migration)'
FROM factures_location
WHERE statut = 'payee' AND id NOT IN (SELECT facture_location_id FROM paiements WHERE facture_location_id IS NOT NULL);
