-- ============================================================
-- MIGRATION CipherFlow — Points 1 & 5
-- Ajoute le tracking pipeline sur email_analyses
-- + normalise les candidate_email existants dans tenant_files
-- 
-- ⚠️  À exécuter UNE SEULE FOIS sur la base Railway PostgreSQL
--     Commande Railway : railway run psql $DATABASE_URL -f migration_processing_status.sql
-- ============================================================

BEGIN;

-- ── 1. Nouveaux champs sur email_analyses ─────────────────────────────────────

ALTER TABLE email_analyses
    ADD COLUMN IF NOT EXISTS processing_status VARCHAR DEFAULT 'pending' NOT NULL,
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS processing_error TEXT;

-- Index pour filtrer rapidement les emails en erreur dans l'UI
CREATE INDEX IF NOT EXISTS ix_email_analyses_processing_status
    ON email_analyses (processing_status);

-- Tous les emails déjà en base sont considérés comme traités avec succès
UPDATE email_analyses
SET processing_status = 'success',
    processed_at = updated_at
WHERE processing_status = 'pending';

-- ── 2. Normalisation des candidate_email existants dans tenant_files ──────────
-- Applique : lowercase + suppression alias Gmail (+tag) + suppression points Gmail

UPDATE tenant_files
SET candidate_email = LOWER(
    CASE
        -- Gmail / Googlemail : supprime les points ET les alias +tag
        WHEN LOWER(SPLIT_PART(candidate_email, '@', 2)) IN ('gmail.com', 'googlemail.com')
        THEN
            REPLACE(
                SPLIT_PART(SPLIT_PART(LOWER(candidate_email), '+', 1), '@', 1),
                '.', ''
            )
            || '@' || LOWER(SPLIT_PART(candidate_email, '@', 2))

        -- Autres domaines : supprime uniquement l'alias +tag
        ELSE
            SPLIT_PART(SPLIT_PART(LOWER(candidate_email), '+', 1), '@', 1)
            || '@' || LOWER(SPLIT_PART(candidate_email, '@', 2))
    END
)
WHERE candidate_email IS NOT NULL
  AND candidate_email != '';

-- Vérification (tu peux commenter ce SELECT si tu exécutes en non-interactif)
SELECT
    (SELECT COUNT(*) FROM email_analyses WHERE processing_status = 'success') AS emails_migres,
    (SELECT COUNT(*) FROM email_analyses WHERE processing_status = 'pending') AS emails_pending,
    (SELECT COUNT(*) FROM tenant_files WHERE candidate_email IS NOT NULL) AS dossiers_normalises;

COMMIT;
