-- Migration : ajout du champ "actif" sur les chauffeurs.
--
-- Un chauffeur dont la date de fin de contrat est dépassée est désormais
-- désactivé automatiquement par le backend (jamais supprimé physiquement) :
-- il disparaît des listes de sélection pour les nouveaux mouvements/dépenses
-- mais reste associé à tout son historique de mouvements passés.
--
-- A exécuter UNE FOIS sur chaque base existante (locale ET Neon) :
--   psql "TA_CHAINE_DE_CONNEXION" -f migration_chauffeur_actif.sql

ALTER TABLE chauffeurs
    ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT TRUE;

-- Rattrapage immédiat : désactive tout de suite les contrats déjà expirés.
UPDATE chauffeurs
    SET actif = FALSE
    WHERE date_fin_contrat IS NOT NULL
      AND date_fin_contrat < CURRENT_DATE
      AND actif = TRUE;
