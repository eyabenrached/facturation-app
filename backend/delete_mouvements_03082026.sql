-- Nettoyage ponctuel : suppression des mouvements du 04/08/2026
-- ATTENTION : ne supprime que les mouvements NON facturés.
-- Si des mouvements de cette date sont déjà facturés, ils seront listés
-- par la première requête (SELECT) mais ignorés par le DELETE, pour éviter
-- de casser une facture existante.

-- 1) Vérification avant suppression : voir ce qui va être supprimé / ignoré
SELECT id, date, heure, client_id, circuit_id, facture_id,
       CASE WHEN facture_id IS NOT NULL THEN 'IGNORÉ (déjà facturé)' ELSE 'À SUPPRIMER' END AS action
FROM mouvements
WHERE date = '2026-08-04'
ORDER BY heure;

-- 2) Suppression effective (mouvements non facturés uniquement)
DELETE FROM mouvements
WHERE date = '2026-08-04'
  AND facture_id IS NULL;