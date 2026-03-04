-- Migration : ajout des colonnes OAuth Outlook dans agency_email_configs
-- À exécuter une seule fois en production :
--   psql $DATABASE_URL -f migration_outlook_oauth.sql
-- Ou via Railway :
--   railway run psql $DATABASE_URL -f migration_outlook_oauth.sql

ALTER TABLE agency_email_configs
  ADD COLUMN IF NOT EXISTS outlook_access_token  TEXT,
  ADD COLUMN IF NOT EXISTS outlook_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS outlook_token_expiry  TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS outlook_email         VARCHAR;
