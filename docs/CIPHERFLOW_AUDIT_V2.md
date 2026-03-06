# CLAUDE CODE — AUDIT & CORRECTIONS V2 — CIPHERFLOW

> Colle ce prompt dans Claude Code depuis la racine du projet frontend.

---

## MISSION 1 — INTÉGRATION DU LOGO

### Remplacer le badge "CF" dans la Sidebar par le vrai logo

Le fichier logo se trouve dans le projet. Cherche-le dans :
- `public/logo.png`
- `src/assets/logo.png`
- `assets/logo.png`

Si tu ne trouves pas, demande à l'utilisateur de confirmer le chemin.

**Dans `src/components/layout/Sidebar.jsx`**, remplace la section logo actuelle :

```jsx
// AVANT (badge CF texte)
<div className="flex items-center gap-3 px-4 py-5">
  <div className="w-8 h-8 bg-[#2563EB] rounded-lg flex items-center justify-center">
    <span className="text-white font-bold text-sm">CF</span>
  </div>
  <div>
    <p className="font-bold text-[#0F172A]">CipherFlow</p>
    <p className="text-xs text-[#94A3B8]">Automatisation immobilière</p>
  </div>
</div>

// APRÈS (vrai logo)
<div className="flex items-center gap-3 px-4 py-5">
  <img 
    src="/logo.png"   {/* adapte le chemin si nécessaire */}
    alt="CipherFlow"
    className="h-8 w-8 object-contain"
  />
  <div>
    <p className="font-bold text-[#0F172A]">CipherFlow</p>
    <p className="text-xs text-[#94A3B8]">Automatisation immobilière</p>
  </div>
</div>
```

---

## MISSION 2 — CORRECTION DES FONDS NOIRS (CRITIQUE)

### Problème identifié
Les pages **Documents (Vérification IA)** et **Paramètres** ont des cartes avec fond `dark navy (#0F172A)`. 
C'est un résidu du thème sombre précédent qui n'a pas été migré.

### Page Documents — `src/pages/Documents.jsx` (ou similaire)

Cherche dans le fichier tous les classnames contenant :
- `bg-gray-800`, `bg-gray-900`, `bg-slate-800`, `bg-slate-900`
- `bg-[#0F172A]`, `bg-[#1E293B]`, `bg-[#1a1a2e]`
- `dark:`, `text-white` (dans un contexte de carte)

**Remplacer** toutes les cartes sombres par :
```
bg-white border border-[#E2E8F0] rounded-xl shadow-sm
```

**Texte dans ces cartes** :
- Titres : `text-[#0F172A]` (pas text-white)
- Corps : `text-[#475569]`
- Labels : `text-[#94A3B8]`

**Zone Upload (UploadZone)** :
```jsx
// Remplacer le fond sombre par :
className="border-2 border-dashed border-[#E2E8F0] rounded-xl bg-[#F8FAFC] 
           hover:border-[#2563EB] hover:bg-[#EFF6FF] transition-all duration-200 
           p-12 flex flex-col items-center justify-center cursor-pointer"

// Icône Upload : text-[#94A3B8] (pas text-white)
// Texte principal : text-[#475569]
// Texte secondaire : text-xs text-[#94A3B8]
```

**Bouton "Lancer l'analyse"** :
```jsx
// Remplacer le bouton pleine largeur sombre par :
className="w-full bg-[#2563EB] text-white rounded-lg py-3 font-medium 
           hover:bg-[#1D4ED8] transition-all duration-200 mt-4"
```

**Tableau des documents analysés** (en bas de la page Documents) :
```jsx
// Header du tableau :
className="grid grid-cols-5 gap-4 px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0] 
           text-xs font-semibold text-[#94A3B8] uppercase tracking-wider"

// Ligne de document :
className="grid grid-cols-5 gap-4 px-4 py-4 border-b border-[#F1F5F9] 
           hover:bg-[#F8FAFC] transition-colors duration-150 items-center"

// Badge type document (ex: "ID") :
className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200"
```

---

### Page Paramètres — `src/pages/Settings.jsx` (ou similaire)

Même traitement : toutes les cartes sombres (Gmail, Outlook, Filtres, Identité, Branding, Comportement IA) doivent devenir blanches.

**Carte Gmail connectée** :
```jsx
// Container carte :
className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-sm"

// Statut "Connecté" badge :
className="px-2.5 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-200"

// Ligne de statut watcher :
className="flex items-center gap-2 p-3 bg-[#F0FDF4] rounded-lg border border-green-200"

// Icône wifi : text-green-500
// Texte : text-green-700 text-sm font-medium

// Bouton Déconnecter Gmail :
className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 
           rounded-lg text-sm font-medium hover:bg-red-100 transition-all duration-200"
```

**Carte Outlook** :
```jsx
className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-sm"

// Message "Aucune boîte connectée" :
className="p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] text-sm text-[#475569]"

// Bouton Connecter Outlook :
className="flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] text-white rounded-lg 
           text-sm font-medium hover:bg-[#1D4ED8] transition-all duration-200"

// Note "1 clic" :
className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200 mt-3"
// Texte : text-amber-700 text-xs
```

**Carte Filtres personnalisés** :
```jsx
className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-sm"

// Input :
className="flex-1 px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm 
           text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 
           focus:ring-[#2563EB]/30 focus:border-[#2563EB] transition-all duration-200"

// Bouton Ajouter :
className="px-4 py-2.5 bg-[#2563EB] text-white rounded-lg text-sm font-medium 
           hover:bg-[#1D4ED8] transition-all duration-200"
```

**Formulaires Identité + Branding + IA** :
```jsx
// Toutes les cartes :
className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-sm mb-4"

// Tous les inputs/selects :
className="w-full px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm 
           text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 
           focus:ring-[#2563EB]/30 focus:border-[#2563EB] transition-all duration-200"

// Zone upload logo :
className="w-24 h-24 border-2 border-dashed border-[#E2E8F0] rounded-xl 
           flex items-center justify-center bg-[#F8FAFC] cursor-pointer 
           hover:border-[#2563EB] hover:bg-[#EFF6FF] transition-all duration-200"
```

---

## MISSION 3 — AMÉLIORATIONS UX (par page)

### Dashboard

**Stat Cards — problème :** les labels sont en UPPERCASE très petits, la hiérarchie est inversée (label avant valeur).

Corriger l'ordre visuel :
```jsx
// Structure recommandée dans StatCard :
<div className="flex items-center justify-between mb-4">
  <span className="text-sm font-medium text-[#475569]">{label}</span>
  <div className={`p-2 rounded-lg ${iconBg}`}>
    <Icon className={`h-5 w-5 ${iconColor}`} />
  </div>
</div>
<div className="text-3xl font-bold text-[#0F172A]">{value}</div>
<div className="text-xs text-[#94A3B8] mt-1">{sublabel}</div>
```

**Activité récente** — si vide, afficher un empty state propre :
```jsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <Activity className="h-10 w-10 text-[#E2E8F0] mb-3" />
  <p className="text-sm text-[#94A3B8]">Aucune activité pour l'instant</p>
  <p className="text-xs text-[#CBD5E1] mt-1">Les événements apparaîtront ici</p>
</div>
```

---

### Page Emails (Historique)

**Problème :** Page très vide avec "Aucun email trouvé." en texte brut.

Ajouter un empty state complet :
```jsx
<div className="flex flex-col items-center justify-center py-20 text-center">
  <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
    <Mail className="h-8 w-8 text-blue-400" />
  </div>
  <h3 className="text-base font-semibold text-[#0F172A] mb-2">
    Aucun email pour l'instant
  </h3>
  <p className="text-sm text-[#94A3B8] max-w-xs">
    Connectez votre boîte Gmail dans les Paramètres pour commencer 
    la surveillance automatique.
  </p>
  <button className="mt-6 px-4 py-2 bg-[#2563EB] text-white rounded-lg text-sm 
                     font-medium hover:bg-[#1D4ED8] transition-all duration-200">
    Aller aux Paramètres
  </button>
</div>
```

**Améliorer la barre de filtres :**
```jsx
// Inputs et selects :
className="px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm 
           text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 
           focus:border-[#2563EB] transition-all duration-200"

// Bouton Rafraîchir :
className="px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm 
           text-[#475569] hover:bg-[#F1F5F9] transition-all duration-200 
           flex items-center gap-2"

// Bouton Reset :
className="px-3 py-2 text-sm text-[#94A3B8] hover:text-[#475569] transition-colors duration-200"
```

---

### Page Analyse d'email

**Problème :** Formulaire très nu, inputs sans style distinctif.

Améliorer les inputs :
```jsx
// Tous les inputs/textarea :
className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-sm 
           text-[#0F172A] placeholder-[#CBD5E1] focus:outline-none focus:ring-2 
           focus:ring-[#2563EB]/30 focus:border-[#2563EB] transition-all duration-200 
           resize-none"

// Labels :
className="block text-sm font-medium text-[#475569] mb-2"

// Bouton Analyser :
className="px-6 py-2.5 bg-[#2563EB] text-white rounded-lg text-sm font-semibold 
           hover:bg-[#1D4ED8] hover:shadow-md transition-all duration-200 
           flex items-center gap-2"

// Bouton Reset :
className="px-6 py-2.5 bg-white border border-[#E2E8F0] text-[#475569] rounded-lg 
           text-sm font-medium hover:bg-[#F8FAFC] transition-all duration-200"
```

**Envelopper le formulaire dans une carte** :
```jsx
<div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-6">
  <h2 className="text-base font-semibold text-[#0F172A] mb-1">Traitement Email</h2>
  <p className="text-sm text-[#94A3B8] mb-6">
    Colle un email, ajoute les pièces jointes et lance l'analyse IA + réponse suggérée.
  </p>
  {/* ...formulaire... */}
</div>
```

---

### Page Dossiers locataires

**Problème :** Layout trop basique, colonnes non stylisées.

**Colonne gauche (liste)** :
```jsx
// Container :
className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden"

// Header :
className="p-4 border-b border-[#E2E8F0]"

// Input recherche :
className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm 
           placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"

// Bouton Nouveau dossier :
className="px-3 py-2 bg-[#2563EB] text-white rounded-lg text-sm font-medium 
           hover:bg-[#1D4ED8] transition-all duration-200 whitespace-nowrap"

// Empty state "Aucun locataire" :
<div className="flex flex-col items-center justify-center py-12 text-center p-4">
  <FolderOpen className="h-10 w-10 text-[#E2E8F0] mb-3" />
  <p className="text-sm text-[#94A3B8]">Aucun dossier créé</p>
</div>
```

**Colonne droite (détail)** :
```jsx
// Sections "Détails" et "Pièces du dossier" :
className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-6 mb-4"

// Empty state :
className="flex flex-col items-center justify-center py-12 text-center"
// + icône User/FileText + texte explicatif
```

---

## MISSION 4 — POLISH GLOBAL

### Header — cohérence
```jsx
// Le titre "Tableau de bord" est correct
// Vérifier que TOUTES les pages ont le même Header avec :
// - Titre à gauche : text-xl font-semibold text-[#0F172A]
// - Cloche + Bouton "+ Nouveau" à droite
// - Hauteur fixe : h-16
// - Fond blanc + bordure basse : bg-white border-b border-[#E2E8F0]
```

### Sidebar — logo
```jsx
// Après intégration du logo :
// Vérifier que la sidebar a bien :
// - width: 260px fixe (min-w-[260px] w-[260px])
// - Ne se réduit pas sur petits écrans (overflow-hidden sur le parent)
// - Logo image h-8 w-8 object-contain (pas de distorsion)
```

### Variables CSS globales (dans index.css)
S'assurer que ces variables sont définies et utilisées :
```css
:root {
  --color-bg: #F8FAFC;
  --color-card: #FFFFFF;
  --color-border: #E2E8F0;
  --color-primary: #2563EB;
  --color-text: #0F172A;
  --color-muted: #94A3B8;
}

body {
  background-color: var(--color-bg);
  color: var(--color-text);
}
```

### Scrollbar personnalisée (dans index.css)
```css
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: #F8FAFC;
}
::-webkit-scrollbar-thumb {
  background: #E2E8F0;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #CBD5E1;
}
```

---

## RÉSUMÉ DES PRIORITÉS

| Priorité | Action | Impact |
|----------|--------|--------|
| 🔴 CRITIQUE | Intégrer le vrai logo dans la Sidebar | Branding |
| 🔴 CRITIQUE | Convertir cartes noires → blanches (Documents + Paramètres) | Cohérence |
| 🟠 IMPORTANT | Améliorer empty states (Emails, Dossiers, Activité) | UX |
| 🟠 IMPORTANT | Styler les inputs/formulaires (Analyse, Paramètres) | Qualité |
| 🟡 NICE | Scrollbar personnalisée | Polish |
| 🟡 NICE | Variables CSS globales dans index.css | Maintenabilité |

---

## ORDRE D'EXÉCUTION

1. Intégrer le logo dans Sidebar.jsx
2. Corriger Documents.jsx (fonds noirs → blancs)
3. Corriger Settings.jsx / Paramètres (fonds noirs → blancs)  
4. Améliorer empty states sur toutes les pages
5. Styler les inputs/formulaires
6. Ajouter scrollbar + variables CSS
7. Vérifier le rendu final sur toutes les pages

**RAPPEL : Ne jamais modifier le backend, les API calls, ni l'authentification OAuth.**
