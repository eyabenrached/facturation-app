-- Ajoute le timbre fiscal aux factures.
-- Les factures existantes gardent un timbre à 0 (totaux inchangés).

ALTER TABLE factures ADD COLUMN IF NOT EXISTS timbre NUMERIC(6,3) NOT NULL DEFAULT 0;
