-- ============================================================
-- MIGRATION CipherFlow — OAuth Gmail
-- Remplace les champs IMAP par les tokens OAuth Gmail
-- dans la table agency_email_configs
--
-- ⚠️  À exécuter UNE SEULE FOIS sur Railway
--     railway run psql $DATABASE_URL -f migration_gmail_oauth.sql
-- ============================================================

BEGIN;

-- Ajout des colonnes OAuth Gmail
ALTER TABLE agency_email_configs
    ADD COLUMN IF NOT EXISTS gmail_access_token  TEXT,
    ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT,
    ADD COLUMN IF NOT EXISTS gmail_token_expiry  TIMESTAMP,
    ADD COLUMN IF NOT EXISTS gmail_email         VARCHAR;  -- adresse Gmail connectée

-- On garde les colonnes IMAP existantes pour l'instant (rétrocompatibilité)
-- Elles seront supprimées dans une migration ultérieure une fois le déploiement validé

-- Vérification
SELECT
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'agency_email_configs'
ORDER BY ordinal_position;

COMMIT;
