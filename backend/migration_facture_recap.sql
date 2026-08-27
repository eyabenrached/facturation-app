-- Ajoute le support des factures récapitulatives (regroupées par heure).
-- Les factures existantes restent en type "detaillee" (comportement inchangé).

ALTER TABLE factures ADD COLUMN IF NOT EXISTS type_facture VARCHAR(20) NOT NULL DEFAULT 'detaillee';

-- Si une version précédente de cette migration a déjà été appliquée avec les
-- colonnes de l'ancien modèle "par shift" (abandonné), on les supprime :
ALTER TABLE factures DROP COLUMN IF EXISTS nb_shift_matin;
ALTER TABLE factures DROP COLUMN IF EXISTS prix_shift_matin;
ALTER TABLE factures DROP COLUMN IF EXISTS nb_shift_soir;
ALTER TABLE factures DROP COLUMN IF EXISTS prix_shift_soir;