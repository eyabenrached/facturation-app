-- Migration : historique des actions sur les dossiers hôtels
-- Sûre à rejouer (IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS historique_dossiers_hotels (
    id SERIAL PRIMARY KEY,
    dossier_id INTEGER NOT NULL REFERENCES dossiers_hotels(id) ON DELETE CASCADE,
    date_action TIMESTAMP NOT NULL DEFAULT now(),
    action VARCHAR(100) NOT NULL,
    details TEXT,
    utilisateur_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_historique_dossiers_hotels_dossier
    ON historique_dossiers_hotels (dossier_id);
