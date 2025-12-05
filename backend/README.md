# 📧 CipherFlow – Inbox IA Pro

Analyse automatique des emails clients et génération de réponses professionnelles prêtes à envoyer.

Ce projet est un MVP fonctionnel permettant :
- d'analyser un email entrant (ex : demande de devis),
- de générer une réponse professionnelle grâce à l'IA (Gemini),
- et d'envoyer la réponse par email via SMTP (Gmail).

---

## 🧱 Stack technique

- **Backend** : Python 3.10, FastAPI, Uvicorn, httpx
- **IA** : Google Gemini (`gemini-2.0-flash`) via API REST
- **Frontend** : React (Vite) – interface simple en 1 page
- **Email** : SMTP (testé avec Gmail)

---

## 📂 Structure du projet

```text
inbox-ia-pro/
├─ backend/
│  ├─ app/
│  │  ├─ main.py          # API FastAPI (health, analyse, réponse, send, process)
│  │  └─ ...
│  ├─ .env                # Variables d'environnement (API Gemini + SMTP)
│  ├─ requirements.txt
│  └─ ...
└─ frontend/
   ├─ src/
   │  ├─ App.jsx          # Interface principale CipherFlow – Inbox IA Pro
   │  └─ ...
   └─ ...



Prérequis

Python 3.10 installé

Node.js + npm installés

Un compte Google Cloud / AI Studio avec une clé API Gemini

Un compte Gmail dédié à l'envoi (ex : cipherflow.services@gmail.com)

2FA activée

Mot de passe d'application généré