# CipherFlow — Vision Produit & Feuille de Route

---

## Le problème

Les agences immobilières indépendantes et les petits syndics reçoivent chaque jour
des dizaines d'emails liés à la gestion locative :

- Candidatures avec pièces jointes (pièce d'identité, fiches de paie, etc.)
- Relances de locataires sur des incidents ou demandes
- Documents administratifs à classer
- Échanges entre propriétaires et gestionnaires
- Devis et factures de prestataires

Le traitement manuel de ces emails représente 2 à 4 heures par jour pour un agent,
génère des erreurs de classement, des réponses oubliées, et des dossiers incomplets.
C'est du travail répétitif à faible valeur ajoutée qui mobilise des ressources humaines
qui pourraient se concentrer sur la relation client.

---

## La solution CipherFlow

CipherFlow connecte la boîte email de l'agence et en fait un système intelligent.

Pour chaque email entrant, la plateforme :

1. Lit et comprend le contenu (sujet, expéditeur, corps, pièces jointes)
2. Classe automatiquement l'email (candidature, incident, relance, devis, etc.)
3. Extrait et analyse les documents joints (carte d'identité, fiche de paie, etc.)
4. Crée ou met à jour le dossier locataire correspondant
5. Calcule ce qui manque dans le dossier
6. Génère une réponse personnalisée prête à envoyer
7. Notifie l'agence si une action humaine est nécessaire

L'agent ne reçoit plus des emails, il reçoit des dossiers structurés avec un statut clair.

---

## Positionnement

Marché cible : agences immobilières indépendantes (5-30 employés) et petits syndics
Positionnement : outil SaaS niche, spécialisé gestion locative
Différenciation : pipeline IA bout-en-bout (email -> dossier) sans configuration technique

Ce que CipherFlow n'est PAS :
- Un CRM immobilier généraliste (concurrence : Apimo, Hektor)
- Un outil de signature électronique (DocuSign, Yousign)
- Un outil de comptabilité (Sage, QuickBooks)

Ce que CipherFlow EST :
- Le cerveau de la boîte email d'une agence
- La couche d'automatisation entre les emails et les dossiers

---

## Architecture produit actuelle (ce qui existe)

### Backend (production sur Railway)
- Pipeline email : réception -> analyse IA -> dossier -> réponse
- Classification de documents par IA (Mistral AI, conforme RGPD EU)
- Multi-tenant : isolation complète des données par agence
- Stockage sécurisé : fichiers chiffrés dans Cloudflare R2 (Fernet)
- Auth : JWT + Google OAuth (connexion + boîte Gmail)
- Watcher IMAP : surveille les boîtes email en continu
- RGPD : rétention automatique configurable par agence

### Frontend (production sur Vercel)
- Dashboard avec KPIs et répartition des emails par catégorie
- Historique des emails traités
- Dossiers locataires : checklist des documents, statut, upload manuel
- Paramètres agence : tonalité des réponses, signature, connexion Gmail
- Analyse de documents à la demande

---

## Ce qui manque pour passer en bêta client

### Priorité 1 - Onboarding simplifié
Le problème actuel : l'IMAP est trop technique pour des agents immobiliers non-techniques.
La solution : remplacer la config IMAP par un simple bouton "Connecter votre Gmail/Outlook".
Statut : Gmail OAuth est implémenté. Outlook reste à faire.

### Priorité 2 - Fiabilité du pipeline
- Gestion des tokens Gmail expirés dans le watcher (refresh automatique)
- Alertes quand le watcher s'arrête pour une agence
- Logs d'erreur visibles pour l'admin (pas juste dans Railway)

### Priorité 3 - UX pour les agents
- Notification en temps réel quand un nouveau dossier arrive
- Résumé quotidien : "3 dossiers incomplets, 2 nouveaux candidats"
- Interface mobile-friendly (actuellement desktop only)

---

## Feuille de route

### Phase 1 - Stabilisation (en cours)
- [x] OAuth Gmail pour connexion boîte agence
- [x] Pipeline email bout-en-bout
- [x] Dossiers locataires avec checklist automatique
- [x] Chiffrement Fernet des fichiers
- [ ] OAuth Outlook (Microsoft 365)
- [ ] Refresh tokens Gmail dans watcher
- [ ] Sécurisation tokens Gmail en DB

### Phase 2 - Beta clients (prochaine étape)
- [ ] Onboarding guidé (wizard de connexion email en 3 clics)
- [ ] Tableau de bord amélioré (alertes, dossiers en attente)
- [ ] Email de notification quand un dossier se complète
- [ ] Support multilingue (FR + EN)
- [ ] Retirer la whitelist beta

### Phase 3 - Croissance
- [ ] Connexion Outlook / Microsoft 365
- [ ] Intégration avec logiciels de gestion locative (ICS, Masteos, etc.)
- [ ] Module de suivi des incidents (maintenance, réparations)
- [ ] API publique pour intégrations tierces
- [ ] Portail locataire (upload direct de documents)

---

## Modèle économique envisagé

SaaS avec abonnement mensuel par agence :

- Starter : 1 boîte email, jusqu'à 200 emails/mois -> ~49€/mois
- Pro : 3 boîtes email, emails illimités, réponses automatiques -> ~99€/mois
- Business : agences multi-sites, API, intégrations -> ~199€/mois

Coûts variables principaux :
- Mistral AI : ~0.15€/1000 tokens (très faible pour des emails)
- Cloudflare R2 : ~0.015$/GB stocké
- Railway : ~20$/mois backend
- Vercel : gratuit jusqu'à un certain volume

Marge brute estimée : >80% dès la Phase 2

---

## Argument de vente principal

"CipherFlow transforme votre boîte email en assistant de gestion locative.
Chaque email devient un dossier structuré, chaque document est classifié,
chaque réponse est prête en 30 secondes."

Avant CipherFlow : 3 heures/jour à trier, classer, répondre aux emails
Après CipherFlow : 20 minutes/jour à valider ce que l'IA a préparé

---

## Risques identifiés

1. Confiance dans l'IA : les agents doivent faire confiance aux classifications
   -> Mitigation : toujours montrer ce que l'IA a fait, avec possibilité de corriger

2. RGPD : les documents locataires sont sensibles
   -> Mitigation : chiffrement en place, rétention automatique, hébergement EU (Mistral)

3. Fiabilité du watcher email : si ça s'arrête, l'agence ne reçoit plus rien
   -> Mitigation : alertes, double notification, logs visibles

4. Dépendance à Google/Microsoft pour l'OAuth
   -> Mitigation : garder IMAP comme fallback

---

## Prochaine action recommandée

Avant de continuer à coder : trouver 3 agences immobilières qui acceptent de tester
CipherFlow en échange d'un accès gratuit pendant 3 mois.

L'objectif est de valider :
1. Est-ce que la connexion Gmail se fait sans appel support ?
2. Est-ce que les classifications IA sont suffisamment précises ?
3. Est-ce que les agents utilisent vraiment les réponses suggérées ?
4. Quel est le volume réel d'emails traités par semaine ?

Sans ces réponses, chaque heure de développement est un pari.
