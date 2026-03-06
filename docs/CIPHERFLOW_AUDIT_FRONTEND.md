# CLAUDE CODE — AUDIT COMPLET FRONTEND CIPHERFLOW

> Colle ce prompt dans Claude Code depuis la racine du projet frontend.
> Claude Code doit UNIQUEMENT auditer — aucune modification sans validation explicite.

---

## OBJECTIF

Effectue un audit complet et exhaustif du frontend CipherFlow.
Pour chaque point, indique clairement : ✅ OK / ⚠️ À corriger / ❌ Cassé

Ne modifie RIEN. Produis uniquement un rapport.

---

## ÉTAPE 0 — SCAN GÉNÉRAL DE LA CODEBASE

```bash
# Structure du projet
find src/ -name "*.jsx" -o -name "*.tsx" | sort

# Dépendances installées
cat package.json | grep -E '"dependencies"|"devDependencies"' -A 50 | head -60

# Vérifier si recharts est installé
grep "recharts" package.json

# Vérifier si lucide-react est installé
grep "lucide-react" package.json

# Chercher les TODO / FIXME / console.log restants
grep -r "console\.log\|TODO\|FIXME\|console\.error" src/ --include="*.jsx" --include="*.tsx" -n | head -30

# Chercher les imports cassés (imports de fichiers qui n'existent pas)
grep -r "from '\.\." src/ --include="*.jsx" -n | head -20
```

---

## ÉTAPE 1 — AUDIT ROUTING

```bash
# Lister toutes les routes déclarées
grep -r "path=\|Route\|router" src/App.jsx src/router* 2>/dev/null

# Lister toutes les pages existantes
ls src/pages/
```

**Vérifier que ces routes existent :**
- [ ] `/dashboard`
- [ ] `/emails` ou `/emails/history`
- [ ] `/emails/analyze`
- [ ] `/documents`
- [ ] `/documents/verification`  
- [ ] `/tenant-files` ou `/dossiers`
- [ ] `/settings`
- [ ] `/account`
- [ ] `/privacy`
- [ ] `/legal`

**Vérifier que ces pages existent dans `src/pages/` :**
- [ ] `Dashboard.jsx`
- [ ] `Emails.jsx` ou `EmailHistory.jsx`
- [ ] `Analyse.jsx`
- [ ] `Documents.jsx`
- [ ] `DossiersLocataires.jsx` ou `TenantFiles.jsx`
- [ ] `Settings.jsx` ou `Parametres.jsx`
- [ ] `MonCompte.jsx` ou `AccountPage.jsx`
- [ ] `Privacy.jsx`
- [ ] `MentionsLegales.jsx`

---

## ÉTAPE 2 — AUDIT COMPOSANTS UI

```bash
# Lister tous les composants UI créés
ls src/components/ui/
ls src/components/layout/
ls src/components/charts/
ls src/components/documents/ 2>/dev/null
```

**Vérifier que ces composants existent :**
- [ ] `src/components/layout/Sidebar.jsx`
- [ ] `src/components/layout/Header.jsx`
- [ ] `src/components/layout/AppLayout.jsx`
- [ ] `src/components/ui/Button.jsx`
- [ ] `src/components/ui/Card.jsx`
- [ ] `src/components/ui/Badge.jsx`
- [ ] `src/components/ui/StatCard.jsx`
- [ ] `src/components/ui/ProgressBar.jsx`
- [ ] `src/components/ui/ActivityItem.jsx`
- [ ] `src/components/charts/EmailsChart.jsx`

**Pour chaque composant trouvé, vérifier :**
```bash
# Chercher les props non utilisées ou manquantes
grep -r "undefined\|null\|NaN" src/components/ --include="*.jsx" -n | head -20

# Chercher les className avec des couleurs hardcodées non conformes à la palette
grep -r "bg-gray-[89]\|bg-slate-[89]\|text-white.*bg-" src/components/ --include="*.jsx" -n | head -20
```

---

## ÉTAPE 3 — AUDIT DESIGN SYSTEM & COULEURS

```bash
# Vérifier tailwind.config.js
cat tailwind.config.js

# Chercher les fonds sombres résiduels (dark mode non migré)
grep -rn "bg-gray-800\|bg-gray-900\|bg-slate-800\|bg-slate-900\|bg-\[#0F172A\]\|bg-\[#1E293B\]\|bg-\[#1a1a" src/ --include="*.jsx" | head -30

# Chercher les text-white dans un contexte non-bouton (potentiel dark mode résiduel)
grep -rn "text-white" src/pages/ --include="*.jsx" | grep -v "button\|btn\|bg-\[#2563" | head -20

# Vérifier que index.css est en light mode
head -50 src/index.css
```

**Palette attendue — vérifier la conformité :**
- Primary : `#2563EB`
- Background : `#F8FAFC`
- Cards : `#FFFFFF`
- Border : `#E2E8F0`
- Text : `#0F172A`
- Muted : `#475569`
- Subtle : `#94A3B8`

---

## ÉTAPE 4 — AUDIT SIDEBAR

```bash
cat src/components/layout/Sidebar.jsx
```

**Vérifier :**
- [ ] Logo CipherFlow visible (image ou badge CF)
- [ ] Sous-titre "Automatisation immobilière"
- [ ] Tous les liens de navigation présents (Dashboard, Emails, Analyse, Documents, Vérification IA, Dossiers locataires, Paramètres, Mon Compte)
- [ ] Icônes lucide-react sur chaque item
- [ ] Active state en bleu `bg-[#EFF6FF] text-[#2563EB]`
- [ ] Hover state en gris `hover:bg-[#F1F5F9]`
- [ ] Largeur fixe 260px
- [ ] Footer avec email utilisateur + bouton Se déconnecter
- [ ] Liens "Confidentialité" et "Mentions légales" en bas
- [ ] Fond blanc `bg-white` avec bordure droite `border-r border-[#E2E8F0]`

---

## ÉTAPE 5 — AUDIT HEADER

```bash
cat src/components/layout/Header.jsx
```

**Vérifier :**
- [ ] Hauteur fixe `h-16`
- [ ] Fond blanc + bordure basse
- [ ] Titre de page dynamique (change selon la route)
- [ ] Icône notification à droite
- [ ] Bouton "+ Nouveau" bleu à droite
- [ ] Aucun résidu dark mode

---

## ÉTAPE 6 — AUDIT PAGE DASHBOARD

```bash
cat src/pages/Dashboard.jsx | head -200
```

**Vérifier :**
- [ ] Greeting "Bonjour [nom] 👋" avec vraie date en français
- [ ] Indicateur "Surveillance active" avec point vert animé
- [ ] 4 StatCards en `grid-cols-4`
- [ ] Valeurs null protégées avec `?? 0`
- [ ] Graphique EmailsChart avec vraies dates (pas J1, J2...)
- [ ] Switcher Semaine / Mois fonctionnel
- [ ] Section "Activité récente" avec empty state si vide
- [ ] Section "Répartition" donut avec légende
- [ ] Section "Emails récents" avec données ou empty state
- [ ] Aucune valeur qui affiche `—` ou `undefined`

---

## ÉTAPE 7 — AUDIT PAGE EMAILS

```bash
cat src/pages/Emails.jsx 2>/dev/null || cat src/pages/EmailHistory.jsx 2>/dev/null | head -100
```

**Vérifier :**
- [ ] Barre de recherche stylisée (pas de select/input natif sans style)
- [ ] Filtres Catégorie + Tri avec style cohérent
- [ ] Bouton Rafraîchir avec icône
- [ ] Empty state propre si aucun email (icône + texte + CTA)
- [ ] Liste d'emails avec hover state
- [ ] Aucun fond sombre résiduel

---

## ÉTAPE 8 — AUDIT PAGE ANALYSE

```bash
cat src/pages/Analyse.jsx 2>/dev/null | head -150
```

**Vérifier :**
- [ ] Formulaire dans une carte blanche `bg-white border border-[#E2E8F0]`
- [ ] Inputs stylisés avec focus ring bleu
- [ ] Labels visibles au-dessus des inputs
- [ ] Bouton "Analyser" en primary bleu
- [ ] Bouton "Reset" en secondary
- [ ] Champ "Pièces jointes" fonctionnel
- [ ] Résultats d'analyse affichés proprement après soumission

---

## ÉTAPE 9 — AUDIT PAGE DOCUMENTS

```bash
cat src/pages/Documents.jsx 2>/dev/null | head -150
```

**Vérifier :**
- [ ] Zone UploadZone en light mode (pas de fond sombre)
- [ ] Bordure pointillée visible
- [ ] Texte "Glissez vos documents ici" lisible
- [ ] Tableau des documents en light mode
- [ ] Badges de type document colorés (pas de fond sombre)
- [ ] Boutons action (voir, télécharger, supprimer) visibles

---

## ÉTAPE 10 — AUDIT PAGE DOSSIERS LOCATAIRES

```bash
cat src/pages/DossiersLocataires.jsx 2>/dev/null || cat src/pages/TenantFiles.jsx 2>/dev/null | head -150
```

**Vérifier :**
- [ ] Layout 2 colonnes (liste gauche / détail droite)
- [ ] Champ de recherche stylisé
- [ ] Bouton "Nouveau dossier" visible
- [ ] Empty state si aucun locataire
- [ ] Panel droit avec empty state si aucun locataire sélectionné
- [ ] ProgressBar "Score dossier" si locataire sélectionné

---

## ÉTAPE 11 — AUDIT PAGE PARAMÈTRES

```bash
cat src/pages/Settings.jsx 2>/dev/null || cat src/pages/Parametres.jsx 2>/dev/null | head -200
```

**Vérifier :**
- [ ] Onglets "Général / Mon Compte" en haut
- [ ] Section Identité de l'Entreprise en blanc
- [ ] Section Branding & Logo en blanc
- [ ] Section Comportement IA en blanc
- [ ] Section Connexions Email (Gmail + Outlook) en blanc — PLUS de fond sombre
- [ ] Section Filtres personnalisés en blanc
- [ ] Tous les inputs avec `bg-[#F8FAFC]` et focus ring bleu
- [ ] Aucune carte avec fond `bg-gray-800` ou équivalent

---

## ÉTAPE 12 — AUDIT PAGE MON COMPTE

```bash
cat src/pages/MonCompte.jsx 2>/dev/null || cat src/pages/AccountPage.jsx 2>/dev/null | head -150
```

**Vérifier :**
- [ ] Section Profil avec avatar initiales
- [ ] Section Email & Connexion avec badge Google OAuth
- [ ] Section Sécurité avec sessions actives
- [ ] Danger Zone visible (fond rouge léger, pas rouge vif)
- [ ] Tous les inputs en light mode
- [ ] Route `/account` accessible

---

## ÉTAPE 13 — AUDIT PAGES LÉGALES

```bash
# Privacy
ls src/pages/ | grep -i "priv\|confid"
# Legal
ls src/pages/ | grep -i "legal\|mention"
```

**Vérifier :**
- [ ] Page Privacy accessible à `/privacy`
- [ ] Page Mentions Légales accessible à `/legal`
- [ ] Les deux pages ont un sommaire latéral sticky
- [ ] Les deux pages sont en light mode
- [ ] Footer avec liens croisés entre les deux pages
- [ ] Lien "Confidentialité" et "Mentions légales" dans la Sidebar pointent vers les bonnes routes

---

## ÉTAPE 14 — AUDIT PERFORMANCE & QUALITÉ CODE

```bash
# Chercher les re-renders inutiles (setState dans le render)
grep -rn "useState.*useState\|setInterval\|clearInterval" src/pages/ --include="*.jsx" | head -10

# Chercher les useEffect sans dépendances (boucles infinies potentielles)
grep -rn "useEffect(() =>" src/ --include="*.jsx" | grep -v "\[\]" | head -20

# Chercher les imports inutilisés
grep -rn "^import" src/pages/ --include="*.jsx" | head -30

# Taille des fichiers (fichiers trop gros = à refactoriser)
wc -l src/pages/*.jsx src/components/**/*.jsx 2>/dev/null | sort -rn | head -20

# Chercher les hardcoded API URLs (doivent utiliser une variable d'env)
grep -rn "localhost:8000\|railway.app\|http://" src/ --include="*.jsx" | head -10
```

---

## ÉTAPE 15 — AUDIT ACCESSIBILITÉ DE BASE

```bash
# Vérifier que les images ont des alt
grep -rn "<img" src/ --include="*.jsx" | grep -v "alt=" | head -10

# Vérifier que les boutons ont du texte ou aria-label
grep -rn "<button" src/ --include="*.jsx" | grep -v "children\|aria-\|className" | head -10

# Vérifier les inputs sans label
grep -rn "<input" src/ --include="*.jsx" | grep -v "label\|placeholder\|aria-" | head -10
```

---

## FORMAT DU RAPPORT ATTENDU

Produis un rapport structuré avec ce format exact :

```
══════════════════════════════════════
AUDIT FRONTEND CIPHERFLOW — [DATE]
══════════════════════════════════════

RÉSUMÉ GLOBAL
✅ XX points OK
⚠️  XX points à améliorer  
❌  XX points cassés

──────────────────────────────────────
ROUTING & PAGES
✅ Route /dashboard — OK
✅ Route /emails — OK
⚠️  Route /legal — page existe mais non accessible depuis la sidebar
❌ Route /account — composant non trouvé
...

──────────────────────────────────────
DESIGN & COULEURS
✅ Tailwind config palette complète
⚠️  3 fonds sombres résiduels dans Documents.jsx (lignes 45, 67, 89)
❌ Header sans titre dynamique
...

──────────────────────────────────────
COMPOSANTS UI
...

──────────────────────────────────────
PAGES
...

──────────────────────────────────────
QUALITÉ CODE
...

──────────────────────────────────────
PRIORITÉS DE CORRECTION

🔴 CRITIQUE (à corriger immédiatement) :
  1. ...
  2. ...

🟠 IMPORTANT (à corriger cette semaine) :
  1. ...
  2. ...

🟡 NICE TO HAVE (amélioration future) :
  1. ...
  2. ...
══════════════════════════════════════
```

---

**RAPPEL : Cet audit est en lecture seule. Ne modifie AUCUN fichier.**
**Produis uniquement le rapport ci-dessus.**
