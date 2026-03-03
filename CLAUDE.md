# CipherFlow (inbox-ia-pro) — Contexte projet pour Claude Code

> Fichier de référence lu automatiquement à chaque session.
> Basé sur le vrai code source du projet.

---

## Vue d'ensemble

CipherFlow est un SaaS multi-tenant pour agences immobilières indépendantes et petits syndics.
Il automatise le traitement des emails de candidatures locatives :
email entrant -> extraction PJ -> classification IA -> dossier locataire -> réponse auto.

Déployé : Backend Railway / Frontend Vercel / Stockage Cloudflare R2

---

## Stack technique réelle

Backend       : Python / FastAPI
Frontend      : React 18 + Vite + React Router
Base données  : PostgreSQL prod / SQLite dev
Stockage      : Cloudflare R2 via minio-py + chiffrement Fernet
IA docs       : Mistral pixtral-12b-2409 (images) + mistral-small-latest (PDF/texte)
IA emails     : Mistral mistral-small-latest
Auth users    : JWT (access 15min) + Refresh token (30j) en cookie HttpOnly
Auth login    : OAuth 2.0 Google via Authlib + validation cryptographique google-auth
Auth inbox    : OAuth 2.0 Gmail (gmail.modify + gmail.send)
Jobs async    : Redis + RQ (queue "emails")
Email sortant : Resend API
Rate limiting : slowapi

---

## Architecture réelle

```
inbox-ia-pro/
├── backend/app/
│   ├── api/
│   │   ├── auth_routes.py         # Register/login/refresh/logout/reset-password
│   │   ├── deps.py                # get_current_user_db (JWT -> User)
│   │   ├── email_routes.py        # /email/process (déclenchement manuel)
│   │   ├── file_routes.py         # Download/view/delete FileAnalysis
│   │   ├── gmail_oauth_routes.py  # OAuth Gmail agence (/gmail/connect|callback|status|disconnect)
│   │   ├── invoice_routes.py      # Génération PDF quittances
│   │   ├── settings_routes.py     # Config agence + IMAP + /watcher/configs
│   │   ├── tenant_routes.py       # CRUD dossiers locataires + upload document
│   │   └── watcher_routes.py      # /watcher/configs|update-token|check-sender
│   ├── core/
│   │   ├── config.py              # Settings singleton - TOUTES les env vars
│   │   └── security_utils.py      # Fernet, hash tokens, cookies, emails système Resend
│   ├── database/
│   │   ├── database.py            # Engine SQLAlchemy + get_db()
│   │   └── models.py              # Tous les modèles ORM
│   ├── services/
│   │   ├── document_service.py    # Classification Mistral (images + PDF) avec retry PIL
│   │   ├── email_pipeline.py      # Orchestrateur principal (9 étapes)
│   │   ├── email_service.py       # analyze_email() + generate_reply() via Mistral
│   │   ├── mistral_service.py     # Client Mistral singleton
│   │   ├── retention_service.py   # Nettoyage RGPD auto toutes les 6h
│   │   ├── storage_service.py     # R2 upload/download/delete + Fernet (singleton)
│   │   └── tenant_service.py      # Logique dossiers + checklist (5 types de docs)
│   ├── utils/
│   │   ├── google_oauth.py        # Login Google (/auth/google/login|callback|exchange-token)
│   │   ├── security.py            # JWT create/decode + bcrypt
│   │   ├── settings_factory.py    # create_default_settings_for_agency()
│   │   └── pdf_service.py         # Génération PDF quittances fpdf
│   ├── watcher.py                 # Watcher IMAP multi-tenant (service séparé)
│   ├── worker.py                  # RQ worker (queue "emails")
│   ├── tasks.py                   # process_email_job() -> run_email_pipeline()
│   └── main.py                    # App FastAPI + webhook /webhook/email
└── frontend/src/
    ├── services/api.js             # authFetch, login, logout, refreshAccessToken
    ├── components/
    │   ├── Login.jsx              # Login form + bouton Google OAuth
    │   ├── Register.jsx
    │   ├── EmailHistory.jsx       # Historique emails analysés
    │   ├── FileAnalyzer.jsx       # Upload + analyse document
    │   ├── TenantFilesPanel.jsx   # Interface dossiers locataires (composant principal)
    │   ├── TenantFilesList.jsx    # Liste dossiers (sous-composant)
    │   ├── SettingsPanel.jsx      # Config agence + connexion Gmail
    │   ├── InvoiceGenerator.jsx   # Quittances (caché dans la nav)
    │   └── StatCard.jsx
    ├── pages/
    │   ├── Dashboard.jsx          # Stats KPI + donut Recharts + activité récente
    │   ├── EmailProcessor.jsx     # Traitement email manuel avec PJ
    │   ├── AccountPage.jsx        # Mon compte + zone dangereuse
    │   ├── OAuthCallback.jsx      # Échange cookie oauth_token -> localStorage
    │   ├── VerifyEmail.jsx / ForgotPassword.jsx / ResetPassword.jsx
    │   └── LegalNotice.jsx / PrivacyPolicy.jsx
    └── App.jsx                    # Shell + sidebar + routes protégées + authFetch
```

---

## Modèles de données clés

Agency              : name, email_alias (identifiant unique du tenant)
User                : email, hashed_password, agency_id, role
AgencyEmailConfig   : IMAP config + gmail_access_token + gmail_refresh_token + gmail_email
AppSettings         : company_name, tone, signature, retention_config_json, logo
EmailAnalysis       : sender, subject, category, urgency, summary, processing_status, checklist
FileAnalysis        : filename (clé R2), file_type, file_hash (déduplication SHA256), summary
TenantFile          : candidate_email, status, checklist_json, is_closed
TenantDocumentLink  : tenant_file_id <-> file_analysis_id (avec doc_type)
TenantEmailLink     : tenant_file_id <-> email_analysis_id
RefreshToken        : token_hash (SHA256), expires_at, revoked_at

Enums :
- TenantFileStatus : new | incomplete | to_validate | validated | rejected
- TenantDocType    : id | payslip | tax | work_contract | address_proof | bank | other
- DocQuality       : ok | unclear | invalid
- UserRole         : super_admin | agency_admin | agent

---

## Pipeline email (chemin critique)

Email entrant
  -> watcher.py (IMAP) OU EmailProcessor.jsx (manuel)
  -> POST /webhook/email (résout agency_id via email alias)
  -> tasks.process_email_job() enqueued sur Redis/RQ
  -> email_pipeline.run_email_pipeline() :
       1. analyze_document() pour chaque PJ -> Mistral
       2. analyze_email() -> Mistral
       3. Sauvegarde EmailAnalysis (status=processing)
       4. ensure_tenant_file() -> crée/récupère dossier
       5. ensure_email_link() -> lien email <-> dossier
       6. attach_files_to_tenant_file() -> lien docs <-> dossier
       7. recompute_checklist() -> calcule docs manquants
       8. generate_reply() -> Mistral
       9. Sauvegarde réponse (status=success|failed)

---

## Flow OAuth Gmail agence (déjà implémenté)

SettingsPanel -> GET /gmail/connect
  -> backend retourne {"auth_url": "https://accounts.google.com/..."}
  -> frontend redirige window.location vers auth_url
  -> Google rappelle /gmail/callback?code=...&state=...
  -> backend vérifie state HMAC, échange code -> tokens
  -> sauvegarde tokens dans AgencyEmailConfig
  -> redirige vers /settings?gmail=success

---

## Ce qui est en cours / à faire

- [ ] OAuth Outlook (Microsoft 365 via Graph API)
      -> Modèle : gmail_oauth_routes.py + ajouter champs outlook_* dans AgencyEmailConfig
- [ ] Chiffrement tokens Gmail en DB
      -> Modèle : _encrypt_password() dans settings_routes.py (déjà fait pour IMAP)
- [ ] Refresh automatique tokens Gmail dans watcher.py
      -> Endpoint /watcher/update-token déjà prêt (watcher_routes.py)
- [ ] Retirer la beta whitelist de google_oauth.py (ALLOWED_EMAILS) avant ouverture
- [ ] Sécuriser le fallback agency_id=1 dans main.py webhook
- [ ] Migrer le token JWT de localStorage vers cookie HttpOnly (sécurité XSS)

---

## Points de vigilance dans le code

1. google_oauth.py ligne ~100 : whitelist beta 3 emails hardcodés (ALLOWED_EMAILS)
2. AgencyEmailConfig : gmail_access_token et gmail_refresh_token stockés EN CLAIR en DB
3. main.py webhook : fallback agency_id=1 si alias non trouvé (dangereux multi-tenant)
4. App.jsx : token JWT dans localStorage (vulnérable XSS, à migrer vers cookie)
5. document_service.py : pillow-heif doit être installé pour les HEIC (mobile)
6. storage_service.py : rétro-compatible fichiers non chiffrés (avant activation Fernet)
7. tenant_service.py : les documents type OTHER ne sont jamais attachés au dossier (voulu)

---

## Conventions de code

Backend :
- snake_case variables/fonctions, PascalCase classes
- TOUTES les env vars via app/core/config.py (settings singleton, lru_cache)
- Toujours utiliser deps.get_current_user_db dans les routes protégées
- Logs : log.info("[module] message") avec agency_id dans le contexte
- Jamais de données sensibles (noms, emails candidats, contenu docs) dans les logs

Frontend :
- PascalCase composants, camelCase variables
- authFetch (injecté depuis App.jsx) pour tous les appels API
- Toujours un state err + successMsg avec reset avant chaque action

---

## Commandes utiles

```bash
# Backend dev
cd backend
uvicorn app.main:app --reload --port 8000

# Worker RQ (terminal séparé)
cd backend
python app/worker.py

# Frontend dev
cd frontend
npm run dev

# Tests
cd backend && pytest -v

# Migrations SQL
psql $DATABASE_URL -f migration_gmail_oauth.sql
```

---

## Variables d'environnement requises

JWT_SECRET_KEY, OAUTH_STATE_SECRET, FERNET_KEY
DATABASE_URL, REDIS_URL
MISTRAL_API_KEY
RESEND_API_KEY, RESEND_FROM_EMAIL
GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URL
FRONTEND_URL
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT_URL
WATCHER_SECRET
ENABLE_RETENTION_WORKER=true (prod)