-- Migration : ajout champ last_watcher_heartbeat sur la table agencies
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS last_watcher_heartbeat TIMESTAMP NULL;
