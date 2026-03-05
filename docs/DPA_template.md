# Data Processing Agreement (DPA) — CipherFlow

> Template à compléter avant signature. Ce document constitue l'Accord de Traitement des Données
> au sens de l'article 28 du RGPD entre CipherFlow (Sous-traitant) et l'Agence (Responsable de traitement).

---

## Parties

**Responsable de traitement (RT)**
Raison sociale : ___________________________
Adresse : ___________________________
SIRET : ___________________________
Représentant légal : ___________________________
(ci-après « l'Agence »)

**Sous-traitant**
Raison sociale : CipherFlow SAS
Adresse : ___________________________
SIRET : ___________________________
Représentant légal : ___________________________
(ci-après « CipherFlow »)

---

## 1. Objet

Le présent accord définit les conditions dans lesquelles CipherFlow traite des données à caractère personnel pour le compte de l'Agence dans le cadre de la fourniture du service **Inbox-IA-Pro** (traitement automatisé des emails de candidatures locatives).

---

## 2. Nature et finalités des traitements

| Finalité | Base légale | Catégories de données |
|---|---|---|
| Traitement automatisé des emails de candidature | Exécution du contrat (Art. 6.1.b) | Nom, email, contenu des emails |
| Classification IA des documents locatifs | Exécution du contrat (Art. 6.1.b) | Documents d'identité, bulletins de paie, avis d'imposition |
| Génération de réponses automatiques | Exécution du contrat (Art. 6.1.b) | Email du candidat, sujet |
| Constitution du dossier locataire | Intérêt légitime (Art. 6.1.f) | Toutes données du dossier |
| Surveillance de la boîte email de l'agence | Exécution du contrat (Art. 6.1.b) | Contenu des emails entrants |

---

## 3. Durée du traitement

Les données sont traitées pendant toute la durée du contrat de service CipherFlow. À l'expiration ou résiliation du contrat :
- Les données sont supprimées sous **30 jours** sur demande explicite de l'Agence.
- Les sauvegardes automatiques sont purgées sous **90 jours**.
- La rétention automatique RGPD peut être configurée dans les Paramètres (défaut : 12 mois).

---

## 4. Obligations de CipherFlow (Sous-traitant)

CipherFlow s'engage à :

1. **Confidentialité** : Traiter les données uniquement sur instruction documentée de l'Agence.
2. **Sécurité** : Mettre en œuvre des mesures techniques appropriées :
   - Chiffrement Fernet des documents en transit et au repos (Cloudflare R2)
   - Tokens OAuth stockés chiffrés en base de données
   - JWT à durée de vie courte (15 min) + refresh token HttpOnly
   - TLS 1.3 pour tous les flux
3. **Sous-traitants ultérieurs** : Informer l'Agence de tout changement de sous-traitant (voir §6).
4. **Droits des personnes** : Assister l'Agence dans l'exercice des droits (accès, rectification, effacement, portabilité) dans un délai de 72h.
5. **Violations** : Notifier l'Agence dans les **72 heures** suivant la découverte d'une violation de données.
6. **Audit** : Fournir toute information nécessaire à la démonstration de la conformité.
7. **Suppression** : Supprimer ou restituer toutes les données personnelles à la fin du service.

---

## 5. Obligations de l'Agence (Responsable de traitement)

L'Agence s'engage à :

1. Fonder le traitement sur une base légale valide au regard du RGPD.
2. Informer les candidats du traitement de leurs données (mentions légales, politique de confidentialité).
3. Ne transmettre que les données strictement nécessaires au service.
4. Ne pas configurer des durées de rétention supérieures aux finalités poursuivies.
5. Gérer les demandes d'exercice de droits des candidats.

---

## 6. Sous-traitants ultérieurs (liste à la date de signature)

| Sous-traitant | Pays | Finalité |
|---|---|---|
| Railway (Infrastructure cloud) | États-Unis | Hébergement backend + BDD PostgreSQL |
| Vercel | États-Unis | Hébergement frontend |
| Cloudflare R2 | États-Unis / UE | Stockage chiffré des documents |
| Mistral AI | France / UE | Classification IA des documents et emails |
| Resend | États-Unis | Envoi d'emails transactionnels |
| Google (OAuth) | États-Unis | Authentification et accès boîte Gmail |
| Microsoft (OAuth) | États-Unis | Authentification et accès boîte Outlook |
| Redis / Upstash | États-Unis | File de jobs asynchrones |

> Les transferts hors UE s'effectuent sous Clauses Contractuelles Types (CCT) conformément à l'Art. 46 RGPD.

---

## 7. Mesures de sécurité techniques et organisationnelles

- Chiffrement des données au repos (Fernet AES-128-CBC) et en transit (TLS 1.3)
- Contrôle d'accès basé sur les rôles (super_admin / agency_admin / agent)
- Journalisation des accès et exports (traçabilité RGPD)
- Suppression automatique des données selon la politique de rétention configurée
- Tests de sécurité (OWASP Top 10 pris en compte dans le développement)
- Pas de données sensibles dans les logs (emails, noms, contenu de documents)
- Clés de chiffrement non stockées avec les données (variables d'environnement Railway)

---

## 8. Droit applicable et juridiction

Le présent accord est soumis au droit français. En cas de litige, les parties se soumettent à la juridiction exclusive des tribunaux compétents de Paris, sauf disposition légale contraire.

---

## 9. Signatures

Fait en double exemplaire, le ___________________________

**Pour l'Agence (RT)**
Nom : ___________________________
Fonction : ___________________________
Signature : ___________________________

**Pour CipherFlow (Sous-traitant)**
Nom : ___________________________
Fonction : ___________________________
Signature : ___________________________
