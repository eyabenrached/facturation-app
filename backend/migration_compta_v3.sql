-- Comptabilité : organisation en dossiers (automatique / manuelle), traçabilité et devises.
-- Facultatif : ces colonnes sont aussi ajoutées automatiquement au démarrage de l'application.
ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS origine VARCHAR(12) NOT NULL DEFAULT 'manuelle';
ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS dossier VARCHAR(20);
ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS tiers VARCHAR(150);
ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS observation VARCHAR(500);
ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS regularise_id INTEGER;
ALTER TABLE lignes_ecritures ADD COLUMN IF NOT EXISTS devise VARCHAR(3) NOT NULL DEFAULT 'TND';
ALTER TABLE lignes_ecritures ADD COLUMN IF NOT EXISTS montant_devise NUMERIC(14,3);
ALTER TABLE lignes_ecritures ADD COLUMN IF NOT EXISTS taux_change NUMERIC(14,6);
CREATE INDEX IF NOT EXISTS ix_ecritures_comptables_origine ON ecritures_comptables(origine);
CREATE INDEX IF NOT EXISTS ix_ecritures_comptables_dossier ON ecritures_comptables(dossier);
CREATE INDEX IF NOT EXISTS ix_ecritures_comptables_regularise_id ON ecritures_comptables(regularise_id);
-- Les écritures existantes sont rangées (origine + dossier) automatiquement au démarrage.
