# CLAUDE CODE — REFONTE PARAMÈTRES + CRÉATION PAGE MON COMPTE

> Colle ce prompt dans Claude Code depuis la racine du projet frontend.

---

## RÈGLES ABSOLUES

❌ Ne modifie JAMAIS les fichiers backend  
❌ Ne modifie JAMAIS les appels API existants  
❌ Ne modifie JAMAIS l'authentification Google OAuth  
✅ Refonds uniquement le JSX et les classes CSS  
✅ Conserve tous les hooks, contextes et appels API existants  

---

## MISSION 1 — REFONTE COMPLÈTE PAGE PARAMÈTRES

### Localise le fichier
Cherche dans : `src/pages/Settings.jsx` ou `src/pages/Parametres.jsx`

### Problème actuel
Toutes les cartes ont un fond sombre (dark navy). Tout doit devenir light mode.

### Structure générale de la page

```jsx
// Layout de la page :
<div className="max-w-3xl mx-auto space-y-6">
  
  {/* Titre de section */}
  <div className="mb-8">
    <h1 className="text-2xl font-bold text-[#0F172A]">Paramètres</h1>
    <p className="text-sm text-[#94A3B8] mt-1">
      Personnalisez votre agence et configurez la réception automatique des emails.
    </p>
  </div>

  {/* Sections sous forme de cartes blanches */}
  ...
  
</div>
```

---

### SECTION 1 — Identité de l'Entreprise

```jsx
<div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
  
  {/* Header de section */}
  <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center gap-3">
    <div className="p-2 bg-blue-50 rounded-lg">
      <Building2 className="h-4 w-4 text-blue-600" />
    </div>
    <div>
      <h2 className="text-sm font-semibold text-[#0F172A]">Identité de l'Entreprise</h2>
      <p className="text-xs text-[#94A3B8]">Informations de votre agence immobilière</p>
    </div>
  </div>

  {/* Contenu */}
  <div className="px-6 py-5 grid grid-cols-2 gap-4">
    
    {/* Nom de l'entreprise */}
    <div>
      <label className="block text-xs font-medium text-[#475569] mb-2 uppercase tracking-wide">
        Nom de l'entreprise
      </label>
      <input
        type="text"
        placeholder="Ex: Agence Martin"
        className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg 
                   text-sm text-[#0F172A] placeholder-[#CBD5E1]
                   focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 
                   focus:border-[#2563EB] focus:bg-white transition-all duration-200"
      />
    </div>

    {/* Nom de l'Agent IA */}
    <div>
      <label className="block text-xs font-medium text-[#475569] mb-2 uppercase tracking-wide">
        Nom de l'Agent IA
      </label>
      <input
        type="text"
        placeholder="Ex: Sophie"
        className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg 
                   text-sm text-[#0F172A] placeholder-[#CBD5E1]
                   focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 
                   focus:border-[#2563EB] focus:bg-white transition-all duration-200"
      />
    </div>

  </div>

  {/* Footer avec bouton save */}
  <div className="px-6 py-4 bg-[#F8FAFC] border-t border-[#E2E8F0] flex justify-end">
    <button className="px-4 py-2 bg-[#2563EB] text-white text-sm font-medium rounded-lg 
                       hover:bg-[#1D4ED8] transition-all duration-200">
      Enregistrer
    </button>
  </div>

</div>
```

---

### SECTION 2 — Branding & Logo

```jsx
<div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">

  <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center gap-3">
    <div className="p-2 bg-violet-50 rounded-lg">
      <Palette className="h-4 w-4 text-violet-600" />
    </div>
    <div>
      <h2 className="text-sm font-semibold text-[#0F172A]">Branding & Logo</h2>
      <p className="text-xs text-[#94A3B8]">Logo affiché dans l'interface et les emails</p>
    </div>
  </div>

  <div className="px-6 py-5 flex items-center gap-6">
    
    {/* Aperçu logo */}
    <div className="w-20 h-20 border-2 border-dashed border-[#E2E8F0] rounded-xl 
                    flex items-center justify-center bg-[#F8FAFC] cursor-pointer
                    hover:border-[#2563EB] hover:bg-[#EFF6FF] transition-all duration-200 
                    group">
      <ImageIcon className="h-7 w-7 text-[#CBD5E1] group-hover:text-[#2563EB] transition-colors" />
    </div>

    <div>
      <p className="text-sm font-medium text-[#0F172A] mb-1">Mettre à jour le logo</p>
      <p className="text-xs text-[#94A3B8] mb-3">PNG, JPG ou SVG — max 2MB</p>
      <button className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] 
                         text-sm font-medium text-[#475569] rounded-lg
                         hover:bg-[#F8FAFC] hover:border-[#2563EB] hover:text-[#2563EB]
                         transition-all duration-200">
        <Upload className="h-4 w-4" />
        Choisir un fichier
      </button>
    </div>

  </div>

</div>
```

---

### SECTION 3 — Comportement de l'IA

```jsx
<div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">

  <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center gap-3">
    <div className="p-2 bg-teal-50 rounded-lg">
      <Bot className="h-4 w-4 text-teal-600" />
    </div>
    <div>
      <h2 className="text-sm font-semibold text-[#0F172A]">Comportement de l'IA</h2>
      <p className="text-xs text-[#94A3B8]">Personnalisez le ton et la langue des réponses</p>
    </div>
  </div>

  <div className="px-6 py-5 space-y-4">

    {/* Ton de la réponse */}
    <div>
      <label className="block text-xs font-medium text-[#475569] mb-2 uppercase tracking-wide">
        Ton de la réponse
      </label>
      <select className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg 
                         text-sm text-[#0F172A] appearance-none cursor-pointer
                         focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 
                         focus:border-[#2563EB] focus:bg-white transition-all duration-200">
        <option value="professionnel">🏢 Professionnel</option>
        <option value="chaleureux">😊 Chaleureux</option>
        <option value="formel">📋 Formel</option>
        <option value="concis">⚡ Concis</option>
      </select>
    </div>

    {/* Langue */}
    <div>
      <label className="block text-xs font-medium text-[#475569] mb-2 uppercase tracking-wide">
        Langue des réponses
      </label>
      <select className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg 
                         text-sm text-[#0F172A] appearance-none cursor-pointer
                         focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 
                         focus:border-[#2563EB] focus:bg-white transition-all duration-200">
        <option value="fr">🇫🇷 Français</option>
        <option value="en">🇬🇧 English</option>
        <option value="es">🇪🇸 Español</option>
      </select>
    </div>

  </div>

  <div className="px-6 py-4 bg-[#F8FAFC] border-t border-[#E2E8F0] flex justify-end">
    <button className="px-4 py-2 bg-[#2563EB] text-white text-sm font-medium rounded-lg 
                       hover:bg-[#1D4ED8] transition-all duration-200">
      Enregistrer
    </button>
  </div>

</div>
```

---

### SECTION 4 — Connexions Email (Gmail + Outlook)

```jsx
<div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">

  <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center gap-3">
    <div className="p-2 bg-orange-50 rounded-lg">
      <Mail className="h-4 w-4 text-orange-600" />
    </div>
    <div>
      <h2 className="text-sm font-semibold text-[#0F172A]">Connexions Email</h2>
      <p className="text-xs text-[#94A3B8]">Boîtes surveillées automatiquement par l'IA</p>
    </div>
  </div>

  <div className="px-6 py-5 grid grid-cols-2 gap-4">

    {/* --- Gmail connecté --- */}
    <div className="border border-[#E2E8F0] rounded-xl p-4 bg-[#F8FAFC]">
      
      <div className="flex items-center gap-2 mb-3">
        {/* Icône Google SVG inline */}
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        <span className="text-sm font-semibold text-[#0F172A]">Gmail</span>
        {/* Badge connecté */}
        <span className="ml-auto px-2 py-0.5 bg-green-50 text-green-700 text-xs 
                         font-medium rounded-full border border-green-200">
          Connecté
        </span>
      </div>

      {/* Email connecté */}
      <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200 mb-3">
        <Wifi className="h-4 w-4 text-green-500 flex-shrink-0" />
        <div>
          <p className="text-xs font-medium text-green-800">cipherflow.services@gmail.com</p>
          <p className="text-xs text-green-600">Watcher actif — surveillance en cours</p>
        </div>
      </div>

      {/* Bouton déconnecter */}
      <button className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 
                         border border-red-200 rounded-lg text-xs font-medium w-full 
                         justify-center hover:bg-red-100 transition-all duration-200">
        <WifiOff className="h-3.5 w-3.5" />
        Déconnecter Gmail
      </button>
    </div>

    {/* --- Outlook non connecté --- */}
    <div className="border border-[#E2E8F0] rounded-xl p-4 bg-[#F8FAFC]">

      <div className="flex items-center gap-2 mb-3">
        {/* Icône Microsoft */}
        <div className="h-5 w-5 grid grid-cols-2 gap-0.5">
          <div className="bg-[#F25022] rounded-sm"></div>
          <div className="bg-[#7FBA00] rounded-sm"></div>
          <div className="bg-[#00A4EF] rounded-sm"></div>
          <div className="bg-[#FFB900] rounded-sm"></div>
        </div>
        <span className="text-sm font-semibold text-[#0F172A]">Outlook / Microsoft 365</span>
      </div>

      {/* Message aucune boîte */}
      <div className="p-3 bg-white border border-[#E2E8F0] rounded-lg mb-3">
        <p className="text-xs font-medium text-[#475569]">Aucune boîte Outlook connectée</p>
        <p className="text-xs text-[#94A3B8] mt-0.5">
          Connectez Outlook pour activer la surveillance automatique
        </p>
      </div>

      {/* Bouton connecter */}
      <button className="flex items-center gap-2 px-3 py-2 bg-[#2563EB] text-white 
                         rounded-lg text-xs font-medium w-full justify-center 
                         hover:bg-[#1D4ED8] transition-all duration-200 mb-2">
        <ExternalLink className="h-3.5 w-3.5" />
        Connecter Outlook
      </button>

      {/* Note 1 clic */}
      <div className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg border border-amber-200">
        <span className="text-amber-500 text-xs">💡</span>
        <p className="text-xs text-amber-700">
          La connexion se fait en <strong>1 clic</strong> — aucun mot de passe à saisir.
        </p>
      </div>

    </div>

  </div>

</div>
```

---

### SECTION 5 — Filtres personnalisés

```jsx
<div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">

  <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center gap-3">
    <div className="p-2 bg-red-50 rounded-lg">
      <Filter className="h-4 w-4 text-red-600" />
    </div>
    <div>
      <h2 className="text-sm font-semibold text-[#0F172A]">Filtres personnalisés</h2>
      <p className="text-xs text-[#94A3B8]">
        Les emails dont l'expéditeur contient ces patterns seront ignorés automatiquement.
      </p>
    </div>
  </div>

  <div className="px-6 py-5">

    {/* Input + Bouton */}
    <div className="flex gap-3 mb-4">
      <input
        type="text"
        placeholder="ex: @spam.com ou mauvaisexp@"
        className="flex-1 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg 
                   text-sm text-[#0F172A] placeholder-[#CBD5E1]
                   focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 
                   focus:border-[#2563EB] focus:bg-white transition-all duration-200"
      />
      <button className="px-5 py-2.5 bg-[#2563EB] text-white text-sm font-medium rounded-lg 
                         hover:bg-[#1D4ED8] transition-all duration-200 whitespace-nowrap">
        + Ajouter
      </button>
    </div>

    {/* Empty state filtres */}
    <div className="flex items-center gap-2 py-4 text-center justify-center">
      <ShieldOff className="h-4 w-4 text-[#CBD5E1]" />
      <p className="text-sm text-[#94A3B8]">Aucun filtre configuré.</p>
    </div>

    {/* Si filtres présents, afficher comme chips : */}
    {/* 
    <div className="flex flex-wrap gap-2">
      {filters.map(filter => (
        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F1F5F9] 
                         border border-[#E2E8F0] rounded-full text-xs text-[#475569]">
          {filter}
          <X className="h-3 w-3 cursor-pointer hover:text-red-500 transition-colors" />
        </span>
      ))}
    </div>
    */}

  </div>

</div>
```

---

### Ajouter le lien "Mon Compte" dans la navigation Paramètres

En haut de la page Settings, ajouter des onglets de navigation :

```jsx
{/* Onglets de navigation Settings */}
<div className="flex gap-1 mb-6 bg-[#F1F5F9] p-1 rounded-lg w-fit">
  <button className="px-4 py-2 text-sm font-medium rounded-md bg-white shadow-sm 
                     text-[#0F172A] transition-all duration-200">
    Général
  </button>
  <button className="px-4 py-2 text-sm font-medium rounded-md text-[#475569] 
                     hover:text-[#0F172A] transition-all duration-200"
          onClick={() => navigate('/account')}>
    Mon Compte
  </button>
</div>
```

---

## MISSION 2 — CRÉATION PAGE MON COMPTE

### Créer le fichier `src/pages/MonCompte.jsx`

```jsx
import { useState } from 'react'
import { User, Mail, Shield, Key, Trash2, Camera, CheckCircle } from 'lucide-react'

export default function MonCompte() {
  // Récupérer les données utilisateur depuis le contexte existant (useAuth ou similaire)
  // NE PAS créer de nouveaux appels API — utilise les hooks existants
  
  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* --- SECTION PROFIL --- */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">

        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <User className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#0F172A]">Profil</h2>
            <p className="text-xs text-[#94A3B8]">Vos informations personnelles</p>
          </div>
        </div>

        <div className="px-6 py-5">

          {/* Avatar + infos */}
          <div className="flex items-center gap-5 mb-6">
            
            {/* Avatar */}
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#2563EB] to-[#0EA5A4] 
                              flex items-center justify-center text-white text-xl font-bold shadow-sm">
                A
                {/* Si photo dispo : <img src={user.photo} className="w-16 h-16 rounded-full object-cover" /> */}
              </div>
              <button className="absolute -bottom-1 -right-1 w-6 h-6 bg-white border border-[#E2E8F0] 
                                 rounded-full flex items-center justify-center shadow-sm
                                 hover:border-[#2563EB] transition-all duration-200">
                <Camera className="h-3 w-3 text-[#475569]" />
              </button>
            </div>

            <div>
              <p className="text-base font-semibold text-[#0F172A]">admin</p>
              <p className="text-sm text-[#94A3B8]">admin@cipherflow.com</p>
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-blue-50 
                               text-blue-700 text-xs font-medium rounded-full border border-blue-200">
                <CheckCircle className="h-3 w-3" />
                Compte vérifié
              </span>
            </div>
          </div>

          {/* Formulaire */}
          <div className="grid grid-cols-2 gap-4">

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-2 uppercase tracking-wide">
                Prénom
              </label>
              <input
                type="text"
                placeholder="Ex: Jérémy"
                className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg 
                           text-sm text-[#0F172A] placeholder-[#CBD5E1]
                           focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 
                           focus:border-[#2563EB] focus:bg-white transition-all duration-200"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-2 uppercase tracking-wide">
                Nom
              </label>
              <input
                type="text"
                placeholder="Ex: Lécert"
                className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg 
                           text-sm text-[#0F172A] placeholder-[#CBD5E1]
                           focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 
                           focus:border-[#2563EB] focus:bg-white transition-all duration-200"
              />
            </div>

          </div>

        </div>

        <div className="px-6 py-4 bg-[#F8FAFC] border-t border-[#E2E8F0] flex justify-end">
          <button className="px-4 py-2 bg-[#2563EB] text-white text-sm font-medium rounded-lg 
                             hover:bg-[#1D4ED8] transition-all duration-200">
            Enregistrer les modifications
          </button>
        </div>

      </div>

      {/* --- SECTION EMAIL & CONNEXION --- */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">

        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center gap-3">
          <div className="p-2 bg-teal-50 rounded-lg">
            <Mail className="h-4 w-4 text-teal-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#0F172A]">Email & Connexion</h2>
            <p className="text-xs text-[#94A3B8]">Méthode d'authentification utilisée</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-3">

          {/* Email principal */}
          <div className="flex items-center justify-between p-4 bg-[#F8FAFC] 
                          rounded-lg border border-[#E2E8F0]">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white border border-[#E2E8F0] rounded-lg">
                <Mail className="h-4 w-4 text-[#475569]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#0F172A]">admin@cipherflow.com</p>
                <p className="text-xs text-[#94A3B8]">Email principal du compte</p>
              </div>
            </div>
            <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs 
                             font-medium rounded-full border border-green-200">
              Vérifié
            </span>
          </div>

          {/* Google OAuth */}
          <div className="flex items-center justify-between p-4 bg-[#F8FAFC] 
                          rounded-lg border border-[#E2E8F0]">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white border border-[#E2E8F0] rounded-lg">
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-[#0F172A]">Google OAuth</p>
                <p className="text-xs text-[#94A3B8]">Connexion via votre compte Google</p>
              </div>
            </div>
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs 
                             font-medium rounded-full border border-blue-200">
              Actif
            </span>
          </div>

        </div>

      </div>

      {/* --- SECTION SÉCURITÉ --- */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">

        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center gap-3">
          <div className="p-2 bg-violet-50 rounded-lg">
            <Shield className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#0F172A]">Sécurité</h2>
            <p className="text-xs text-[#94A3B8]">Gérez l'accès à votre compte</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-3">

          {/* Sessions actives */}
          <div className="flex items-center justify-between p-4 bg-[#F8FAFC] 
                          rounded-lg border border-[#E2E8F0]">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white border border-[#E2E8F0] rounded-lg">
                <Key className="h-4 w-4 text-[#475569]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#0F172A]">Sessions actives</p>
                <p className="text-xs text-[#94A3B8]">1 session en cours</p>
              </div>
            </div>
            <button className="px-3 py-1.5 bg-white border border-[#E2E8F0] text-xs 
                               font-medium text-[#475569] rounded-lg
                               hover:border-[#2563EB] hover:text-[#2563EB] 
                               transition-all duration-200">
              Voir tout
            </button>
          </div>

          {/* Déconnexion de toutes les sessions */}
          <div className="flex items-center justify-between p-4 bg-[#F8FAFC] 
                          rounded-lg border border-[#E2E8F0]">
            <div>
              <p className="text-sm font-medium text-[#0F172A]">Se déconnecter de partout</p>
              <p className="text-xs text-[#94A3B8]">Révoque tous les tokens actifs</p>
            </div>
            <button className="px-3 py-1.5 bg-orange-50 border border-orange-200 
                               text-xs font-medium text-orange-600 rounded-lg
                               hover:bg-orange-100 transition-all duration-200">
              Déconnecter tout
            </button>
          </div>

        </div>

      </div>

      {/* --- SECTION DANGER ZONE --- */}
      <div className="bg-white border border-red-200 rounded-xl shadow-sm overflow-hidden">

        <div className="px-6 py-4 border-b border-red-100 flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded-lg">
            <Trash2 className="h-4 w-4 text-red-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-red-700">Zone de danger</h2>
            <p className="text-xs text-red-400">Actions irréversibles</p>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-center justify-between p-4 bg-red-50 
                          rounded-lg border border-red-200">
            <div>
              <p className="text-sm font-medium text-red-800">Supprimer mon compte</p>
              <p className="text-xs text-red-400 mt-0.5">
                Cette action est permanente et irréversible.
              </p>
            </div>
            <button className="px-4 py-2 bg-white border border-red-300 text-red-600 
                               text-sm font-medium rounded-lg
                               hover:bg-red-600 hover:text-white hover:border-red-600
                               transition-all duration-200">
              Supprimer
            </button>
          </div>
        </div>

      </div>

    </div>
  )
}
```

---

## MISSION 3 — ROUTING & NAVIGATION

### Ajouter la route dans `src/App.jsx` (ou le router existant)

```jsx
// Ajouter la route sans modifier les routes existantes :
import MonCompte from './pages/MonCompte'

// Dans le Switch/Routes existant, ajouter :
<Route path="/account" element={<MonCompte />} />
```

### Ajouter le lien dans `Sidebar.jsx`

```jsx
// Dans la section SYSTÈME (en dessous de Paramètres) :
{
  label: 'Mon Compte',
  path: '/account',
  icon: UserCircle,
}
```

---

## ORDRE D'EXÉCUTION

1. Refondre `Settings.jsx` — convertir toutes les cartes sombres en blanc
2. Créer `src/pages/MonCompte.jsx`
3. Ajouter la route `/account` dans le router existant
4. Ajouter le lien "Mon Compte" dans la Sidebar
5. Vérifier que l'OAuth et les appels API settings sont toujours fonctionnels

**RAPPEL : Ne jamais modifier le backend, les API calls, ni l'authentification OAuth.**
