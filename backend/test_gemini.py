import os
import json
import httpx

from dotenv import load_dotenv

# Charge le .env du backend
load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("❌ GEMINI_API_KEY manquante dans le .env")
    raise SystemExit(1)

# On va tester les DEUX endpoints possibles : v1 et v1beta
endpoints = [
    "https://generativelanguage.googleapis.com/v1/models",
    "https://generativelanguage.googleapis.com/v1beta/models",
]

for url in endpoints:
    print("=" * 80)
    print(f"Test ListModels sur : {url}")
    try:
        resp = httpx.get(url, params={"key": api_key}, timeout=30)
    except Exception as e:
        print(f"❌ Erreur de connexion : {e}")
        continue

    print(f"Status code : {resp.status_code}")
    try:
        data = resp.json()
    except Exception:
        print("Réponse non-JSON :", resp.text[:500])
        continue

    # On affiche juste les 5 premiers modèles pour voir leur nom exact
    models = data.get("models") or data.get("data") or []
    print(f"Nombre de modèles trouvés : {len(models)}")

    for m in models[:5]:
        model_name = m.get("name") or m.get("id")
        print(" -", model_name)

    print("=" * 80)
