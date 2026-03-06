# CLAUDE CODE — CORRECTIONS AUDIT FRONTEND CIPHERFLOW

> Colle ce prompt dans Claude Code depuis la racine du projet frontend.

---

## RÈGLES ABSOLUES

❌ Ne modifie JAMAIS les fichiers backend
❌ Ne modifie JAMAIS les endpoints API existants
❌ Ne modifie JAMAIS l'authentification Google OAuth
✅ Corrige uniquement les points listés ci-dessous dans l'ordre indiqué

---

## 🔴 BLOC 1 — CRITIQUES (à corriger en premier)

---

### FIX 1 — Greeting Dashboard : getUserNameFromToken toujours null

**Fichier :** `src/pages/Dashboard.jsx`

**Problème :** `getUserNameFromToken()` lit `localStorage.getItem('access_token')` mais le token JWT est stocké EN MÉMOIRE dans `api.js`, jamais en localStorage. Le nom est donc toujours null.

**Fix :**

```js
// Cherche dans services/api.js quelle fonction expose l'email :
grep -n "getEmail\|getUser\|localStorage" src/services/api.js
```

Remplace dans `Dashboard.jsx` la fonction `getUserNameFromToken` par :

```jsx
// OPTION A — si api.js exporte getEmail() :
import { getEmail } from '../services/api'

const getUserName = () => {
  const email = getEmail?.() || localStorage.getItem('cipherflow_email')
  if (!email) return null
  // Retourne la partie avant le @ comme prénom
  return email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1)
}

// OPTION B — si l'email est dans un contexte React (useAuth, useUser, etc.) :
// Utilise le hook existant pour récupérer user.email
// Applique la même transformation : email.split('@')[0]
```

Dans le composant `DashboardGreeting`, remplace :
```jsx
// AVANT :
const userName = getUserNameFromToken()

// APRÈS :
const userName = getUserName()
// ou via hook : const { user } = useAuth() puis user?.email?.split('@')[0]
```

---

### FIX 2 — API_BASE hardcodée dans 5 fichiers

**Problème :** L'URL Railway est écrite en dur dans 5 fichiers. Si l'URL change, l'app est cassée en 5 endroits.

**Vérifie d'abord comment API_URL est exporté :**
```bash
grep -n "API_URL\|API_BASE\|export" src/services/api.js | head -10
```

**Dans chacun des 5 fichiers suivants**, remplace la ligne hardcodée :

```jsx
// AVANT (dans chaque fichier) :
const API_BASE = "https://cipherflow-mvp-production.up.railway.app"
// ou :
const API_URL = "https://cipherflow-mvp-production.up.railway.app"

// APRÈS (import depuis le service centralisé) :
import { API_URL as API_BASE } from '../services/api'
// adapte le chemin relatif selon la profondeur du fichier
```

**Fichiers à corriger :**
1. `src/components/FileAnalyzer.jsx` — ligne 7
2. `src/components/SettingsPanel.jsx` — ligne 10
3. `src/components/InvoiceGenerator.jsx` — ligne 4
4. `src/components/EmailHistory.jsx` — lignes 538 et 566 (2 occurrences)
5. `src/pages/VerifyEmail.jsx` — ligne 6

**Après chaque remplacement, vérifie qu'il n'y a plus de hardcode :**
```bash
grep -rn "railway.app\|cipherflow-mvp-production" src/ --include="*.jsx"
```
Le résultat doit être vide (0 occurrences).

---

### FIX 3 — Remplacer les 16 alert() par des erreurs inline

**Fichiers :** `src/components/FileAnalyzer.jsx` (7 alert) et `src/components/InvoiceGenerator.jsx` (9 alert)

**Ajouter un état d'erreur dans chaque composant :**

```jsx
// En haut du composant, ajouter :
const [errorMessage, setErrorMessage] = useState(null)
const [successMessage, setSuccessMessage] = useState(null)

// Remplacer CHAQUE alert("message d'erreur") par :
setErrorMessage("message d'erreur")

// Remplacer CHAQUE alert("message de succès") par :
setSuccessMessage("message de succès")

// Effacer après 4 secondes :
useEffect(() => {
  if (errorMessage || successMessage) {
    const t = setTimeout(() => {
      setErrorMessage(null)
      setSuccessMessage(null)
    }, 4000)
    return () => clearTimeout(t)
  }
}, [errorMessage, successMessage])
```

**Ajouter les banners dans le JSX, juste après l'ouverture du container principal :**

```jsx
{/* Banner erreur */}
{errorMessage && (
  <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 
                   rounded-lg mb-4 text-sm text-red-700">
    <span>⚠️</span>
    <span className="flex-1">{errorMessage}</span>
    <button onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-red-600 transition-colors">✕</button>
  </div>
)}

{/* Banner succès */}
{successMessage && (
  <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 
                   rounded-lg mb-4 text-sm text-green-700">
    <span>✅</span>
    <span className="flex-1">{successMessage}</span>
    <button onClick={() => setSuccessMessage(null)}
            className="text-green-400 hover:text-green-600 transition-colors">✕</button>
  </div>
)}
```

**Vérifie qu'il ne reste plus aucun alert() :**
```bash
grep -rn "alert(" src/ --include="*.jsx"
```
Le résultat doit être vide.

---

### FIX 4 — LegalNotice.jsx orphelin avec TODO P1

**Fichier :** `src/pages/LegalNotice.jsx`

Ce fichier est non routé et contient un TODO P1 (adresse physique manquante). 
Deux options — **choisis l'option A** (la plus simple) :

**Option A — Supprimer le fichier orphelin :**
```bash
rm src/pages/LegalNotice.jsx
```

**Option B — Si tu veux le conserver pour plus tard :**
Ajoute un commentaire en haut du fichier :
```jsx
// TODO: Compléter l'adresse physique avant d'exposer cette page
// Fichier non routé intentionnellement — en attente de données légales
```

---

## 🟠 BLOC 2 — IMPORTANTS

---

### FIX 5 — EmailHistory.jsx : migrer du CSS legacy vers Tailwind

**Fichier :** `src/components/EmailHistory.jsx`

**Problème :** Les classes `className="input"`, `className="select"`, `className="toolbar"`, `className="page-header"` viennent du CSS legacy dans `index.css` et cassent la cohérence design.

**Cherche toutes les occurrences :**
```bash
grep -n 'className="input"\|className="select"\|className="toolbar"\|className="page-header"\|className="btn"' src/components/EmailHistory.jsx
```

**Remplacements :**

```jsx
// className="input" → Tailwind :
className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm 
           text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 
           focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all duration-200"

// className="select" → Tailwind :
className="px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm 
           text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 
           focus:border-[#2563EB] transition-all duration-200 cursor-pointer"

// className="toolbar" → Tailwind :
className="flex items-center gap-3 flex-wrap mb-4"

// className="page-header" → Tailwind :
className="mb-6"

// className="btn btn-primary" → Tailwind :
className="px-4 py-2 bg-[#2563EB] text-white text-sm font-medium rounded-lg 
           hover:bg-[#1D4ED8] transition-all duration-200"

// className="btn btn-secondary" ou className="btn" → Tailwind :
className="px-4 py-2 bg-white border border-[#E2E8F0] text-sm font-medium 
           text-[#475569] rounded-lg hover:bg-[#F8FAFC] transition-all duration-200"
```

---

### FIX 6 — Badge "Surveillance active" conditionnel

**Fichier :** `src/pages/Dashboard.jsx`

**Problème :** Le badge vert "Surveillance active" est toujours affiché, même si aucun compte email n'est connecté.

**Fix :**

```jsx
// Cherche comment l'état de connexion Gmail/Outlook est exposé :
grep -n "gmailConnected\|outlookConnected\|watcher\|isConnected" src/services/api.js src/pages/Dashboard.jsx 2>/dev/null | head -10

// Dans DashboardGreeting, rendre le badge conditionnel :
// Si tu as accès à l'état de connexion via props ou hook :

const DashboardGreeting = ({ userName, isWatcherActive }) => {
  // ...
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2>...</h2>
        <p>...</p>
      </div>
      
      {/* Badge conditionnel */}
      {isWatcherActive ? (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 
                         border border-green-200 rounded-full">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs font-medium text-green-700">Surveillance active</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#F1F5F9] 
                         border border-[#E2E8F0] rounded-full">
          <div className="w-2 h-2 bg-[#CBD5E1] rounded-full"></div>
          <span className="text-xs font-medium text-[#94A3B8]">Aucune surveillance</span>
        </div>
      )}
    </div>
  )
}

// Dans le Dashboard parent, passer le prop :
// <DashboardGreeting userName={...} isWatcherActive={stats?.gmail_connected || stats?.outlook_connected || false} />
```

---

### FIX 7 — Liens Sidebar légaux : remplacer <a> par <Link>

**Fichier :** `src/components/layout/Sidebar.jsx`

**Problème :** Les liens vers `/privacy` et `/mentions-legales` ouvrent un nouvel onglet au lieu de naviguer en SPA.

```jsx
// Cherche les liens dans la sidebar :
grep -n "privacy\|mentions\|legal\|target" src/components/layout/Sidebar.jsx

// AVANT :
<a href="/privacy" target="_blank" rel="noopener noreferrer">Confidentialité</a>
<a href="/mentions-legales" target="_blank">Mentions légales</a>

// APRÈS (navigation SPA, même onglet) :
import { Link } from 'react-router-dom'

<Link to="/privacy" className="text-xs text-[#94A3B8] hover:text-[#475569] transition-colors">
  Confidentialité
</Link>
<Link to="/legal" className="text-xs text-[#94A3B8] hover:text-[#475569] transition-colors">
  Mentions légales
</Link>
```

---

### FIX 8 — Header Bell : ajouter aria-label

**Fichier :** `src/components/layout/Header.jsx`

```jsx
// AVANT :
<button className="...">
  <Bell className="h-5 w-5" />
</button>

// APRÈS :
<button 
  className="..."
  aria-label="Notifications"
  title="Notifications"
>
  <Bell className="h-5 w-5" />
</button>
```

---

### FIX 9 — Sidebar "Vérification IA" : supprimer le sub-item redondant

**Fichier :** `src/components/layout/Sidebar.jsx`

**Problème :** "Vérification IA" pointe vers `/documents`, identique à l'item parent "Documents". C'est redondant.

**Option A — Supprimer le sub-item (recommandé) :**
```jsx
// Cherche et supprime le NavSubItem "Vérification IA" :
grep -n "Vérification\|verification\|ShieldCheck" src/components/layout/Sidebar.jsx
// Supprime les lignes correspondantes
```

**Option B — Créer une vraie route dédiée :**
```jsx
// Dans AppLayout.jsx, ajouter :
<Route path="/documents/verification" element={<FileAnalyzer defaultTab="verification" />} />
// Et dans Sidebar, pointer vers /documents/verification
```
→ **Choisis Option A** (plus simple, moins de code).

---

## 🟡 BLOC 3 — NICE TO HAVE

---

### FIX 10 — Supprimer le doublon StatCard

**Problème :** `src/components/StatCard.jsx` et `src/components/ui/StatCard.jsx` coexistent.

```bash
# Vérifie lequel est importé partout :
grep -rn "from.*StatCard\|import.*StatCard" src/ --include="*.jsx"

# Si tout importe depuis ui/StatCard.jsx :
# Supprime le doublon à la racine :
rm src/components/StatCard.jsx
```

---

### FIX 11 — Aria-labels boutons icône dans TenantFilesPanel

**Fichier :** `src/components/TenantFilesPanel.jsx`

```bash
# Cherche les boutons sans texte :
grep -n "Eye\|Download\|Trash2\|Link2" src/components/TenantFilesPanel.jsx | head -20
```

Pour chaque bouton icône sans texte visible, ajouter `aria-label` :

```jsx
<button aria-label="Voir le document" title="Voir" className="...">
  <Eye className="h-4 w-4" />
</button>

<button aria-label="Télécharger" title="Télécharger" className="...">
  <Download className="h-4 w-4" />
</button>

<button aria-label="Supprimer" title="Supprimer" className="...">
  <Trash2 className="h-4 w-4" />
</button>
```

---

## VÉRIFICATION FINALE

Après toutes les corrections, vérifie :

```bash
# 1. Plus aucun alert() natif
grep -rn "alert(" src/ --include="*.jsx"

# 2. Plus aucune URL Railway hardcodée
grep -rn "railway.app" src/ --include="*.jsx"

# 3. Plus de classes legacy dans EmailHistory
grep -n 'className="input"\|className="select"\|className="btn"' src/components/EmailHistory.jsx

# 4. Plus de target="_blank" sur les liens légaux sidebar
grep -n "target.*_blank" src/components/layout/Sidebar.jsx

# 5. L'app compile sans erreur
npm run build
```

---

## RÉSUMÉ DES FICHIERS MODIFIÉS

| Fichier | Fixes appliqués |
|---------|-----------------|
| `Dashboard.jsx` | FIX 1 + FIX 6 |
| `FileAnalyzer.jsx` | FIX 2 + FIX 3 |
| `SettingsPanel.jsx` | FIX 2 |
| `InvoiceGenerator.jsx` | FIX 2 + FIX 3 |
| `EmailHistory.jsx` | FIX 2 + FIX 5 |
| `VerifyEmail.jsx` | FIX 2 |
| `LegalNotice.jsx` | FIX 4 (suppression) |
| `Sidebar.jsx` | FIX 7 + FIX 9 |
| `Header.jsx` | FIX 8 |
| `StatCard.jsx` (racine) | FIX 10 (suppression doublon) |
| `TenantFilesPanel.jsx` | FIX 11 |

---

**RAPPEL : Ne jamais modifier le backend, les API calls, ni l'authentification OAuth.**
