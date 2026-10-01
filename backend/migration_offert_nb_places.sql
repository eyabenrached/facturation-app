-- Véhicule offert + capacité des véhicules
ALTER TABLE vehicules  ADD COLUMN IF NOT EXISTS nb_places INTEGER NULL;
ALTER TABLE mouvements ADD COLUMN IF NOT EXISTS offert BOOLEAN NOT NULL DEFAULT FALSE;
