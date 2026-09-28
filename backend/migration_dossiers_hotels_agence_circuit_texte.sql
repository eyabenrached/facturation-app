-- Migration : agence et circuit des dossiers hôtels en saisie libre (texte)
-- Sûre à rejouer. Les anciennes colonnes agence_id / circuit_id sont conservées
-- (données historiques) mais l'application n'y touche plus.
-- Note : le backend exécute déjà ces instructions au démarrage.
ALTER TABLE dossiers_hotels ADD COLUMN IF NOT EXISTS agence_nom VARCHAR(150);
ALTER TABLE dossiers_hotels ADD COLUMN IF NOT EXISTS circuit_nom VARCHAR(200);

UPDATE dossiers_hotels d
SET agence_nom = a.nom_agence
FROM agences a
WHERE d.agence_id = a.id AND d.agence_nom IS NULL;

UPDATE dossiers_hotels d
SET circuit_nom = c.point_depart || ' - ' || c.point_arrivee
FROM circuits c
WHERE d.circuit_id = c.id AND d.circuit_nom IS NULL;
