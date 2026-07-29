DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_vehicule') THEN
        CREATE TYPE type_vehicule AS ENUM ('mini_bus', 'quatre_quatre', 'microbus', 'bus');
    END IF;
END$$;

ALTER TABLE vehicules
    ADD COLUMN IF NOT EXISTS type_vehicule type_vehicule NOT NULL DEFAULT 'mini_bus';

ALTER TABLE tarifs_clients
    ADD COLUMN IF NOT EXISTS type_vehicule type_vehicule NULL;

ALTER TABLE mouvements
    ADD COLUMN IF NOT EXISTS nb_personnes INTEGER NULL;