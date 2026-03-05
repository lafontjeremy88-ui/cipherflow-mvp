# Registre des activités de traitement — CipherFlow

> Document requis par l'article 30 du RGPD.
> Responsable de traitement : CipherFlow SAS
> Dernière mise à jour : mars 2026

---

## Fiche 1 — Traitement automatisé des emails de candidature locative

| Champ | Valeur |
|---|---|
| **Nom du traitement** | Traitement et classification des emails entrants de candidature |
| **Responsable de traitement** | Agence immobilière cliente (multi-tenant) |
| **Sous-traitant** | CipherFlow SAS |
| **Finalités** | Automatiser le tri des emails de candidature locative, classifier les documents joints, constituer un dossier locataire |
| **Base légale** | Exécution du contrat (Art. 6.1.b RGPD) |
| **Catégories de personnes concernées** | Candidats à la location |
| **Catégories de données** | Nom, prénom, adresse email, contenu du message, pièces jointes (identité, revenus, domicile) |
| **Destinataires** | Agents de l'agence immobilière (accès via interface web sécurisée) |
| **Transferts hors UE** | Mistral AI (France/UE), Cloudflare R2 (UE/US sous CCT), Railway (US sous CCT) |
| **Durée de conservation** | Configurable par agence (défaut : 12 mois) — suppression automatique via `retention_service.py` |
| **Mesures de sécurité** | Chiffrement Fernet R2, TLS 1.3, accès JWT, logs sans PII, isolation multi-tenant |

---

## Fiche 2 — Gestion des dossiers locataires

| Champ | Valeur |
|---|---|
| **Nom du traitement** | Constitution et suivi des dossiers locataires |
| **Responsable de traitement** | Agence immobilière cliente |
| **Sous-traitant** | CipherFlow SAS |
| **Finalités** | Centraliser les documents de candidature, calculer la complétude du dossier, faciliter la décision de l'agence |
| **Base légale** | Intérêt légitime (Art. 6.1.f — gestion locative) |
| **Catégories de personnes concernées** | Candidats à la location |
| **Catégories de données** | Email, nom, documents d'identité, bulletins de paie, avis d'imposition, contrat de travail, justificatif de domicile |
| **Destinataires** | Agents et administrateurs de l'agence |
| **Transferts hors UE** | Cloudflare R2 (US sous CCT) |
| **Durée de conservation** | Jusqu'à clôture du dossier + durée de rétention configurée |
| **Mesures de sécurité** | Documents chiffrés Fernet au repos, contrôle d'accès par agence (agency_id), export traçé |

---

## Fiche 3 — Authentification et gestion des comptes utilisateurs

| Champ | Valeur |
|---|---|
| **Nom du traitement** | Création et authentification des comptes utilisateurs agents |
| **Responsable de traitement** | CipherFlow SAS |
| **Finalités** | Permettre l'accès sécurisé à la plateforme, authentifier les utilisateurs |
| **Base légale** | Exécution du contrat (Art. 6.1.b) |
| **Catégories de personnes concernées** | Employés des agences immobilières clientes |
| **Catégories de données** | Email professionnel, mot de passe haché (bcrypt), rôle, horodatage de connexion, acceptation des CGU |
| **Destinataires** | Administrateurs de l'agence (leur propre compte uniquement) |
| **Transferts hors UE** | Railway PostgreSQL (US sous CCT), Google OAuth (US sous CCT) |
| **Durée de conservation** | Durée du contrat + 30 jours après résiliation |
| **Mesures de sécurité** | Mots de passe bcrypt, JWT 15 min, refresh token HttpOnly 30j, révocation à la déconnexion |

---

## Fiche 4 — Surveillance des boîtes email (watcher)

| Champ | Valeur |
|---|---|
| **Nom du traitement** | Surveillance automatique des boîtes email des agences |
| **Responsable de traitement** | Agence immobilière cliente |
| **Sous-traitant** | CipherFlow SAS |
| **Finalités** | Détecter les nouveaux emails de candidature, les traiter automatiquement |
| **Base légale** | Exécution du contrat (Art. 6.1.b) — mandat explicit de l'agence via OAuth |
| **Catégories de personnes concernées** | Expéditeurs d'emails à l'agence (candidats, tiers) |
| **Catégories de données** | En-têtes d'emails (expéditeur, objet), corps du message, pièces jointes |
| **Destinataires** | Pipeline de traitement interne, agents de l'agence |
| **Transferts hors UE** | Google Gmail API (US), Microsoft Graph API (US), sous CCT |
| **Durée de conservation** | Non stocké directement — les emails traités sont stockés selon la Fiche 1 |
| **Mesures de sécurité** | Tokens OAuth chiffrés Fernet en DB, secret webhook, blacklist anti-boucle, isolation par agence |

---

## Fiche 5 — Envoi d'emails sortants (notifications et réponses automatiques)

| Champ | Valeur |
|---|---|
| **Nom du traitement** | Envoi de réponses automatiques et notifications |
| **Responsable de traitement** | Agence immobilière cliente |
| **Sous-traitant** | CipherFlow SAS |
| **Finalités** | Informer les candidats de la réception de leur dossier, notifier les agents des nouveaux dossiers |
| **Base légale** | Intérêt légitime (Art. 6.1.f) / Consentement implicite (réponse à un message entrant) |
| **Catégories de personnes concernées** | Candidats à la location, agents de l'agence |
| **Catégories de données** | Adresse email destinataire, nom, sujet du message, corps de la réponse |
| **Destinataires** | Candidats (réponse auto), agents (notification nouveau dossier) |
| **Transferts hors UE** | Resend API (US sous CCT) |
| **Durée de conservation** | Logs d'envoi : 90 jours |
| **Mesures de sécurité** | En-têtes X-CipherFlow-Origin, pas de données sensibles dans le corps des emails de notification |

---

## Fiche 6 — Analyse IA des documents (classification Mistral)

| Champ | Valeur |
|---|---|
| **Nom du traitement** | Classification automatique des documents par IA |
| **Responsable de traitement** | Agence immobilière cliente |
| **Sous-traitant** | CipherFlow SAS / Mistral AI (sous-traitant ultérieur) |
| **Finalités** | Identifier le type de document, extraire les informations clés (montant, date), évaluer la qualité |
| **Base légale** | Exécution du contrat (Art. 6.1.b) |
| **Catégories de personnes concernées** | Candidats à la location |
| **Catégories de données** | Images et PDF de documents personnels (pièce d'identité, bulletins de paie, etc.) |
| **Destinataires** | API Mistral AI (traitement sans stockage selon les CGU Mistral) |
| **Transferts hors UE** | Mistral AI (France/UE — pas de transfert hors UE) |
| **Durée de conservation** | Aucune rétention par Mistral AI (selon contrat) |
| **Mesures de sécurité** | Documents transmis en base64 via HTTPS, non conservés par Mistral AI |

---

## Exercice des droits

Les personnes concernées (candidats) peuvent exercer leurs droits auprès de l'agence immobilière cliente (responsable de traitement). L'agence dispose des outils dans CipherFlow pour :
- **Accès** : Consultation du dossier locataire
- **Rectification** : Modification des informations du dossier
- **Effacement** : Suppression du dossier et de tous ses documents
- **Portabilité** : Export ZIP du dossier (fonction "Exporter le dossier")

Pour toute demande relative aux traitements réalisés par CipherFlow en propre (Fiche 3) : contact@cipherflow.fr

---

## Mise à jour du registre

| Date | Modification |
|---|---|
| Janvier 2026 | Création initiale |
| Février 2026 | Ajout Mistral AI (remplacement Gemini), suppression raw_email_text |
| Mars 2026 | Ajout export ZIP (Fiche 2), blacklists agence, auto-reply, heartbeat watcher |
