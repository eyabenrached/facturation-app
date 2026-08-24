-- ============================================================
-- Supprime tous les mouvements du 03/08/2026.
--
-- Vérification de sécurité incluse : si certains de ces
-- mouvements sont déjà rattachés à une facture (facture_id non
-- NULL), le script s'arrête et affiche une erreur plutôt que de
-- supprimer des mouvements facturés par erreur.
--
-- A exécuter avec : psql "$DATABASE_URL" -f delete_mouvements_03082026.sql
-- ============================================================

BEGIN;

DO $$
DECLARE
    nb_factures INTEGER;
BEGIN
    SELECT COUNT(*) INTO nb_factures
    FROM mouvements
    WHERE date = '2026-08-03' AND facture_id IS NOT NULL;

    IF nb_factures > 0 THEN
        RAISE EXCEPTION
            '% mouvement(s) du 03/08/2026 sont déjà rattachés à une facture : suppression annulée.',
            nb_factures;
    END IF;
END $$;

-- Aperçu de ce qui va être supprimé (visible dans la sortie psql)
SELECT COUNT(*) AS nb_mouvements_a_supprimer
FROM mouvements
WHERE date = '2026-08-03';

DELETE FROM mouvements
WHERE date = '2026-08-03';

COMMIT;