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
