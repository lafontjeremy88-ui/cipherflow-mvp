# CLAUDE CODE — AMÉLIORATIONS DASHBOARD CIPHERFLOW

> Colle ce prompt dans Claude Code depuis la racine du projet frontend.

---

## RÈGLES ABSOLUES

❌ Ne modifie JAMAIS les fichiers backend
❌ Ne modifie JAMAIS les appels API existants
❌ Ne modifie JAMAIS l'authentification Google OAuth
✅ Modifie uniquement Dashboard.jsx et EmailsChart.jsx

---

## MISSION 1 — VRAIES DATES SUR LE GRAPHIQUE

### Localise le composant graphique
```bash
grep -r "EmailsChart\|AreaChart\|recharts" src/ --include="*.jsx" -l
```

### Dans `src/components/charts/EmailsChart.jsx`

**Problème :** Les axes X affichent "J1, J2..." au lieu de vraies dates.

**Fix — générer les vraies dates dynamiquement :**

```jsx
// Remplace la génération de données mockées par :

// Pour le mode "Semaine" — 7 derniers jours avec vrais noms
const getWeekData = () => {
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const label = `${days[d.getDay()]} ${d.getDate()}`
    return { name: label, value: Math.floor(Math.random() * 15) + 2 }
  })
}

// Pour le mode "Mois" — 30 derniers jours avec dates courtes
const getMonthData = () => {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    const label = `${d.getDate()}/${d.getMonth() + 1}`
    return { name: label, value: Math.floor(Math.random() * 18) + 1 }
  })
}
```

**Améliorer l'axe X pour ne pas surcharger :**

```jsx
// Dans le composant recharts, sur l'axe X :
<XAxis
  dataKey="name"
  tick={{ fontSize: 11, fill: '#94A3B8' }}
  tickLine={false}
  axisLine={false}
  // Pour le mois, n'afficher qu'1 tick sur 5 pour éviter la surcharge :
  interval={period === 'month' ? 4 : 0}
/>
```

**Tooltip personnalisé avec vraie date :**

```jsx
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'white',
        border: '1px solid #E2E8F0',
        borderRadius: '8px',
        padding: '10px 14px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        fontSize: '13px'
      }}>
        <p style={{ color: '#94A3B8', marginBottom: '4px', fontWeight: 500 }}>{label}</p>
        <p style={{ color: '#0F172A', fontWeight: 700 }}>
          {payload[0].value} email{payload[0].value > 1 ? 's' : ''} traité{payload[0].value > 1 ? 's' : ''}
        </p>
      </div>
    )
  }
  return null
}
```

---

## MISSION 2 — CORRIGER "DOCUMENTS VÉRIFIÉS" (tiret au lieu d'un chiffre)

### Dans `src/pages/Dashboard.jsx`

Cherche la StatCard "Documents vérifiés" et protège la valeur null :

```jsx
// AVANT (plante si null/undefined) :
value={stats?.documents_verified}

// APRÈS (fallback propre) :
value={stats?.documents_verified ?? 0}

// Même chose pour toutes les StatCards :
value={stats?.emails_analyzed ?? 0}
value={stats?.active_tenant_files ?? 0}
value={stats?.incomplete_alerts ?? 0}
```

---

## MISSION 3 — GREETING AVEC DATE DU JOUR

### En haut du contenu du Dashboard, avant les StatCards, ajouter :

```jsx
// Composant greeting à ajouter dans Dashboard.jsx

const DashboardGreeting = ({ userName }) => {
  const now = new Date()

  // Heure de la journée
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'

  // Date formatée en français
  const dateStr = now.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  // Capitalise la première lettre
  const dateFormatted = dateStr.charAt(0).toUpperCase() + dateStr.slice(1)

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-xl font-semibold text-[#0F172A]">
          {greeting}{userName ? `, ${userName}` : ''} 👋
        </h2>
        <p className="text-sm text-[#94A3B8] mt-0.5">{dateFormatted}</p>
      </div>
      {/* Indicateur temps réel */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span className="text-xs font-medium text-green-700">Surveillance active</span>
      </div>
    </div>
  )
}
```

**Intégration dans le JSX du Dashboard :**
```jsx
// Ajoute juste avant la grille de StatCards :
<DashboardGreeting userName="Jérémy" />
// ou si tu as le nom depuis le contexte auth :
<DashboardGreeting userName={user?.name || user?.email?.split('@')[0]} />
```

---

## MISSION 4 — AMÉLIORER LES STATCARDS

### Corriger l'ordre visuel (valeur d'abord, label ensuite)

Dans `src/components/ui/StatCard.jsx`, restructure le JSX :

```jsx
// Structure recommandée :
<div className="bg-white border border-[#E2E8F0] rounded-xl p-5 
                hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">

  {/* Ligne du haut : label + icône */}
  <div className="flex items-center justify-between mb-3">
    <span className="text-sm font-medium text-[#475569]">{label}</span>
    <div className={`p-2 rounded-lg ${iconBgClass}`}>
      <Icon className={`h-4 w-4 ${iconColorClass}`} />
    </div>
  </div>

  {/* Valeur principale */}
  <div className="text-3xl font-bold text-[#0F172A] mb-1">
    {value ?? 0}
  </div>

  {/* Sous-label */}
  <div className="text-xs text-[#94A3B8]">{sublabel}</div>

</div>
```

---

## MISSION 5 — AMÉLIORER L'ACTIVITÉ RÉCENTE

### Dans `src/pages/Dashboard.jsx`, section "Activité récente"

Améliorer l'affichage quand il y a peu d'entrées :

```jsx
// Si 1 seule entrée, afficher quand même une structure propre
// Ajouter un séparateur de date "Aujourd'hui"

<div className="bg-white border border-[#E2E8F0] rounded-xl p-5">

  {/* Header */}
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-sm font-semibold text-[#0F172A]">Activité récente</h3>
    <button className="text-xs text-[#2563EB] hover:underline font-medium">
      Voir tout
    </button>
  </div>

  {/* Label de date */}
  <div className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">
    Aujourd'hui
  </div>

  {/* Liste des activités */}
  {activities.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-10 h-10 bg-[#F1F5F9] rounded-xl flex items-center justify-center mb-3">
        <Activity className="h-5 w-5 text-[#CBD5E1]" />
      </div>
      <p className="text-sm text-[#94A3B8]">Aucune activité pour l'instant</p>
      <p className="text-xs text-[#CBD5E1] mt-1">Les événements apparaîtront ici</p>
    </div>
  ) : (
    activities.map((item, index) => (
      <ActivityItem key={index} {...item} />
    ))
  )}

</div>
```

---

## MISSION 6 — AJOUTER UNE LÉGENDE AU DONUT "RÉPARTITION"

### Dans `src/pages/Dashboard.jsx`, section donut chart

```jsx
// Ajouter une légende sous le donut :
const COLORS = ['#2563EB', '#0EA5A4', '#22C55E', '#F59E0B', '#EF4444']

// Dans le rendu :
<div className="flex flex-wrap gap-2 mt-4 justify-center">
  {data.map((entry, index) => (
    <div key={entry.name} className="flex items-center gap-1.5">
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
           style={{ background: COLORS[index % COLORS.length] }}></div>
      <span className="text-xs text-[#475569]">{entry.name}</span>
      <span className="text-xs font-semibold text-[#0F172A]">{entry.value}</span>
    </div>
  ))}
</div>
```

---

## RÉSUMÉ DES MODIFICATIONS

| Mission | Fichier | Impact |
|---------|---------|--------|
| Vraies dates graphique | EmailsChart.jsx | ✅ UX critique |
| Fix valeur null | Dashboard.jsx | ✅ Bug fix |
| Greeting + date | Dashboard.jsx | 🟠 Polish |
| StatCards hiérarchie | StatCard.jsx | 🟠 Design |
| Activité récente | Dashboard.jsx | 🟡 UX |
| Légende donut | Dashboard.jsx | 🟡 Lisibilité |

## ORDRE D'EXÉCUTION

1. EmailsChart.jsx — vraies dates + tooltip
2. Dashboard.jsx — fix null values
3. Dashboard.jsx — greeting component
4. StatCard.jsx — restructure visuelle
5. Dashboard.jsx — activité récente + donut légende

**RAPPEL : Ne jamais modifier le backend, les API calls, ni l'authentification OAuth.**
