-- Migration RGPD : suppression du contenu brut des emails stockés en clair
-- À exécuter UNE SEULE FOIS en production.
-- Le champ raw_email_text n'est plus alimenté depuis le pipeline (email_pipeline.py).
-- Cette migration vide les valeurs existantes.
--
-- ATTENTION : opération irréversible. Sauvegarder la base avant exécution.

-- 1. Vider les valeurs existantes (conformité RGPD)
UPDATE email_analyses
SET raw_email_text = NULL
WHERE raw_email_text IS NOT NULL;

-- 2. Vérification
SELECT COUNT(*) AS remaining_raw_texts
FROM email_analyses
WHERE raw_email_text IS NOT NULL;
-- Doit retourner 0.

-- Note : la colonne est conservée pour éviter une migration DDL destructive.
-- Elle peut être supprimée lors d'une prochaine fenêtre de maintenance :
--   ALTER TABLE email_analyses DROP COLUMN raw_email_text;
