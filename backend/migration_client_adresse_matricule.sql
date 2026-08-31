-- Ajout des champs Adresse et Matricule fiscal sur la table clients
-- (utilisés pour l'affichage sur la facture PDF)

ALTER TABLE clients ADD COLUMN IF NOT EXISTS adresse VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS matricule_fiscal VARCHAR(50);
