-- Insertion de tous les véhicules dans la base "facturation"
-- A exécuter avec : psql -U postgres -d facturation -f seed_vehicules_complet.sql

INSERT INTO vehicules (matricule, agence_id, ambiance_voyage, remarque)
SELECT v.matricule, a.id, NULL, NULLIF(v.remarque, '')
FROM (VALUES
    ('7420TU139', 'Eurafr tour', ''),
    ('6006TU170', 'Eurafr tour', ''),
    ('3426TU180', 'Eurafr tour', ''),
    ('3427TU180', 'Eurafr tour', ''),
    ('1256TU186', 'Eurafr tour', ''),
    ('1259TU186', 'Eurafr tour', ''),
    ('1699TU193', 'Eurafr tour', ''),
    ('1702TU193', 'Eurafr tour', ''),
    ('728TU206', 'Eurafr tour', ''),
    ('6363TU168', 'Eurafr tour', ''),
    ('8430TU205', 'Eurafr tour', ''),
    ('8435TU205', 'Eurafr tour', ''),
    ('BEN MOULAHEM', 'BM Travel', 'location'),
    ('extra', 'Autre', ''),
    ('extra-dominos', 'Dominos Tra', ''),
    ('extra-hyper', 'Hyper Trave', ''),
    ('2977 TU 211', 'Eurafr tour', ''),
    ('2978 TU 211', 'Eurafr tour', ''),
    ('5748 TU 211', 'Eurafr tour', ''),
    ('5746 TU 211', 'Eurafr tour', ''),
    ('Extra-zoom', 'Zoom Voyage', 'location'),
    ('Extra-funny', 'FUNNY TIME', 'Location'),
    ('8261 TU 99', 'Eurafr tour', 'PICK UP'),
    ('3891 TU 217', 'Eurafr tour', 'TOYOTA 23 Places'),
    ('3890 TU 217', 'Eurafr tour', 'TOYOTA 23 Places'),
    ('Maktaris Travel', 'Maktaris Tr', 'Location'),
    ('Sun Beach Travel', 'SUN BEACH T', 'Location'),
    ('2991 TU 221', 'Eurafr tour', 'TOYOTA 23 Places'),
    ('2992 TU 221', 'Eurafr tour', 'TOYOTA 23 Places'),
    ('Souvenir', 'Autre', ''),
    ('Mahdi Travel', 'Autre', ''),
    ('Funny', 'Autre', ''),
    ('Mon Agence', 'Autre', ''),
    ('5503 TU 239', 'Eurafr tour', 'Toyota 23 Places'),
    ('5504 TU 239', 'Eurafr tour', 'Toyota 23 Places'),
    ('RS251844', 'Eurafr tour', 'Prado'),
    ('3033 TU 247', 'Eurafr tour', 'Iveco 29 places'),
    ('3035 TU 247', 'Eurafr tour', 'Iveco 29 places'),
    ('3036 TU 247', 'Eurafr tour', 'Mini Bus Iveco 29 Places'),
    ('3037 TU 247', 'Eurafr tour', 'Mini Bus Iveco 29 Places'),
    ('7057 TU 255', 'Eurafr tour', 'TOYOTA 16 PLACES'),
    ('3028 TU 257', 'Eurafr tour', 'TOYOTA 22 PLACES'),
    ('3029 TU 257', 'Eurafr tour', 'TOYOTA 22 PLACES'),
    ('3030 TU 257', 'Eurafr tour', 'TOYOTA 22 PLACES'),
    ('RS 284233', 'Eurafr tour', 'TOYOTA PRADO')
) AS v(matricule, agence_recherche, remarque)
JOIN agences a ON a.nom_agence ILIKE v.agence_recherche || '%'
ON CONFLICT (matricule) DO NOTHING;

-- Les 7 véhicules sans matricule (nom d'agence utilisé comme matricule provisoire)
INSERT INTO vehicules (matricule, agence_id, ambiance_voyage, remarque)
SELECT v.matricule, a.id, NULL, NULLIF(v.remarque, '')
FROM (VALUES
    ('CONFIANCE', 'Confiance Voyages', ''),
    ('CONGRESS', 'CONGRESS TOUR TUNISIE', ''),
    ('FRIDOU', 'Fridou voyages', ''),
    ('JOURY', 'Joury Travel', ''),
    ('LOVE', 'Love''s Tours', ''),
    ('LINK', 'Tunisia Link Tour', ''),
    ('TUNIVERSEL', 'Tuniversel Voyage', '')
) AS v(matricule, agence_recherche, remarque)
JOIN agences a ON a.nom_agence = v.agence_recherche
ON CONFLICT (matricule) DO NOTHING;