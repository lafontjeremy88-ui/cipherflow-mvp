# CLAUDE CODE — FEATURE : RÉPONSE IA ÉDITABLE + BOUTON RÉGÉNÉRER
# CipherFlow — EmailHistory (frontend) + backend

---

## CONTEXTE

Dans la page "Historique des emails" (`/emails/history`), la réponse IA proposée
est actuellement affichée en texte statique non modifiable.

**Objectif :** Permettre à l'agent immobilier de :
1. **Modifier la réponse** directement dans un textarea avant envoi
2. **Régénérer** une nouvelle réponse IA s'il n'est pas satisfait

---

## RÈGLES ABSOLUES

❌ Ne modifie JAMAIS les endpoints existants (ne change pas leur signature)
❌ Ne modifie JAMAIS l'authentification OAuth
❌ Ne modifie JAMAIS la structure des tables existantes
✅ Tu peux ajouter un nouvel endpoint backend
✅ Tu peux modifier EmailHistory.jsx côté frontend

---

## ÉTAPE 1 — LIRE LE CODE EXISTANT

```bash
# Lire le composant EmailHistory frontend :
cat src/components/EmailHistory.jsx | head -100

# Trouver comment la réponse IA est actuellement affichée :
grep -n "reponse\|response\|proposee\|Envoyer\|reply" src/components/EmailHistory.jsx | head -20

# Trouver l'endpoint d'envoi de réponse existant côté backend :
grep -rn "send_reply\|send_response\|envoyer\|reply" --include="*.py" . | grep -v "__pycache__" | head -20

# Trouver comment la réponse IA est générée côté backend :
grep -rn "generate\|mistral\|gemini\|openai\|reponse_proposee\|suggested_reply" \
  --include="*.py" . | grep -v "__pycache__" | head -20
```

Lis entièrement EmailHistory.jsx et le fichier backend concerné avant de modifier.

---

## ÉTAPE 2 — BACKEND : AJOUTER L'ENDPOINT DE RÉGÉNÉRATION

Dans le fichier router backend qui gère les emails, ajoute cet endpoint.

**Avant d'écrire le code**, identifie :
```bash
# Le router emails existant :
grep -rn "@router\|APIRouter\|emails" --include="*.py" . | grep -v "__pycache__" | head -20

# La fonction qui génère la réponse IA actuelle (pour la réutiliser) :
grep -rn "def.*generat\|def.*reply\|def.*reponse" --include="*.py" . | grep -v "__pycache__"
```

**Ajoute l'endpoint de régénération** dans le router emails existant :

```python
@router.post("/emails/{email_id}/regenerate-reply")
async def regenerate_reply(
    email_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Régénère une nouvelle réponse IA pour un email donné.
    Réutilise la même logique de génération que lors du traitement initial.
    """
    # 1. Récupérer l'email depuis la DB (vérifie que ça appartient à l'agence)
    # Adapte le nom du modèle SQLAlchemy à celui utilisé dans le projet :
    email = await db.get(EmailModel, email_id)  # ← adapte EmailModel au vrai nom
    
    if not email:
        raise HTTPException(status_code=404, detail="Email non trouvé")
    
    if email.agency_id != current_user.agency_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # 2. Régénérer la réponse IA
    # Réutilise EXACTEMENT la même fonction que lors du traitement initial
    # Ne réécris pas la logique, appelle la fonction existante :
    new_reply = await generate_email_reply(  # ← adapte au vrai nom de la fonction
        subject=email.subject or "",
        body=email.body_text or email.body or "",
        sender=email.sender or ""
    )
    
    # 3. Mettre à jour en DB
    email.suggested_reply = new_reply  # ← adapte au vrai nom du champ
    await db.commit()
    await db.refresh(email)
    
    return {
        "email_id": email_id,
        "suggested_reply": new_reply
    }
```

**Important :** adapte les noms de modèles, champs et fonctions à ce qui existe
réellement dans le projet. Ne crée pas de nouveaux modèles.

---

## ÉTAPE 3 — FRONTEND : RENDRE LA RÉPONSE ÉDITABLE + BOUTON RÉGÉNÉRER

Dans `src/components/EmailHistory.jsx`, trouve la section qui affiche
la réponse proposée et remplace-la.

**Ajoute ces états** dans le composant (avec les useState existants) :

```jsx
// États pour la réponse éditable
const [editedReply, setEditedReply] = useState(null)      // null = on utilise la réponse originale
const [isRegenerating, setIsRegenerating] = useState(false)
const [regenError, setRegenError] = useState(null)

// Quand l'email sélectionné change, reset l'état édition
useEffect(() => {
  setEditedReply(null)
  setRegenError(null)
}, [selectedEmail?.id])  // adapte selectedEmail au nom de variable existant
```

**Ajoute la fonction de régénération** (avec les fonctions existantes) :

```jsx
const handleRegenerateReply = async () => {
  if (!selectedEmail?.id) return  // adapte au nom de variable existant
  
  setIsRegenerating(true)
  setRegenError(null)
  
  try {
    const token = getToken()  // adapte à la fonction d'auth existante dans le fichier
    
    const res = await fetch(
      `${API_BASE}/emails/${selectedEmail.id}/regenerate-reply`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    )
    
    if (!res.ok) throw new Error("Erreur régénération")
    
    const data = await res.json()
    setEditedReply(data.suggested_reply)
    
  } catch (err) {
    setRegenError("Impossible de régénérer la réponse. Réessaie.")
  } finally {
    setIsRegenerating(false)
  }
}
```

**Remplace l'affichage statique de la réponse** par ce bloc :

```jsx
{/* Zone réponse IA — éditable */}
<div className="mt-4">
  <div className="flex items-center justify-between mb-2">
    <span className="text-sm font-medium text-[#475569]">Réponse proposée</span>
    <button
      onClick={handleRegenerateReply}
      disabled={isRegenerating}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium 
                 text-[#2563EB] border border-[#2563EB]/30 rounded-lg
                 hover:bg-[#EFF6FF] transition-all duration-200
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isRegenerating ? (
        <>
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10"
              stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Génération...
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" 
               viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 4v6h6M23 20v-6h-6"/>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
          Régénérer
        </>
      )}
    </button>
  </div>

  {/* Erreur régénération */}
  {regenError && (
    <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 
                    rounded-lg text-xs text-red-600">
      {regenError}
    </div>
  )}

  {/* Textarea éditable */}
  <textarea
    value={editedReply ?? (selectedEmail?.suggested_reply || selectedEmail?.reponse_proposee || "")}
    onChange={(e) => setEditedReply(e.target.value)}
    rows={8}
    className="w-full px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg
               text-sm text-[#0F172A] leading-relaxed
               focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 
               focus:border-[#2563EB] focus:bg-white
               transition-all duration-200 resize-y"
    placeholder="La réponse IA apparaîtra ici..."
  />

  {/* Indicateur de modification */}
  {editedReply !== null && editedReply !== (selectedEmail?.suggested_reply || selectedEmail?.reponse_proposee) && (
    <p className="mt-1 text-xs text-[#94A3B8]">
      ✏️ Réponse modifiée — sera envoyée telle quelle
    </p>
  )}
</div>
```

**Modifie le bouton "Envoyer la réponse"** pour utiliser `editedReply` :

```jsx
// Trouve le bouton existant "Envoyer la réponse" et modifie la valeur envoyée :
// AVANT :
//   reply: selectedEmail.suggested_reply
// APRÈS :
//   reply: editedReply ?? selectedEmail.suggested_reply ?? selectedEmail.reponse_proposee

// Cherche dans le handler d'envoi existant la ligne qui construit le body de la requête
// et remplace uniquement la valeur du champ reply/réponse.
```

---

## ÉTAPE 4 — VÉRIFICATION

```bash
# Backend — vérifier syntaxe :
python -m py_compile <fichier_router_modifié.py> && echo "✅ OK"

# Backend — vérifier que le nouvel endpoint apparaît dans les routes :
grep -n "regenerate-reply\|regenerate_reply" --include="*.py" -r . | grep -v "__pycache__"

# Frontend — vérifier qu'il n'y a pas d'erreur de compilation :
npm run build

# Frontend — vérifier que editedReply est bien utilisé dans le handler d'envoi :
grep -n "editedReply" src/components/EmailHistory.jsx
```

---

## COMMIT

```bash
git add .
git commit -m "feat(emails): réponse IA éditable + bouton régénérer | Option C"
git push origin master
```

---

## RÉSULTAT ATTENDU

Dans l'interface "Historique des emails" :

```
┌─────────────────────────────────────────────────┐
│ Réponse proposée              [↺ Régénérer]     │
│ ┌─────────────────────────────────────────────┐ │
│ │ Bonjour Monsieur Durand,                    │ │
│ │                                             │ │
│ │ Nous vous remercions pour votre email...    │ │
│ │                              [modifiable]   │ │
│ └─────────────────────────────────────────────┘ │
│ ✏️ Réponse modifiée — sera envoyée telle quelle  │
│                                                 │
│         [Envoyer la réponse]                    │
└─────────────────────────────────────────────────┘
```
