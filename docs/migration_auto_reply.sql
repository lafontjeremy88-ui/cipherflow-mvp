-- Migration : ajout colonnes auto-reply dans app_settings
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS auto_reply_delay_minutes INTEGER NOT NULL DEFAULT 0;
