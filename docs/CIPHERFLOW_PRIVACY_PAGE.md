# CLAUDE CODE — REMPLACEMENT PAGE POLITIQUE DE CONFIDENTIALITÉ

> Colle ce prompt dans Claude Code depuis la racine du projet frontend.

---

## RÈGLES ABSOLUES

❌ Ne modifie JAMAIS les fichiers backend
❌ Ne modifie JAMAIS les appels API existants
❌ Ne modifie JAMAIS l'authentification Google OAuth
✅ Modifie uniquement les fichiers frontend liés à la page privacy/confidentialité

---

## ÉTAPE 1 — LOCALISE LA PAGE ACTUELLE

Cherche le fichier de la page politique de confidentialité dans ces emplacements :

```
src/pages/Privacy.jsx
src/pages/Confidentialite.jsx
src/pages/PrivacyPolicy.jsx
public/privacy.html
src/components/Privacy.jsx
```

Lance cette commande pour trouver le bon fichier :
```bash
grep -r "confidentialité\|privacy\|politique" src/ --include="*.jsx" --include="*.tsx" -l
grep -r "confidentialité\|privacy\|politique" public/ -l 2>/dev/null
```

---

## ÉTAPE 2 — REMPLACE LE CONTENU

Selon ce que tu trouves :

### CAS A — C'est un fichier `.jsx` / `.tsx` (composant React)

Remplace **tout le contenu** du fichier par ce composant React :

```jsx
import { useEffect } from 'react'

export default function Privacy() {

  useEffect(() => {
    document.title = 'Politique de confidentialité — CipherFlow'
  }, [])

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: '#F8FAFC', minHeight: '100vh', color: '#0F172A' }}>

      {/* STYLES INLINE */}
      <style>{`
        .priv-hero { background: white; border-bottom: 1px solid #E2E8F0; padding: 60px 2rem 50px; text-align: center; }
        .priv-hero h1 { font-size: 32px; font-weight: 700; color: #0F172A; margin-bottom: 12px; letter-spacing: -0.5px; }
        .priv-hero p { font-size: 15px; color: #475569; max-width: 520px; margin: 0 auto 24px; }
        .priv-tag { display: inline-flex; align-items: center; gap: 6px; padding: 5px 14px; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 20px; font-size: 12px; font-weight: 600; color: #2563EB; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.05em; }
        .priv-meta { display: flex; align-items: center; justify-content: center; gap: 20px; flex-wrap: wrap; }
        .priv-meta-item { font-size: 12px; color: #94A3B8; }
        .priv-container { max-width: 860px; margin: 0 auto; padding: 48px 24px 80px; display: grid; grid-template-columns: 220px 1fr; gap: 40px; align-items: start; }
        .priv-toc { position: sticky; top: 88px; }
        .priv-toc-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94A3B8; margin-bottom: 12px; }
        .priv-toc a { display: block; padding: 6px 10px; border-radius: 6px; font-size: 13px; color: #475569; text-decoration: none; transition: all 0.15s ease; border-left: 2px solid transparent; margin-bottom: 2px; }
        .priv-toc a:hover { background: white; color: #2563EB; border-left-color: #2563EB; }
        .priv-section { background: white; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; margin-bottom: 20px; transition: box-shadow 0.2s ease; }
        .priv-section:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
        .priv-section-header { padding: 18px 24px; border-bottom: 1px solid #E2E8F0; display: flex; align-items: flex-start; gap: 14px; }
        .priv-section-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 18px; }
        .priv-section-title { font-size: 15px; font-weight: 600; color: #0F172A; margin-bottom: 2px; }
        .priv-section-sub { font-size: 12px; color: #94A3B8; }
        .priv-body { padding: 20px 24px; }
        .priv-body p { font-size: 14px; color: #475569; margin-bottom: 12px; line-height: 1.7; }
        .priv-body p:last-child { margin-bottom: 0; }
        .priv-tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
        .tag { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; border: 1px solid; }
        .tag-blue { background: #EFF6FF; color: #2563EB; border-color: #BFDBFE; }
        .tag-teal { background: #F0FDFA; color: #0F766E; border-color: #99F6E4; }
        .tag-gray { background: #F8FAFC; color: #475569; border-color: #E2E8F0; }
        .priv-alert { display: flex; gap: 12px; padding: 14px 16px; border-radius: 8px; border: 1px solid; margin: 12px 0; font-size: 13px; line-height: 1.6; }
        .alert-blue { background: #EFF6FF; border-color: #BFDBFE; color: #1E40AF; }
        .alert-green { background: #F0FDF4; border-color: #BBF7D0; color: #166534; }
        .alert-amber { background: #FFFBEB; border-color: #FDE68A; color: #92400E; }
        .alert-red { background: #FEF2F2; border-color: #FECACA; color: #991B1B; }
        .priv-list { list-style: none; padding: 0; margin: 12px 0; }
        .priv-list li { display: flex; align-items: flex-start; gap: 10px; font-size: 13.5px; color: #475569; padding: 5px 0; border-bottom: 1px solid #F8FAFC; line-height: 1.6; }
        .priv-list li:last-child { border-bottom: none; }
        .list-check { color: #22C55E; flex-shrink: 0; margin-top: 2px; }
        .list-dot { width: 6px; height: 6px; background: #2563EB; border-radius: 50%; flex-shrink: 0; margin-top: 7px; }
        .rights-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0; }
        .right-card { padding: 12px 14px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; }
        .right-card-title { font-size: 12px; font-weight: 600; color: #0F172A; margin-bottom: 3px; }
        .right-card-desc { font-size: 11px; color: #94A3B8; }
        .security-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0; }
        .security-item { display: flex; align-items: flex-start; gap: 10px; padding: 12px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 13px; color: #475569; }
        .retention-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; }
        .retention-table th { text-align: left; padding: 10px 14px; background: #F8FAFC; color: #94A3B8; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E2E8F0; }
        .retention-table td { padding: 12px 14px; color: #475569; border-bottom: 1px solid #F1F5F9; vertical-align: top; }
        .retention-table tr:last-child td { border-bottom: none; }
        .retention-table td:first-child { font-weight: 500; color: #0F172A; }
        .duration-badge { display: inline-flex; padding: 2px 8px; background: #EFF6FF; color: #2563EB; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .contact-card { display: flex; align-items: center; gap: 12px; padding: 14px 18px; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px; margin-top: 12px; }
        .contact-card a { color: #2563EB; font-size: 14px; font-weight: 600; text-decoration: none; }
        .contact-card a:hover { text-decoration: underline; }
        .section-label { font-weight: 600; color: #0F172A; margin-top: 16px; margin-bottom: 6px; font-size: 13px; }
        @media (max-width: 700px) {
          .priv-container { grid-template-columns: 1fr !important; }
          .priv-toc { display: none !important; }
          .rights-grid, .security-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* HERO */}
      <div className="priv-hero">
        <div className="priv-tag">📄 Document légal</div>
        <h1>Politique de confidentialité</h1>
        <p>Comment CipherFlow collecte, traite et protège vos données personnelles, conformément au RGPD.</p>
        <div className="priv-meta">
          <span className="priv-meta-item">📅 Dernière mise à jour : 1 février 2026</span>
          <span className="priv-meta-item">🔒 Données chiffrées & isolées par agence</span>
          <span className="priv-meta-item">📋 13 articles</span>
        </div>
      </div>

      {/* LAYOUT */}
      <div className="priv-container">

        {/* SOMMAIRE */}
        <nav className="priv-toc">
          <div className="priv-toc-title">Sommaire</div>
          {[
            ['#s1','1. Qui sommes-nous ?'],['#s2','2. Données traitées'],
            ['#s3','3. Finalités'],['#s4','4. Base légale'],
            ['#s5','5. Intelligence artificielle'],['#s6','6. Sécurité'],
            ['#s7','7. Durée de conservation'],['#s8','8. Vos droits'],
            ['#s9','9. Droit à l\'oubli'],['#s10','10. Sous-traitants'],
            ['#s11','11. Transferts hors UE'],['#s12','12. Évolutions'],
            ['#s13','13. Contact'],
          ].map(([href, label]) => (
            <a key={href} href={href}>{label}</a>
          ))}
        </nav>

        {/* CONTENU */}
        <main>

          {/* 1 */}
          <div className="priv-section" id="s1">
            <div className="priv-section-header">
              <div className="priv-section-icon" style={{background:'#EFF6FF'}}>🏢</div>
              <div><div className="priv-section-title">1. Qui sommes-nous ?</div><div className="priv-section-sub">Responsable de traitement & sous-traitant</div></div>
            </div>
            <div className="priv-body">
              <p>CipherFlow est une solution SaaS d'automatisation et d'assistance à la gestion administrative et locative, destinée aux syndics de copropriété, agences immobilières et gestionnaires de biens.</p>
              <div className="priv-alert alert-blue"><span>ℹ️</span><div><strong>Responsable de traitement</strong> : pour les données des utilisateurs professionnels, CipherFlow agit en qualité de responsable de traitement.</div></div>
              <div className="priv-alert alert-green"><span>🤝</span><div><strong>Sous-traitant (art. 28 RGPD)</strong> : pour les données des locataires ou copropriétaires introduites par les agences, CipherFlow agit en sous-traitant, uniquement sur instruction du responsable de traitement.</div></div>
            </div>
          </div>

          {/* 2 */}
          <div className="priv-section" id="s2">
            <div className="priv-section-header">
              <div className="priv-section-icon" style={{background:'#F0FDFA'}}>🗂️</div>
              <div><div className="priv-section-title">2. Quelles données sont traitées ?</div><div className="priv-section-sub">Uniquement des données initiées par les utilisateurs</div></div>
            </div>
            <div className="priv-body">
              <p>CipherFlow ne collecte ni n'introduit de données de sa propre initiative. Toutes les données proviennent d'actions explicites des utilisateurs.</p>
              <p className="section-label">👤 Utilisateurs professionnels</p>
              <div className="priv-tags">
                {['Email professionnel','Nom / Prénom (optionnels)','Paramètres de compte','Préférences d\'interface','Journaux de connexion'].map(t => <span key={t} className="tag tag-blue">{t}</span>)}
              </div>
              <p className="section-label">🏠 Gestion locative</p>
              <div className="priv-tags">
                {['Emails reçus & envoyés','Bulletins de paie','Avis d\'imposition','Pièces d\'identité','Quittances & factures','Données extraites des documents'].map(t => <span key={t} className="tag tag-teal">{t}</span>)}
              </div>
              <p className="section-label">⚙️ Données techniques</p>
              <div className="priv-tags">
                {['Identifiants internes','Horodatages','Journaux techniques'].map(t => <span key={t} className="tag tag-gray">{t}</span>)}
              </div>
              <div className="priv-alert alert-amber"><span>⚠️</span><div>La plateforme n'a pas vocation à traiter des données de santé ni des données de mineurs. Si de telles données sont introduites par une agence, celle-ci en reste seule responsable.</div></div>
            </div>
          </div>

          {/* 3 */}
          <div className="priv-section" id="s3">
            <div className="priv-section-header">
              <div className="priv-section-icon" style={{background:'#F5F3FF'}}>🎯</div>
              <div><div className="priv-section-title">3. Finalités du traitement</div><div className="priv-section-sub">Pourquoi vos données sont utilisées</div></div>
            </div>
            <div className="priv-body">
              <ul className="priv-list">
                {['Automatisation du traitement et de la priorisation des emails entrants','Analyse et classification des documents liés à la gestion locative','Constitution, suivi et mise à jour des dossiers locataires','Génération de réponses assistées et propositions de messages','Génération de factures, quittances et documents administratifs','Sécurisation des échanges et traçabilité administrative','Gestion des comptes utilisateurs et authentification','Support et amélioration continue du service'].map(item => (
                  <li key={item}><span className="list-check">✓</span>{item}</li>
                ))}
              </ul>
              <div className="priv-alert alert-green"><span>🚫</span><div><strong>Aucune utilisation commerciale externe.</strong> Les données ne sont jamais revendues ni utilisées à des fins publicitaires.</div></div>
            </div>
          </div>

          {/* 4 */}
          <div className="priv-section" id="s4">
            <div className="priv-section-header">
              <div className="priv-section-icon" style={{background:'#FFF7ED'}}>⚖️</div>
              <div><div className="priv-section-title">4. Base légale du traitement</div><div className="priv-section-sub">Fondements juridiques au sens du RGPD</div></div>
            </div>
            <div className="priv-body">
              <ul className="priv-list">
                <li><span className="list-dot"></span>Exécution d'un contrat : fourniture du service CipherFlow aux agences clientes et gestion des comptes utilisateurs.</li>
                <li><span className="list-dot"></span>Intérêt légitime des responsables de traitement pour organiser, suivre et sécuriser leur gestion locative et administrative.</li>
                <li><span className="list-dot"></span>Le cas échéant, respect d'obligations légales liées à la gestion administrative et comptable.</li>
              </ul>
            </div>
          </div>

          {/* 5 */}
          <div className="priv-section" id="s5">
            <div className="priv-section-header">
              <div className="priv-section-icon" style={{background:'#F0FDFA'}}>🤖</div>
              <div><div className="priv-section-title">5. Intelligence artificielle</div><div className="priv-section-sub">Utilisation de l'IA dans le traitement des données</div></div>
            </div>
            <div className="priv-body">
              <p>CipherFlow utilise des services d'intelligence artificielle (ex. : Google Gemini) afin d'analyser le contenu des emails, extraire des informations depuis des documents et assister la rédaction de réponses.</p>
              <ul className="priv-list">
                <li><span className="list-check">✓</span>Données transmises à l'IA uniquement dans la mesure nécessaire à la demande</li>
                <li><span className="list-check">✓</span>CipherFlow n'utilise pas ces données pour entraîner ses propres modèles d'IA</li>
                <li><span className="list-check">✓</span>Données jamais revendues ni utilisées à des fins publicitaires</li>
                <li><span className="list-check">✓</span>Fichiers stockés temporairement en clair uniquement le temps de l'analyse</li>
              </ul>
            </div>
          </div>

          {/* 6 */}
          <div className="priv-section" id="s6">
            <div className="priv-section-header">
              <div className="priv-section-icon" style={{background:'#F0FDF4'}}>🔒</div>
              <div><div className="priv-section-title">6. Sécurité des données</div><div className="priv-section-sub">Mesures techniques et organisationnelles</div></div>
            </div>
            <div className="priv-body">
              <div className="security-grid">
                {[['🔐','Chiffrement des fichiers stockés sur disque'],['🌐','Communications HTTPS/TLS chiffrées'],['🎫','Tokens JWT courte durée + cookies HttpOnly'],['🏢','Isolation stricte des données par agence'],['🗑️','Suppression des fichiers temporaires en clair'],['👥','Contrôle d\'accès par rôle (RBAC)'],['📋','Journalisation des actions sensibles'],['🔄','Mise à jour régulière des dépendances']].map(([icon, text]) => (
                  <div key={text} className="security-item"><span style={{fontSize:'18px'}}>{icon}</span><span>{text}</span></div>
                ))}
              </div>
            </div>
          </div>

          {/* 7 */}
          <div className="priv-section" id="s7">
            <div className="priv-section-header">
              <div className="priv-section-icon" style={{background:'#FFFBEB'}}>⏱️</div>
              <div><div className="priv-section-title">7. Durée de conservation</div><div className="priv-section-sub">Politiques de rétention configurables par agence</div></div>
            </div>
            <div className="priv-body">
              <table className="retention-table">
                <thead><tr><th>Type de donnée</th><th>Durée par défaut</th><th>Traitement</th></tr></thead>
                <tbody>
                  {[['Emails analysés','12 mois','Supprimés à expiration'],['Pièces jointes & analyses','12 mois','Fichiers et analyses supprimés'],['Dossiers locataires clôturés','5 ans max','Anonymisation après clôture'],['Comptes utilisateurs','Durée du contrat','Suppression ou anonymisation à résiliation']].map(([type, duree, traitement]) => (
                    <tr key={type}><td>{type}</td><td><span className="duration-badge">{duree}</span></td><td>{traitement}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 8 */}
          <div className="priv-section" id="s8">
            <div className="priv-section-header">
              <div className="priv-section-icon" style={{background:'#EFF6FF'}}>⚡</div>
              <div><div className="priv-section-title">8. Vos droits (RGPD)</div><div className="priv-section-sub">Les droits dont vous disposez sur vos données</div></div>
            </div>
            <div className="priv-body">
              <div className="rights-grid">
                {[['👁️','Droit d\'accès','Obtenir une copie de vos données traitées'],['✏️','Droit de rectification','Corriger des données inexactes ou incomplètes'],['🗑️','Droit à l\'effacement','Demander la suppression de vos données'],['⏸️','Droit à la limitation','Limiter temporairement le traitement'],['🚫','Droit d\'opposition','Vous opposer à certains traitements'],['📦','Droit à la portabilité','Récupérer vos données dans un format structuré']].map(([icon, title, desc]) => (
                  <div key={title} className="right-card"><div className="right-card-title">{icon} {title}</div><div className="right-card-desc">{desc}</div></div>
                ))}
              </div>
              <div className="priv-alert alert-blue"><span>ℹ️</span><div>Pour les données de gestion locative, ces droits doivent être exercés <strong>en priorité auprès de votre agence</strong>, qui reste votre interlocuteur principal.</div></div>
            </div>
          </div>

          {/* 9 */}
          <div className="priv-section" id="s9">
            <div className="priv-section-header">
              <div className="priv-section-icon" style={{background:'#FEF2F2'}}>🗑️</div>
              <div><div className="priv-section-title">9. Suppression & droit à l'oubli</div><div className="priv-section-sub">Effacement complet et irréversible</div></div>
            </div>
            <div className="priv-body">
              <p>CipherFlow permet la suppression complète d'un utilisateur et, lorsque les conditions sont réunies, la purge intégrale d'une agence (dossiers, emails analysés, documents chiffrés, factures, liens associés).</p>
              <div className="priv-alert alert-red"><span>⚠️</span><div>Ces opérations entraînent un <strong>effacement définitif et irréversible</strong> des données, sous réserve des obligations légales de conservation de l'agence responsable de traitement.</div></div>
            </div>
          </div>

          {/* 10 */}
          <div className="priv-section" id="s10">
            <div className="priv-section-header">
              <div className="priv-section-icon" style={{background:'#F5F3FF'}}>🔗</div>
              <div><div className="priv-section-title">10. Sous-traitants & hébergement</div><div className="priv-section-sub">Prestataires techniques encadrés contractuellement</div></div>
            </div>
            <div className="priv-body">
              <p>Pour fournir le service, CipherFlow peut faire appel à des prestataires techniques (hébergeurs, services d'envoi d'emails, fournisseurs d'outils d'IA, etc.).</p>
              <div className="priv-alert alert-green"><span>✅</span><div>CipherFlow s'engage à encadrer ces relations <strong>contractuellement</strong> et à ne recourir qu'à des prestataires présentant des garanties suffisantes au sens du RGPD.</div></div>
            </div>
          </div>

          {/* 11 */}
          <div className="priv-section" id="s11">
            <div className="priv-section-header">
              <div className="priv-section-icon" style={{background:'#FFFBEB'}}>🌍</div>
              <div><div className="priv-section-title">11. Transferts hors Union Européenne</div><div className="priv-section-sub">Mécanismes de protection appropriés</div></div>
            </div>
            <div className="priv-body">
              <p>Certains services techniques (emailing, intelligence artificielle) peuvent impliquer des transferts de données hors de l'Union européenne.</p>
              <div className="priv-alert alert-amber"><span>🛡️</span><div>Dans ce cas, CipherFlow veille à ce que ces transferts soient encadrés par des <strong>clauses contractuelles types</strong> approuvées par la Commission européenne ou des mesures équivalentes.</div></div>
            </div>
          </div>

          {/* 12 */}
          <div className="priv-section" id="s12">
            <div className="priv-section-header">
              <div className="priv-section-icon" style={{background:'#F0FDFA'}}>📝</div>
              <div><div className="priv-section-title">12. Évolution de la politique</div><div className="priv-section-sub">Mise à jour en cas de changement</div></div>
            </div>
            <div className="priv-body">
              <p>Cette politique peut être mise à jour afin de refléter des évolutions réglementaires, techniques ou fonctionnelles. La date de dernière mise à jour est indiquée en tête de document.</p>
            </div>
          </div>

          {/* 13 */}
          <div className="priv-section" id="s13">
            <div className="priv-section-header">
              <div className="priv-section-icon" style={{background:'#EFF6FF'}}>✉️</div>
              <div><div className="priv-section-title">13. Contact</div><div className="priv-section-sub">Pour toute question relative à vos données</div></div>
            </div>
            <div className="priv-body">
              <p>Pour toute question relative à la protection des données ou à cette politique de confidentialité :</p>
              <div className="contact-card">
                <span style={{fontSize:'20px'}}>📧</span>
                <div>
                  <div style={{fontSize:'12px', color:'#94A3B8', marginBottom:'2px'}}>Email de contact</div>
                  <a href="mailto:contact@cipherflow.company">contact@cipherflow.company</a>
                </div>
              </div>
            </div>
          </div>

        </main>
      </div>

      {/* FOOTER */}
      <footer style={{background:'white', borderTop:'1px solid #E2E8F0', padding:'32px 2rem'}}>
        <div style={{maxWidth:'860px', margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'16px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
            <div style={{width:'28px', height:'28px', background:'linear-gradient(135deg, #2563EB, #0EA5A4)', borderRadius:'6px', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:'800', fontSize:'12px'}}>CF</div>
            <span style={{fontSize:'13px', color:'#94A3B8'}}>© 2026 CipherFlow — Tous droits réservés</span>
          </div>
          <div style={{display:'flex', gap:'20px'}}>
            <a href="/privacy" style={{fontSize:'13px', color:'#2563EB', fontWeight:'500', textDecoration:'none'}}>Confidentialité</a>
            <a href="/terms" style={{fontSize:'13px', color:'#94A3B8', textDecoration:'none'}}>CGU</a>
            <a href="mailto:contact@cipherflow.company" style={{fontSize:'13px', color:'#94A3B8', textDecoration:'none'}}>Contact</a>
          </div>
        </div>
      </footer>

    </div>
  )
}
```

---

### CAS B — C'est un fichier `.html` dans `public/`

Remplace **tout le contenu** du fichier par le contenu du fichier `privacy.html` fourni dans le projet (ou copie-le depuis le fichier `CIPHERFLOW_REDESIGN_PROMPT.md` si disponible).

---

## ÉTAPE 3 — VÉRIFIE QUE LA ROUTE EXISTE

Cherche dans `src/App.jsx` (ou le router) si la route `/privacy` est déclarée :

```bash
grep -r "privacy\|confidential" src/App.jsx src/router* 2>/dev/null
```

Si la route n'existe pas, **ajoute-la** dans le router existant sans rien modifier d'autre :

```jsx
import Privacy from './pages/Privacy'  // adapte le chemin selon ce que tu as trouvé

// Dans le Switch/Routes existant :
<Route path="/privacy" element={<Privacy />} />
```

---

## ÉTAPE 4 — VÉRIFICATION FINALE

Lance l'app et navigue vers `/privacy` pour confirmer que la page s'affiche correctement.

```bash
npm run dev
```

Vérifie :
- [ ] La page s'affiche sans erreur console
- [ ] Le sommaire latéral est visible sur desktop
- [ ] Les 13 sections sont présentes
- [ ] Les couleurs sont en light mode (fond blanc/gris clair)
- [ ] Le footer affiche "© 2026 CipherFlow"

**RAPPEL : Ne jamais modifier le backend, les API calls, ni l'authentification OAuth.**
