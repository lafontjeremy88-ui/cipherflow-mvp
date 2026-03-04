# app/api/admin_routes.py
"""
Routes d'administration protégées par x-watcher-secret.
Usage unique : migrations RGPD et opérations one-shot en production.

Historique :
- POST /admin/run-migration   → vidage raw_email_text ✅ FAIT (colonne supprimée en prod)
- GET  /admin/check-migration → vérification ✅ FAIT
"""

from fastapi import APIRouter

router = APIRouter(prefix="/admin", tags=["Admin"])

# Toutes les migrations ont été exécutées.
# Ce fichier est conservé comme point d'extension pour de futures opérations one-shot.
