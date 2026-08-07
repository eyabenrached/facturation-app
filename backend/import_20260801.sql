
-- 2) Les 4 mouvements du 2026-08-02
-- (ligne 4 : chauffeur absent remplacé par taxi, aucun prix indiqué -> tarif habituel
--  de ce trajet à 14h repris : 120 TND)
INSERT INTO mouvements (date, heure, client_id, circuit_id, chauffeur_id, vehicule_id, transporteur_id, nb_personnes, prix_applique)
SELECT
    '2026-08-02'::date,
    v.heure::time,
    c.id, ci.id, ch.id, ve.id, ag.id, v.nb_personnes, v.prix
FROM (VALUES
    ('06:00:00','Raoued','Zi Kram','WALID','3427TU180',5,120),
    ('06:00:00','Zahrouni','ZI Kram','RAHMANI','5504 TU 239',6,120),
    ('14:00:00','ZI Kram','Zahrouni','RAHMANI','5504 TU 239',6,120),
    ('14:00:00','ZI Kram','Raoued','WALID','3427TU180',0,120)
) AS v(heure, depart, arrivee, chauffeur, matricule, nb_personnes, prix)
JOIN clients c ON c.nom_societe = 'FEINMETALL Tunisie'
JOIN circuits ci ON ci.point_depart ILIKE v.depart AND ci.point_arrivee ILIKE v.arrivee
LEFT JOIN chauffeurs ch ON ch.nom ILIKE v.chauffeur
LEFT JOIN vehicules ve ON REPLACE(ve.matricule,' ','') ILIKE REPLACE(v.matricule,' ','')
LEFT JOIN agences ag ON ag.nom_agence ILIKE 'Eurafr tours%';