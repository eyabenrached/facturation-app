-- Migration : module Comptabilité, phase 1 (plan comptable + journal + écritures automatiques)
-- Idempotente : peut être rejouée sans risque. À exécuter sur la base existante :
--     psql "$DATABASE_URL" -f migration_compta_v2.sql
-- (Base.metadata.create_all() crée les mêmes tables au démarrage du backend ;
--  ce fichier sert pour un déploiement explicite, ex. base Neon / Render.)

CREATE TABLE IF NOT EXISTS comptes_comptables (
    id SERIAL PRIMARY KEY,
    numero VARCHAR(10) NOT NULL,
    libelle VARCHAR(150) NOT NULL,
    classe INTEGER NOT NULL,
    actif BOOLEAN NOT NULL DEFAULT true,
    systeme BOOLEAN NOT NULL DEFAULT false,
    date_creation TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_comptes_comptables_numero ON comptes_comptables(numero);
CREATE INDEX IF NOT EXISTS ix_comptes_comptables_classe ON comptes_comptables(classe);

CREATE TABLE IF NOT EXISTS ecritures_comptables (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    numero_piece VARCHAR(40) NOT NULL,
    journal VARCHAR(5) NOT NULL DEFAULT 'OD',
    libelle VARCHAR(255) NOT NULL,
    reference VARCHAR(100),
    type_operation VARCHAR(30) NOT NULL DEFAULT 'manuelle',
    source_type VARCHAR(30),
    source_id INTEGER,
    source_evenement VARCHAR(30),
    cloturee BOOLEAN NOT NULL DEFAULT false,
    utilisateur_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
    date_creation TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_ecriture_source UNIQUE (source_type, source_id, source_evenement)
);
CREATE INDEX IF NOT EXISTS ix_ecritures_comptables_date ON ecritures_comptables(date);
CREATE INDEX IF NOT EXISTS ix_ecritures_comptables_numero_piece ON ecritures_comptables(numero_piece);
CREATE INDEX IF NOT EXISTS ix_ecritures_comptables_type_operation ON ecritures_comptables(type_operation);

CREATE TABLE IF NOT EXISTS lignes_ecritures (
    id SERIAL PRIMARY KEY,
    ecriture_id INTEGER NOT NULL REFERENCES ecritures_comptables(id) ON DELETE CASCADE,
    compte_id INTEGER NOT NULL REFERENCES comptes_comptables(id),
    compte_auxiliaire VARCHAR(150),
    libelle VARCHAR(255),
    debit NUMERIC(14, 3) NOT NULL DEFAULT 0,
    credit NUMERIC(14, 3) NOT NULL DEFAULT 0,
    CONSTRAINT ck_ligne_montants_positifs CHECK (debit >= 0 AND credit >= 0)
);
CREATE INDEX IF NOT EXISTS ix_lignes_ecritures_ecriture_id ON lignes_ecritures(ecriture_id);
CREATE INDEX IF NOT EXISTS ix_lignes_ecritures_compte_id ON lignes_ecritures(compte_id);

-- Plan comptable par défaut (sans écraser les comptes déjà présents).
INSERT INTO comptes_comptables (numero, libelle, classe, systeme) VALUES
 ('101000','Capital social',1,false), ('110000','Report à nouveau',1,false), ('120000','Résultat de l''exercice',1,false),
 ('215000','Matériel et outillage',2,false), ('218000','Matériel de transport',2,false),
 ('310000','Stocks de fournitures',3,false),
 ('401000','Fournisseurs',4,true), ('411000','Clients',4,true), ('421000','Personnel - rémunérations dues',4,false),
 ('431000','CNSS',4,false), ('445660','TVA déductible',4,true), ('445710','TVA collectée',4,true),
 ('445800','État - TVA à payer',4,false), ('447000','Droits de timbre fiscal',4,true),
 ('512000','Banque',5,true), ('530000','Caisse',5,true),
 ('601000','Achats',6,false), ('606000','Carburant',6,true), ('613000','Locations',6,false),
 ('615000','Entretien et réparations',6,true), ('616000','Primes d''assurance',6,true),
 ('625000','Voyages et déplacements',6,false), ('626000','Télécommunications',6,false),
 ('627000','Services bancaires',6,false), ('628000','Autres services',6,true), ('635000','Impôts et taxes',6,true),
 ('641000','Rémunérations du personnel',6,true), ('645000','Charges sociales (CNSS)',6,true),
 ('706000','Prestations de services',7,true), ('707000','Ventes',7,false)
ON CONFLICT (numero) DO NOTHING;

-- ===== Phase 2 : règlements clients (paiements partiels) =====
CREATE TABLE IF NOT EXISTS paiements_factures (
    id SERIAL PRIMARY KEY,
    facture_id INTEGER REFERENCES factures(id) ON DELETE CASCADE,
    facture_location_id INTEGER REFERENCES factures_location(id) ON DELETE CASCADE,
    montant NUMERIC(14, 3) NOT NULL,
    date DATE NOT NULL,
    mode VARCHAR(20) NOT NULL DEFAULT 'virement',
    reference VARCHAR(100),
    note VARCHAR(255),
    utilisateur_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
    date_creation TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT ck_paiement_une_facture CHECK (
        (facture_id IS NOT NULL AND facture_location_id IS NULL) OR
        (facture_id IS NULL AND facture_location_id IS NOT NULL)),
    CONSTRAINT ck_paiement_montant_positif CHECK (montant > 0)
);
CREATE INDEX IF NOT EXISTS ix_paiements_factures_facture_id ON paiements_factures(facture_id);
CREATE INDEX IF NOT EXISTS ix_paiements_factures_facture_location_id ON paiements_factures(facture_location_id);
CREATE INDEX IF NOT EXISTS ix_paiements_factures_date ON paiements_factures(date);
