-- Migration : ajout champ terms_accepted_at sur la table users
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP NULL;
