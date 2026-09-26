-- Migration : module Réservations Hôtels
-- Sûre à rejouer (IF NOT EXISTS partout), dans la continuité des autres
-- fichiers migration_*.sql du projet.

DO $$ BEGIN
    CREATE TYPE etat_reservation AS ENUM ('en_attente', 'option', 'confirmee', 'refusee', 'annulee');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE type_pension AS ENUM ('sans_pension', 'petit_dejeuner', 'demi_pension', 'pension_complete', 'all_inclusive');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS hotels (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(150) NOT NULL,
    ville VARCHAR(100) NOT NULL,
    pays VARCHAR(100) NOT NULL,
    categorie_etoiles INTEGER,
    adresse VARCHAR(255),
    telephone VARCHAR(30),
    email VARCHAR(150),
    contact_reservation VARCHAR(150),
    observations TEXT,
    actif BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS ix_hotels_nom ON hotels (nom);

CREATE TABLE IF NOT EXISTS dossiers_hotels (
    id SERIAL PRIMARY KEY,
    numero_dossier VARCHAR(50) UNIQUE NOT NULL,
    agence_id INTEGER REFERENCES agences(id),
    circuit_id INTEGER REFERENCES circuits(id),
    date_arrivee DATE,
    heure_arrivee TIME,
    numero_vol_arrivee VARCHAR(30),
    compagnie_arrivee VARCHAR(100),
    date_depart DATE,
    heure_depart TIME,
    numero_vol_depart VARCHAR(30),
    compagnie_depart VARCHAR(100),
    nb_personnes INTEGER,
    nb_chambres INTEGER,
    observations TEXT,
    date_creation TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dossiers_hotels_numero ON dossiers_hotels (numero_dossier);

CREATE TABLE IF NOT EXISTS reservations_hotels (
    id SERIAL PRIMARY KEY,
    dossier_id INTEGER NOT NULL REFERENCES dossiers_hotels(id) ON DELETE CASCADE,
    hotel_id INTEGER NOT NULL REFERENCES hotels(id),
    date_arrivee DATE NOT NULL,
    date_depart DATE NOT NULL,
    nb_personnes INTEGER,
    nb_chambres INTEGER,
    chambres_single INTEGER NOT NULL DEFAULT 0,
    chambres_double INTEGER NOT NULL DEFAULT 0,
    chambres_twin INTEGER NOT NULL DEFAULT 0,
    chambres_triple INTEGER NOT NULL DEFAULT 0,
    type_pension type_pension,
    etat etat_reservation NOT NULL DEFAULT 'en_attente',
    hotel_remplacement_id INTEGER REFERENCES hotels(id),
    observations TEXT
);