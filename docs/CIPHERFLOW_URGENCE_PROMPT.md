# CLAUDE CODE — FIX URGENCE : ENRICHIR LE PROMPT MISTRAL
# CipherFlow — email_service.py

---

## CONTEXTE

Le prompt actuel envoyé à Mistral définit l'urgence ainsi :
```
"urgency": "urgent | normal | faible"
```

C'est trop vague. Mistral n'a aucun critère pour décider et classe
presque tout en "normal". Il faut lui donner des règles métier précises
adaptées au contexte d'une agence immobilière française.

---

## RÈGLES ABSOLUES

❌ Ne modifie JAMAIS la structure du JSON retourné par Mistral
❌ Ne modifie JAMAIS les routes FastAPI
❌ Ne modifie JAMAIS la base de données
✅ Modifie uniquement le prompt dans email_service.py

---

## ÉTAPE 1 — LIRE LE CODE EXISTANT

```bash
type backend\app\services\email_service.py
```

Lis entièrement le fichier. Identifie :
1. La variable ou fonction qui construit le prompt envoyé à Mistral
2. La section qui définit le champ "urgency" dans le prompt
3. La valeur retournée actuellement : `"urgent | normal | faible"`

---

## ÉTAPE 2 — REMPLACER LA DÉFINITION DE L'URGENCE DANS LE PROMPT

Trouve la ligne qui ressemble à :
```python
"urgency": "urgent | normal | faible"
```

Et remplace UNIQUEMENT cette section du prompt par le texte suivant
(garde exactement le même format string Python — f-string ou .format()
selon ce qui est utilisé) :

```
"urgency": Niveau d'urgence de l'email. Choisir UNE valeur parmi : urgent, normal, faible.

RÈGLES STRICTES :

→ "urgent" SI l'email contient l'un de ces signaux :
   SINISTRES & PANNES
   - Dégât des eaux, inondation, fuite d'eau, infiltration
   - Panne de chauffage, pas d'eau chaude (en période froide)
   - Incendie, dégradation grave du logement
   - Problème électrique dangereux, court-circuit
   - Logement insalubre ou inhabitable

   IMPAYÉS & CONTENTIEUX
   - Retard ou impossibilité de payer le loyer
   - Mise en demeure, huissier, tribunal, avocat
   - Menace de procédure judiciaire ou d'expulsion
   - Litige locatif grave

   URGENCES LOCATAIRES
   - Départ immédiat ou préavis très court (< 7 jours)
   - Demande urgente explicite ("urgent", "URGENT", "d'urgence")
   - Sécurité des occupants en danger

→ "normal" SI l'email est une communication courante :
   - Candidature locative avec ou sans documents
   - Envoi de pièces justificatives pour un dossier
   - Question sur un bien, demande de visite
   - Renouvellement de bail standard
   - Relance ou suivi de dossier en cours
   - Devis ou facture de prestataire
   - Email administratif sans caractère urgent

→ "faible" SI l'email est sans intérêt opérationnel :
   - Spam, publicité, newsletter
   - Email hors sujet ou destiné par erreur à l'agence
   - Notification automatique d'un système (Sentry, monitoring)
   - Email interne ou boucle de l'agence elle-même
   - Accusé de réception automatique

IMPORTANT : En cas de doute entre urgent et normal, choisir normal.
En cas de doute entre normal et faible, choisir faible.
```

---

## ÉTAPE 3 — VÉRIFICATION SYNTAXE

```bash
python -m py_compile backend\app\services\email_service.py && echo OK
```

---

## COMMIT

```bash
git add backend/app/services/email_service.py
git commit -m "fix(ia): enrichir critères urgence Mistral avec règles métier immobilier"
git push origin master
```

---

## RÉSULTAT ATTENDU

| Type d'email | Avant | Après |
|---|---|---|
| Candidature locative | normal | normal ✅ |
| Dégât des eaux | normal ❌ | urgent ✅ |
| Impayé de loyer | normal ❌ | urgent ✅ |
| Notification Sentry | normal ❌ | faible ✅ |
| Mise en demeure | normal ❌ | urgent ✅ |
| Panne chauffage | normal ❌ | urgent ✅ |
