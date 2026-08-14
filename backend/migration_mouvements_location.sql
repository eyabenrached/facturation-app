-- Migration : création de la table mouvements_location, indépendante des
-- mouvements de facturation. Client, circuit et prix y sont saisis
-- librement (texte / numérique), sans lien avec les tables Client/Circuit
-- ni avec une Facture.
--
-- Sur une base neuve, Base.metadata.create_all() (au démarrage de l'API)
-- crée déjà cette table automatiquement : ce script sert uniquement à
-- mettre à jour une base existante sans redémarrage complet.
--   psql "TA_CHAINE_DE_CONNEXION" -f migration_mouvements_location.sql

CREATE TABLE IF NOT EXISTS mouvements_location (
    id              SERIAL PRIMARY KEY,
    date            DATE NOT NULL,
    heure           TIME NOT NULL,
    client          VARCHAR(150) NOT NULL,
    circuit         VARCHAR(200) NOT NULL,
    prix            NUMERIC(10, 3) NOT NULL,
    chauffeur_id    INTEGER NULL REFERENCES chauffeurs(id),
    vehicule_id     INTEGER NULL REFERENCES vehicules(id),
    transporteur_id INTEGER NULL REFERENCES agences(id),
    nb_personnes    INTEGER NULL,
    remarque        TEXT NULL
);

-- Table des factures indépendantes adossées à mouvements_location : le client
-- y est un texte libre (pas de FK vers "clients") et le taux de TVA est saisi
-- manuellement lors de la génération de la facture.
CREATE TABLE IF NOT EXISTS factures_location (
    id              SERIAL PRIMARY KEY,
    client          VARCHAR(150) NOT NULL,
    numero_facture  VARCHAR(50) NOT NULL UNIQUE,
    date_debut      DATE NOT NULL,
    date_fin        DATE NOT NULL,
    montant_ht      NUMERIC(12, 3) NOT NULL,
    taux_tva        NUMERIC(5, 2) NOT NULL,
    montant_tva     NUMERIC(12, 3) NOT NULL,
    montant_ttc     NUMERIC(12, 3) NOT NULL,
    statut          VARCHAR(20) NOT NULL DEFAULT 'impayee',
    date_creation   TIMESTAMP NOT NULL DEFAULT now(),
    date_paiement   DATE NULL
);

ALTER TABLE mouvements_location
    ADD COLUMN IF NOT EXISTS facture_id INTEGER NULL
    REFERENCES factures_location(id);
