# CLAUDE CODE — FIX WATCHER : BYPASS MISTRAL POUR PJ ÉVIDENTES

> Colle ce prompt dans Claude Code depuis la racine du projet backend.

---

## CONTEXTE

Les logs Railway montrent que des emails avec uniquement une pièce jointe
(sans sujet, sans corps) sont rejetés par Mistral qui répond NON car il
n'a aucun contexte textuel à analyser.

Exemples réels :
- `cni1.bin.pdf` → Mistral='NON' → ❌ IGNORE  ← BUG
- `1000062244.jpg` → Mistral='NON' → ❌ IGNORE  ← potentiellement OK

**Fix ciblé :** Ajouter un bypass rule-based AVANT l'appel Mistral.
Si le nom de la PJ contient un mot-clé documentaire évident → traiter
directement, sans appeler Mistral.

---

## RÈGLES ABSOLUES

❌ Ne modifie JAMAIS les routes FastAPI
❌ Ne modifie JAMAIS l'authentification OAuth
❌ Ne modifie JAMAIS la base de données
✅ Modifie uniquement la logique de classification dans le watcher

---

## ÉTAPE 1 — LIRE LE CODE EXISTANT

```bash
# Trouver le fichier principal du watcher :
grep -rn "process_full\|has_attachments\|Décision\|IGNORE\|ACCEPT" \
  --include="*.py" . | grep -v "__pycache__" | head -20

# Lire la fonction qui appelle Mistral :
grep -rn "mistral\|is_tenant\|classify" \
  --include="*.py" . | grep -v "__pycache__" | head -20
```

Lis entièrement le(s) fichier(s) trouvé(s) avant de modifier quoi que ce soit.

---

## ÉTAPE 2 — AJOUTER LA FONCTION DE BYPASS

Dans le fichier watcher principal, ajoute cette fonction **avec les imports nécessaires** :

```python
import re

def is_obvious_tenant_document(attachments: list) -> bool:
    """
    Détecte les documents locataires évidents via le nom des pièces jointes.
    Si True → bypass Mistral (plus rapide, RGPD-safe car 0 donnée envoyée à l'extérieur).
    """
    BYPASS_KEYWORDS = [
        "cni", "carte_identite", "carte_national", "identite",
        "passeport", "passport",
        "fiche_paie", "fiche_de_paie", "bulletin_salaire", "bulletin_paie",
        "salaire", "revenus",
        "rib", "releve_identite_bancaire",
        "kbis",
        "avis_imposition", "avis_impots",
        "quittance", "quittance_loyer",
        "contrat_travail", "contrat_de_travail",
        "titre_sejour", "visa",
        "bail", "contrat_location"
    ]

    if not attachments:
        return False

    for att in attachments:
        # Compatibilité objet ou dict
        filename = (
            getattr(att, 'filename', None)
            or (att.get('filename') if isinstance(att, dict) else None)
            or ""
        )

        # Normaliser : minuscules + remplacer séparateurs par underscore
        normalized = filename.lower()
        normalized = re.sub(r'[\s\-\.]', '_', normalized)
        # Version sans extension pour la comparaison
        normalized_no_ext = re.sub(r'_[a-z0-9]{2,4}$', '', normalized)

        for keyword in BYPASS_KEYWORDS:
            if keyword in normalized or keyword in normalized_no_ext:
                return True

    return False
```

---

## ÉTAPE 3 — INTÉGRER LE BYPASS DANS LE PIPELINE

Trouve l'endroit exact où Mistral est appelé pour classifier l'email.
Il ressemble à quelque chose comme :

```python
# Avant (code actuel, approximatif) :
reponse_mistral = appel_mistral(sujet, corps)
if reponse_mistral == "OUI":
    traiter_email(...)
else:
    ignorer(...)
```

**Ajoute le bypass juste avant cet appel Mistral :**

```python
# BYPASS rule-based — avant l'appel Mistral
if attachments and is_obvious_tenant_document(attachments):
    filenames = [
        getattr(a, 'filename', None) or a.get('filename', '?')
        for a in attachments
    ]
    logger.info(
        f"✅ BYPASS Mistral (nom PJ évident) — "
        f"fichiers={filenames} | agency={agency_id}"
    )
    # → appelle ici la même fonction que quand Mistral répond OUI
    # (copie exacte du bloc "if reponse_mistral == 'OUI'")
    ...
    return  # ne pas continuer vers Mistral

# Appel Mistral normal (inchangé) :
reponse_mistral = appel_mistral(sujet, corps)
...
```

**Important :** le bloc après le bypass doit être identique au traitement
déclenché quand Mistral répond OUI. Ne réécris pas la logique de traitement,
copie-la simplement.

---

## ÉTAPE 4 — VÉRIFICATION

```bash
# Vérifier la syntaxe Python :
python -m py_compile <fichier_modifié.py> && echo "✅ OK"

# Vérifier que is_obvious_tenant_document est bien appelée :
grep -n "is_obvious_tenant_document" --include="*.py" -r . | grep -v "__pycache__"

# Vérifier qu'il n'y a pas de doublon import re :
grep -n "^import re" <fichier_modifié.py>
```

---

## ÉTAPE 5 — TEST RAPIDE

Ajoute ce bloc temporaire en bas du fichier pour valider la logique :

```python
if __name__ == "__main__":
    class FakeAtt:
        def __init__(self, f): self.filename = f

    tests = [
        ([FakeAtt("cni1.bin.pdf")],          True),   # ✅ doit bypasser
        ([FakeAtt("fiche_paie_2024.pdf")],   True),   # ✅ doit bypasser
        ([FakeAtt("passeport_scan.jpg")],    True),   # ✅ doit bypasser
        ([FakeAtt("1000062244.jpg")],         False),  # ❌ image générique → Mistral
        ([FakeAtt("facture_edf.pdf")],        False),  # ❌ pas un doc locataire
        ([],                                  False),  # ❌ pas de PJ
    ]

    print("=== Test bypass is_obvious_tenant_document ===")
    all_ok = True
    for atts, expected in tests:
        result = is_obvious_tenant_document(atts)
        ok = result == expected
        icon = "✅" if ok else "❌ ERREUR"
        names = [a.filename for a in atts] or ["(vide)"]
        print(f"  {icon} {names} → bypass={result} (attendu={expected})")
        if not ok:
            all_ok = False

    print(f"\n{'✅ Tous les tests OK' if all_ok else '❌ Des tests ont échoué'}")
```

Lance :
```bash
python <fichier_modifié.py>
```

Tous les tests doivent passer avant de déployer.

---

## COMMIT

```bash
git add .
git commit -m "fix(watcher): bypass Mistral pour PJ avec nom documentaire évident (cni, fiche_paie, etc.)"
git push origin master
```

Puis vérifie dans les logs Railway qu'un email avec `cni*.pdf` affiche bien :
```
✅ BYPASS Mistral (nom PJ évident) — fichiers=['cni1.bin.pdf'] | agency=23
```
au lieu de :
```
[ia] Mistral réponse='NON' → ❌ IGNORE
```
