# CLAUDE CODE PROMPT — REFONTE COMPLÈTE FRONTEND CIPHERFLOW

> Colle ce prompt directement dans Claude Code depuis la racine de ton projet frontend.

---

## CONTEXTE & OBJECTIF

Tu es un **Senior SaaS Product Designer + Frontend Architect**.

Tu dois refondre **uniquement le frontend** de CipherFlow, une application SaaS de gestion de dossiers locataires pour agences immobilières. Le backend FastAPI reste intact — ne touche à aucun endpoint, aucune logique serveur, aucune structure de données.

**Stack :**
- React + Vite
- TailwindCSS
- lucide-react (icônes)
- recharts (graphiques)

**Objectif visuel :** Un SaaS professionnel, aéré et moderne, inspiré de Stripe Dashboard, Linear (light), Notion et Vercel Dashboard.

---

## RÈGLES ABSOLUES

1. ❌ Ne modifie JAMAIS les fichiers backend
2. ❌ Ne modifie JAMAIS les appels API existants (URLs, méthodes, payloads)
3. ❌ Ne modifie JAMAIS la logique d'authentification (OAuth, cookies, tokens)
4. ✅ Refonds uniquement les composants React, le layout, les styles Tailwind
5. ✅ Conserve tous les hooks, contextes et services existants — adapte uniquement le JSX et les classes CSS
6. ✅ Si un composant a des props venant d'un hook existant, conserve exactement les mêmes noms de props

---

## DESIGN SYSTEM

### Palette de couleurs (à définir dans `tailwind.config.js`)

```js
colors: {
  primary: {
    DEFAULT: '#2563EB',
    50:  '#EFF6FF',
    100: '#DBEAFE',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
  },
  secondary: {
    DEFAULT: '#0EA5A4',
    100: '#CCFBF1',
    500: '#0EA5A4',
  },
  surface: {
    bg:     '#F8FAFC',
    card:   '#FFFFFF',
    border: '#E2E8F0',
    muted:  '#F1F5F9',
  },
  ink: {
    DEFAULT: '#0F172A',
    secondary: '#475569',
    tertiary:  '#94A3B8',
  },
  success: '#22C55E',
  warning: '#F59E0B',
  danger:  '#EF4444',
}
```

### Typographie

- Titre principal : `font-semibold text-[#0F172A]`
- Corps : `text-[#475569]`
- Labels : `text-xs font-medium tracking-wide text-[#94A3B8] uppercase`

### Spacing & Layout

- Background global : `bg-[#F8FAFC]`
- Cartes : `bg-white rounded-xl border border-[#E2E8F0] shadow-sm`
- Sidebar : `w-[260px] bg-white border-r border-[#E2E8F0]`
- Padding cartes : `p-6`
- Gap entre éléments : `gap-4` ou `gap-6`

### Micro-interactions

Appliquer sur **tous** les éléments interactifs :
```
transition-all duration-200 ease-in-out
```

---

## STRUCTURE DE FICHIERS À CRÉER

```
src/
├── components/
│   ├── layout/
│   │   ├── Sidebar.jsx
│   │   ├── Header.jsx
│   │   └── AppLayout.jsx
│   ├── ui/
│   │   ├── Card.jsx
│   │   ├── StatCard.jsx
│   │   ├── Badge.jsx
│   │   ├── ProgressBar.jsx
│   │   ├── Button.jsx
│   │   └── ActivityItem.jsx
│   ├── documents/
│   │   ├── DocumentCard.jsx
│   │   └── UploadZone.jsx
│   └── charts/
│       └── EmailsChart.jsx
├── pages/
│   ├── Dashboard.jsx
│   ├── Emails.jsx
│   ├── Analyse.jsx
│   ├── Documents.jsx
│   └── DossiersLocataires.jsx
```

---

## COMPOSANTS UI — SPÉCIFICATIONS DÉTAILLÉES

### `Card.jsx`
Wrapper générique réutilisable.

```jsx
// Props: children, className, padding ("sm"|"md"|"lg")
// Classes: bg-white rounded-xl border border-[#E2E8F0] shadow-sm
// hover: hover:shadow-md transition-all duration-200
```

---

### `StatCard.jsx`
Carte statistique pour le dashboard.

**Props :** `icon`, `label`, `sublabel`, `value`, `color` ("blue"|"teal"|"green"|"orange")

**Design :**
- Fond blanc, coin arrondi `rounded-xl`
- Icône dans un cercle coloré (opacité 10% du primary), taille 40px
- Label en gris clair, valeur en noir bold `text-3xl font-bold`
- Sous-label en `text-xs text-[#94A3B8]`
- Hover : légère élévation `hover:shadow-md hover:-translate-y-0.5`

**Couleurs d'icône selon type :**
- Emails → bleu `bg-blue-50 text-blue-600`
- Dossiers → teal `bg-teal-50 text-teal-600`
- Documents → violet `bg-violet-50 text-violet-600`
- Alertes → orange `bg-orange-50 text-orange-600`

---

### `Badge.jsx`
Badges de statut.

**Variants :** `success`, `warning`, `danger`, `info`, `neutral`

```jsx
// success: bg-green-50 text-green-700 border border-green-200
// warning: bg-amber-50 text-amber-700 border border-amber-200
// danger:  bg-red-50 text-red-700 border border-red-200
// info:    bg-blue-50 text-blue-700 border border-blue-200
```

Taille : `text-xs font-medium px-2.5 py-0.5 rounded-full`

---

### `Button.jsx`
Bouton réutilisable.

**Variants :** `primary`, `secondary`, `ghost`, `danger`

```jsx
// primary: bg-[#2563EB] text-white hover:bg-[#1D4ED8]
// secondary: bg-white text-[#0F172A] border border-[#E2E8F0] hover:bg-[#F8FAFC]
// ghost: text-[#475569] hover:bg-[#F1F5F9]
// danger: bg-red-50 text-red-600 hover:bg-red-100

// Toujours: rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200
// Focus: focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30
```

---

### `ProgressBar.jsx`
Barre de progression pour les dossiers.

**Props :** `value` (0-100), `label`, `color`

```jsx
// Container: bg-[#E2E8F0] rounded-full h-2
// Fill: bg-[#2563EB] rounded-full transition-all duration-500
// Afficher le % à droite en text-sm font-semibold
// Si value >= 80 → couleur verte
// Si value >= 50 → couleur bleue  
// Si value < 50  → couleur orange
```

---

### `ActivityItem.jsx`
Ligne d'activité récente.

**Props :** `icon`, `iconColor`, `title`, `subtitle`, `time`

```jsx
// Layout: flex items-center gap-3
// Icône dans cercle coloré taille 36px
// Titre: text-sm font-medium text-[#0F172A]
// Sous-titre: text-xs text-[#94A3B8]
// Heure: text-xs text-[#94A3B8] ml-auto
// Hover: hover:bg-[#F8FAFC] rounded-lg px-2 -mx-2 transition-all duration-150
```

---

### `UploadZone.jsx`
Zone de drag & drop pour documents.

**Design :**
- Bordure en pointillés `border-2 border-dashed border-[#E2E8F0]`
- Fond `bg-[#F8FAFC]` → au drag : `bg-blue-50 border-blue-300`
- Icône `Upload` (lucide) centré, taille 40px, couleur `#94A3B8`
- Texte : "Glissez vos documents ici" / "ou cliquez pour parcourir"
- Sous-texte : "PDF, JPEG, PNG — max 10MB"
- Transition douce lors du drag

---

### `DocumentCard.jsx`
Carte de document analysé.

**Props :** `type`, `filename`, `confidence`, `data`, `status`

**Design :**
- Icône de fichier colorée selon type (PDF → rouge, image → bleu)
- Nom du fichier tronqué avec `truncate`
- Badge `Confiance IA XX%` en haut à droite (vert si ≥ 90%, orange sinon)
- Section "Données extraites" en accordéon expandable
- Hover : `hover:shadow-md transition-all duration-200`

---

## LAYOUT — SPÉCIFICATIONS DÉTAILLÉES

### `AppLayout.jsx`
Structure principale de l'application.

```jsx
// Layout: flex h-screen overflow-hidden bg-[#F8FAFC]
// Sidebar: w-[260px] flex-shrink-0
// Main: flex-1 flex flex-col overflow-hidden
//   Header: h-16 flex-shrink-0
//   Content: flex-1 overflow-y-auto p-6
```

---

### `Sidebar.jsx`

**Structure :**

```
[Logo CipherFlow]
[Sous-titre "Automatisation immobilière"]
─────────────
NAVIGATION
  🏠 Dashboard
  ✉️ Emails
  📊 Analyse
  📄 Documents
     └─ Vérification IA (sous-item indenté)
  🗂️ Dossiers locataires
─────────────
SYSTÈME
  ⚙️ Paramètres
─────────────
[Avatar + Nom + Email]
[Bouton Se déconnecter]
```

**Styles :**
- Fond : `bg-white border-r border-[#E2E8F0]`
- Logo : texte `font-bold text-lg text-[#0F172A]` + badge CP bleu `bg-[#2563EB]`
- Item normal : `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] transition-all duration-150`
- Item actif : `bg-[#EFF6FF] text-[#2563EB] font-medium`
- Sous-item : `ml-7 text-xs`
- Section labels : `text-xs font-semibold text-[#94A3B8] uppercase tracking-wider px-3 mb-1`

**Icônes lucide-react :**
- Dashboard → `LayoutDashboard`
- Emails → `Mail`
- Analyse → `BarChart2`
- Documents → `FileText`
- Vérification IA → `ShieldCheck`
- Dossiers → `FolderOpen`
- Paramètres → `Settings`

---

### `Header.jsx`

```jsx
// Layout: h-16 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-6
// Gauche: Titre de page h1 text-xl font-semibold text-[#0F172A]
// Droite:
//   - Icône Bell (lucide) avec badge rouge si notifications
//   - Bouton "+ Nouveau" primary variant
```

---

## PAGES — SPÉCIFICATIONS DÉTAILLÉES

### `Dashboard.jsx`

**Layout :**
```
[StatCards x4 — grid grid-cols-4 gap-4]
─────────────────────────────────────────────────
[Graphique Emails — col-span-3]  [Activité récente — col-span-1]
─────────────────────────────────────────────────
[Résultats récents — tableau full width]
```

**StatCards :**
| Icône | Label | Valeur exemple | Couleur |
|-------|-------|----------------|---------|
| Mail | Emails analysés | 34 | blue |
| Home | Dossiers locataires actifs | 12 | teal |
| FileCheck | Documents vérifiés | 78 | violet |
| AlertTriangle | Alertes dossiers incomplets | 3 | orange |

**Graphique `EmailsChart.jsx` :**
- Utiliser `recharts` : `AreaChart` avec `Area` en gradient
- Couleur ligne : `#2563EB`
- Gradient fill : de `rgba(37,99,235,0.15)` à `rgba(37,99,235,0)`
- Axes : `XAxis` et `YAxis` avec style `text-xs text-[#94A3B8]`
- Tooltip personnalisé : fond blanc, bordure légère, ombre
- Boutons "Semaine" / "Mois" pour switcher les données
- Données mockées pour l'affichage (7 jours ou 30 jours)

**Activité récente :**
- Carte à droite avec titre "Activité récente" + lien "Voir tout"
- 4-5 `ActivityItem` avec icônes colorées
- Séparateur "Aujourd'hui" en label gris

---

### `Emails.jsx`

**Layout 3 colonnes :**

```
[Liste emails] | [Email sélectionné] | [Analyse IA]
   col-span-1        col-span-2           col-span-1
```

**Liste emails :**
- Item : expéditeur en bold, sujet, preview du corps, heure
- Sélectionné : bordure gauche bleue `border-l-2 border-[#2563EB] bg-[#EFF6FF]`
- Badge statut : Analysé / En attente / Erreur

**Email sélectionné :**
- Header : De / À / Sujet / Date
- Corps en prose
- Pièces jointes en chips avec icône

**Analyse IA (panel droit) :**
- Score de confiance avec `ProgressBar`
- Documents détectés (liste verte avec checkmark)
- Documents manquants (liste orange avec alert)
- Bouton "Générer réponse"

---

### `Analyse.jsx`

**Workflow en 3 blocs verticaux ou en steps :**

```
Step 1: [Email reçu]
   → Expéditeur, sujet, contenu, PJ

Step 2: [Analyse IA]  ← badge "IA en cours..." animé si processing
   → Documents détectés (✅ liste)
   → Documents manquants (⚠️ liste)
   → Score global du dossier

Step 3: [Réponse suggérée]
   → Zone texte éditable (textarea stylisé)
   → Boutons: [Modifier] [Envoyer]
```

**Design des steps :**
- Numéro de step dans cercle bleu
- Ligne de connexion entre les steps
- Step complété → cercle vert avec checkmark

---

### `DossiersLocataires.jsx`

**Layout 2 colonnes :**

```
[Liste locataires — 1/3]  |  [Dossier détail — 2/3]
```

**Liste locataires :**
- Champ de recherche en haut
- Item : avatar initial, nom complet, adresse, score en badge coloré
- Sélectionné : fond bleu clair

**Dossier détail :**
- Header : nom, email, téléphone, statut
- `ProgressBar` "Score dossier" prominent en haut
- Section "Documents reçus" : liste avec badge vert ✅
- Section "Documents manquants" : liste avec badge orange ⚠️
- Timeline d'activité en bas

---

### `Documents.jsx`

**Layout :**

```
[UploadZone — top]
[Documents analysés — grid 3 colonnes]
```

**Après upload :**
- `DocumentCard` pour chaque doc
- Type détecté en badge (Bulletin de salaire, CNI, Avis d'imposition…)
- Données extraites dans un accordéon
- Badge "Confiance IA XX%" en haut à droite de chaque carte

---

## ANIMATIONS & POLISH

### Loading states
- Skeleton loader pour les cartes stats : `animate-pulse bg-[#E2E8F0] rounded`
- Spinner pour les appels API : cercle SVG animé en `#2563EB`

### Transitions de page
- Fade in sur mount : `opacity-0 → opacity-100` avec `transition-opacity duration-300`

### Hover effects
```css
/* Cartes */
hover:shadow-md hover:-translate-y-0.5 transition-all duration-200

/* Boutons */
hover:scale-[1.02] active:scale-[0.98] transition-all duration-150

/* Items de liste */
hover:bg-[#F8FAFC] transition-colors duration-150
```

### Empty states
- Illustration simple (SVG inline) + texte "Aucun élément" pour les listes vides

---

## TAILWIND CONFIG

Mettre à jour `tailwind.config.js` :

```js
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563EB',
          50: '#EFF6FF',
          100: '#DBEAFE',
          600: '#2563EB',
          700: '#1D4ED8',
        },
        secondary: '#0EA5A4',
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [],
}
```

---

## ORDRE D'EXÉCUTION RECOMMANDÉ

1. Mettre à jour `tailwind.config.js`
2. Créer les composants UI primitifs (`Button`, `Card`, `Badge`, `ProgressBar`)
3. Créer `Sidebar.jsx` et `Header.jsx`
4. Créer `AppLayout.jsx` et connecter le router existant
5. Refondre `Dashboard.jsx` (StatCards + Chart + Activité)
6. Créer `EmailsChart.jsx`
7. Refondre `Emails.jsx` et `Analyse.jsx`
8. Refondre `DossiersLocataires.jsx`
9. Refondre `Documents.jsx` avec `UploadZone`
10. Ajouter les micro-interactions et polish final

---

## CHECKLIST FINALE

Avant de terminer, vérifier :

- [ ] Le layout Sidebar + Header + Content fonctionne sur toutes les pages
- [ ] Les 4 StatCards s'affichent en grid sur le Dashboard
- [ ] Le graphique recharts s'affiche sans erreur
- [ ] Tous les composants ont leurs hover states
- [ ] Les transitions `duration-200` sont appliquées partout
- [ ] Les couleurs respectent exactement la palette définie
- [ ] Aucun appel API n'a été modifié
- [ ] Aucun fichier backend n'a été touché
- [ ] L'authentification Google OAuth fonctionne toujours
- [ ] Le routing React existant est préservé

---

*Ce prompt a été généré pour le projet CipherFlow — SaaS de gestion immobilière.*
