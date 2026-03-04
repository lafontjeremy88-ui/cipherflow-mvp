# AUDIT SÉCURITÉ & QUALITÉ — CipherFlow
**Date :** 2026-03-04
**Périmètre :** Backend FastAPI + Frontend React + Watcher
**Score global : 5.5 / 10**

---

## RÉSUMÉ EXÉCUTIF

| Sévérité | Nb | Exemples |
|----------|----|---------|
| 🔴 CRITIQUE | 4 | JWT en localStorage, RGPD raw_email_text |
| 🟠 ÉLEVÉE   | 6 | Watcher 429 sans retry, webhook payload non typé |
| 🟡 MOYENNE  | 5 | Gemini fail-open, PII en logs, API_BASE hardcodée |
| 🔵 INFO     | 3 | allow_headers=["*"], print() vs logger |

---

## SECTION 1 — SÉCURITÉ

### 1a. Authentification endpoints

**✅ Tous les endpoints sensibles sont protégés.**

- Endpoints publics intentionnels : `/auth/register`, `/auth/login`, `/auth/refresh`, `/oauth/*`, `/webhook/email`, `/health`
- Endpoints watcher : protégés par `x-watcher-secret` + `hmac.compare_digest` sur `/watcher/*`
- Tous les endpoints métier ont `Depends(get_current_user_db)`

### 1b. Secrets hardcodés

**✅ Aucun secret hardcodé détecté.** Tous les secrets passent par `core/config.py` via `os.getenv()`.

⚠️ **MOYENNE** — `google_oauth.py` : liste `ALLOWED_EMAILS` (whitelist beta 3 emails hardcodés). À retirer avant ouverture publique.

### 1c. Chiffrement tokens en base

**✅ Tous les tokens OAuth sont chiffrés avec Fernet.**

| Colonne | Chiffré | Où |
|---------|---------|-----|
| `gmail_access_token` | ✅ Fernet | `gmail_oauth_routes.py` |
| `gmail_refresh_token` | ✅ Fernet | `gmail_oauth_routes.py` |
| `outlook_access_token` | ✅ Fernet | `outlook_oauth_routes.py` |
| `outlook_refresh_token` | ✅ Fernet | `outlook_oauth_routes.py` |
| `imap_password_encrypted` | ✅ Fernet | `settings_routes.py` |
| `hashed_password` (User) | ✅ bcrypt | `auth_routes.py` |
| `token_hash` (RefreshToken) | ✅ SHA-256 | `auth_routes.py` |

### 1d. Webhook watcher

**✅ `/webhook/email` utilise `hmac.compare_digest()`** (résistant aux timing attacks).
⚠️ **ÉLEVÉE** — Si `WATCHER_SECRET` est vide (non configuré), la comparaison passe et aucune protection n'est active. Ajouter une vérification `if not WATCHER_SECRET: raise HTTPException(500)` au démarrage.

### 1e. CORS

**✅ Whitelist explicite**, pas de `allow_origins=["*"]`.
🔵 **INFO** — `allow_headers=["*"]` : acceptable mais pourrait être restreint à `["Content-Type", "Authorization", "x-watcher-secret"]`.

---

## SECTION 2 — BASE DE DONNÉES

### Tables ORM

| Table | Lignes clés | Données sensibles | Statut |
|-------|------------|-------------------|--------|
| `Agency` | name, email_alias | nom agence | OK |
| `User` | email, hashed_password, agency_id | email en clair | Nécessaire |
| `AgencyEmailConfig` | gmail/outlook tokens (chiffrés) | tokens chiffrés ✅ | OK |
| `AppSettings` | company_name, tone, signature | config métier | OK |
| `EmailAnalysis` | sender_email, **raw_email_text** | ⚠️ email brut en clair | RGPD ❌ |
| `TenantFile` | candidate_email, candidate_name | PII en clair | RGPD ⚠️ |
| `FileAnalysis` | filename (clé R2), file_hash | fichiers en R2 | OK |
| `RefreshToken` | token_hash (SHA-256), expires_at | hash seulement ✅ | OK |

### Findings DB

🔴 **CRITIQUE** — `EmailAnalysis.raw_email_text` : corps complet de l'email candidat stocké en clair. RGPD : données personnelles de tiers sans consentement explicite.
**Recommandation :** Ne stocker que `summary` (déjà pseudonymisé par Mistral). Supprimer `raw_email_text` après traitement ou le chiffrer.

🟡 **MOYENNE** — `TenantFile.candidate_email` + `candidate_name` stockés en clair : acceptable pour la fonctionnalité mais nécessite une mention dans la politique de confidentialité et une durée de retention.

✅ **Relations/cascades :** Correctement configurées (cascade `all, delete-orphan` sur Agency → users, TenantFile → liens).

---

## SECTION 3 — ENDPOINTS API

### Tableau complet

| Méthode | Path | Auth | Validation | Erreur |
|---------|------|------|-----------|--------|
| POST | /auth/register | ❌ pub | Pydantic ✅ | try/except ✅ |
| POST | /auth/login | ❌ pub | rate_limit ✅ | 401/403 ✅ |
| POST | /auth/refresh | 🍪 cookie | token_hash ✅ | 401 ✅ |
| POST | /auth/logout | 🍪 cookie | revoke ✅ | 200 ✅ |
| GET | /gmail/connect | ✅ JWT | agency_id ✅ | 400 ✅ |
| GET | /gmail/callback | ❌ pub | HMAC state ✅ | Redirect ✅ |
| GET | /outlook/connect | ✅ JWT | agency_id ✅ | 400 ✅ |
| GET | /outlook/callback | ❌ pub | HMAC state ✅ | Redirect ✅ |
| POST | /webhook/email | 🔑 secret | HMAC ✅ | 403 ✅ |
| POST | /email/process | ✅ JWT | FormData ✅ | try/except ✅ |
| GET | /api/files/view/{id} | ✅ JWT | ownership ✅ | 404 ✅ |
| DELETE | /api/files/{id} | ✅ JWT | ownership ✅ | 404 ✅ |
| GET | /watcher/configs | 🔑 secret | secret ✅ | 403 ✅ |
| POST | /watcher/update-token | 🔑 secret | Pydantic ✅ | 404 ✅ |
| POST | /watcher/update-outlook-token | 🔑 secret | Pydantic ✅ | 404 ✅ |
| GET | /watcher/check-sender | 🔑 secret | HMAC ✅ | 403 ✅ |

### Findings endpoints

🟠 **ÉLEVÉE** — `POST /webhook/email` (`main.py:99`) : le payload est lu via `request.json()` sans modèle Pydantic. Un champ manquant provoque une `KeyError` non catchée.
**Fix :** Créer une classe `WebhookPayload(BaseModel)` avec tous les champs attendus.

🟠 **ÉLEVÉE** — `WATCHER_SECRET` vide = `/webhook/email` non protégé (condition `if WATCHER_SECRET and not hmac...` passe si vide).

🟡 **MOYENNE** — `GET /watcher/check-sender` : le paramètre `email` n'est pas validé comme adresse email valide. Un attaquant avec le `WATCHER_SECRET` pourrait injecter des valeurs malformées.

---

## SECTION 4 — WATCHER

### Résilience Gmail

✅ `watch_agency_gmail()` : exceptions catchées dans la boucle principale, le thread continue.
✅ `refresh_if_needed()` : rafraîchit le token, notifie le backend, propage l'exception si échec (thread pausé jusqu'au prochain cycle).
✅ `PAUSE_BETWEEN_EMAILS_SEC` + `MAX_EMAILS_PER_LOOP` : protection contre les rate limits Gmail.

### Résilience Outlook

🟠 **ÉLEVÉE** — Pas de gestion du code `429 Too Many Requests` de Graph API. Le watcher ne lit pas `Retry-After` et relance immédiatement après `POLL_INTERVAL_SEC`.
**Fix :** Ajouter `if resp.status_code == 429: time.sleep(int(resp.headers.get("Retry-After", 60)))`.

✅ `refresh_outlook_token_if_needed()` : vérifie l'expiry 5 min avant, rafraîchit, notifie le backend.
✅ Fail-open sur `GEMINI_API_KEY` absent.
✅ `_mark_outlook_read()` log succès/erreur + envoie `Content-Type: application/json`.

### Anti-boucle

✅ **Gmail** : vérification `X-CipherFlow-Origin` header fonctionne.
🟠 **ÉLEVÉE (résiduel)** — **Outlook** : `internetMessageHeaders` a été retiré du `$select` (fix précédent). L'anti-boucle Outlook vérifie `message.get("internetMessageHeaders", [])` qui est toujours vide → **l'anti-boucle Outlook est inactive**.
**Fix :** Faire un appel individuel `GET /me/messages/{id}?$select=internetMessageHeaders` avant traitement, OU ajouter un champ distinct dans le webhook payload pour marquer les réponses CipherFlow et filtrer côté watcher via le champ `subject` ou `bodyPreview`.

### `decide_filter()`

🟠 **ÉLEVÉE** — `is_known_sender()` fait une requête HTTP synchrone (timeout=3s). Si le backend est down, `requests.get()` lève une exception catchée → retourne `False`. Mais si `CHECK_SENDER_URL` est malformée, `requests.exceptions.MissingSchema` non catchée peut crasher le thread.

---

## SECTION 5 — FRONTEND

### Stockage du token

🔴 **CRITIQUE** — L'access token JWT est stocké en `localStorage` dans 4 fichiers :
- `App.jsx:47` — `localStorage.setItem(LS_ACCESS, token)`
- `services/api.js:21` — `localStorage.setItem(LS_TOKEN, token)`
- `components/Login.jsx:49`
- `pages/OAuthCallback.jsx:37`

**Impact :** Tout script JavaScript exécuté dans la page (XSS, supply chain) peut lire `localStorage` et voler le token.
**Fix :** Migrer l'access token vers un cookie `HttpOnly; Secure; SameSite=Strict`. Le backend `/auth/refresh` est déjà prêt (refresh token en cookie HttpOnly).

### Gestion 401/403

✅ `authFetch` dans `App.jsx` gère les 401 avec refresh automatique.
✅ Si le refresh échoue → `clearStoredAuth()` + redirect `/login`.

### Console.log / PII

🟡 **MOYENNE** — `google_oauth.py` lignes ~122-126 : `print(f"✅ Utilisateur existant trouvé: {email}")` — email utilisateur visible dans les logs Railway.
**Fix :** Remplacer par `log.info("[google_oauth] Utilisateur existant trouvé agency=%s", agency_id)` sans l'email.

### API_BASE hardcodée

🟠 **ÉLEVÉE** — `App.jsx:36` : `const API_BASE = "https://cipherflow-mvp-production.up.railway.app"` hardcodée.
**Fix :** `const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000"` + variable dans `.env`.

---

## SECTION 6 — TESTS FONCTIONNELS

> Note : Les tests pytest ci-dessous sont des cas de test recommandés, non exécutés automatiquement dans cet audit.

### Tests prioritaires à implémenter

```python
# tests/test_auth.py
def test_login_success()
def test_login_wrong_password()
def test_login_rate_limit()
def test_refresh_token_valid()
def test_refresh_token_expired()
def test_logout_revokes_token()

# tests/test_oauth_google.py
def test_google_callback_valid_state()
def test_google_callback_invalid_state()
def test_google_callback_creates_user_and_agency()

# tests/test_oauth_outlook.py
def test_outlook_callback_valid_code()
def test_outlook_callback_error_param()  # ?error=server_error
def test_outlook_callback_missing_tokens()
def test_outlook_disconnect()

# tests/test_webhook.py
def test_webhook_valid_secret()
def test_webhook_missing_secret()
def test_webhook_empty_secret_env()  # WATCHER_SECRET vide = no protection

# tests/test_watcher_filter.py
def test_decide_filter_system_blacklist()
def test_decide_filter_microsoft_domains()
def test_decide_filter_with_attachments()
def test_decide_filter_immo_keywords()
def test_decide_filter_spam()

# tests/test_documents.py
def test_upload_document()
def test_download_document_own_agency()
def test_download_document_other_agency()  # doit retourner 403
def test_delete_document()
```

---

## RECOMMANDATIONS PRIORITAIRES

### P0 — Avant production (bloquant)

1. **Migrer JWT → cookie HttpOnly** (`App.jsx`, `Login.jsx`, `OAuthCallback.jsx`, `services/api.js`)
2. **Watcher secret obligatoire** : lever une erreur au démarrage si `WATCHER_SECRET` vide
3. **Supprimer `raw_email_text`** de `EmailAnalysis` ou le chiffrer (RGPD)
4. **Anti-boucle Outlook** : restaurer la vérification des headers (appel individuel ou via subject)
5. **Retirer `ALLOWED_EMAILS`** dans `google_oauth.py` avant ouverture publique

### P1 — Dans le prochain sprint

6. **Retry Outlook 429** : lire `Retry-After` dans `watch_agency_outlook()`
7. **Webhook payload Pydantic** : créer `WebhookPayload(BaseModel)` dans `main.py`
8. **API_BASE en env var** : `import.meta.env.VITE_API_URL`
9. **Nettoyer PII des logs** : retirer emails/noms des `print()` et `log.info()`
10. **CSP headers** : ajouter `Content-Security-Policy` dans les headers FastAPI

### P2 — Backlog

11. Écrire les tests pytest (auth, webhook, OAuth flows)
12. Restreindre `allow_headers` dans CORS
13. Valider `email` dans `/watcher/check-sender` avec `email-validator`
14. Exponential backoff généralisé dans le watcher
15. Durée de retention explicite pour `EmailAnalysis` (ex: 90 jours)

---

## SCORE DÉTAILLÉ

| Critère | Note | Commentaire |
|---------|------|-------------|
| Authentification | 8/10 | Tous les endpoints protégés, HMAC timing-safe |
| Chiffrement données | 7/10 | Tokens OK, raw_email_text problématique |
| Gestion erreurs | 6/10 | Bonne couverture, quelques trous webhook |
| Résilience watcher | 5/10 | Gmail OK, Outlook sans retry 429, anti-boucle inactive |
| Frontend sécurité | 3/10 | localStorage critique |
| Tests | 2/10 | Pas de tests automatisés |
| Conformité RGPD | 5/10 | Politique présente, raw_email_text, PII logs |

**Score global : 5.5 / 10**
