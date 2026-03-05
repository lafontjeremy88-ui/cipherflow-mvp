# Procédures opérationnelles CipherFlow

## Backup base de données

```bash
# Connexion Railway → dump complet
railway connect Postgres
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

Fréquence recommandée : **quotidien** (Railway Postgres fait des backups automatiques, vérifier dans Settings).

---

## Restore base de données

```bash
psql $DATABASE_URL < backup.sql
```

> ⚠️ Toujours tester la restauration sur un environnement de staging avant de l'appliquer en production.

---

## Restart services Railway

```bash
railway restart --service backend
railway restart --service watcher
railway restart --service worker
```

---

## Migrations SQL

1. Tester la migration sur une copie du backup
2. Appliquer en prod :

```bash
railway connect Postgres
\i docs/migration_nom.sql
# ou
psql $DATABASE_URL -f docs/migration_nom.sql
```

Migrations disponibles dans `docs/` :
- `migration_auto_reply.sql`
- `migration_agency_blacklist.sql`
- `migration_email_feedback.sql`
- `migration_terms_accepted.sql`
- `migration_heartbeat.sql`

---

## Si le watcher tombe

1. Vérifier les logs Railway : `railway logs --service watcher`
2. Vérifier les tokens OAuth expirés (Gmail / Outlook dans Settings)
3. Redémarrer : `railway restart --service watcher`
4. Vérifier le heartbeat en base :

```sql
SELECT id, name, last_watcher_heartbeat FROM agencies;
```

---

## Si Mistral est KO

- Le système est en **fail-open** : les emails passent quand même (classification désactivée)
- Vérifier le statut : https://status.mistral.ai
- Vérifier que `MISTRAL_API_KEY` est valide et non expirée

---

## Si Railway est down

- Statut Railway : https://status.railway.app
- Le **frontend Vercel continue de fonctionner** (pages statiques)
- Les emails entrants sont mis en file Redis (RQ) et retraités au redémarrage automatique

---

## Monitoring heartbeat

Le backend envoie une alerte email à `ADMIN_EMAIL` si un watcher
est inactif depuis plus de 10 minutes.

Pour désactiver temporairement (maintenance) :
```bash
railway variables set ENABLE_HEARTBEAT_MONITOR=false --service backend
railway restart --service backend
```

---

## Variables d'environnement critiques

| Variable | Service | Description |
|---|---|---|
| `JWT_SECRET_KEY` | backend | Signature JWT — ne jamais changer en prod |
| `FERNET_KEY` | backend | Chiffrement tokens OAuth en DB — ne jamais changer |
| `WATCHER_SECRET` | backend + watcher | Authentification webhook |
| `MISTRAL_API_KEY` | backend | Clé API Mistral AI |
| `RESEND_API_KEY` | backend | Envoi emails sortants |
| `ADMIN_EMAIL` | backend | Destinataire des alertes heartbeat |
| `DATABASE_URL` | backend + worker | Connexion PostgreSQL |
| `REDIS_URL` | backend + worker | File de jobs RQ |
