import { useEffect } from 'react'

export default function MentionsLegales() {

  useEffect(() => {
    document.title = 'Mentions légales — CipherFlow'
  }, [])

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: '#F8FAFC', minHeight: '100vh', color: '#0F172A' }}>

      <style>{`
        .ml-hero { background: white; border-bottom: 1px solid #E2E8F0; padding: 60px 2rem 50px; text-align: center; }
        .ml-hero h1 { font-size: 32px; font-weight: 700; color: #0F172A; margin-bottom: 12px; letter-spacing: -0.5px; }
        .ml-hero p { font-size: 15px; color: #475569; max-width: 520px; margin: 0 auto 24px; }
        .ml-tag { display: inline-flex; align-items: center; gap: 6px; padding: 5px 14px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 20px; font-size: 12px; font-weight: 600; color: #166534; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.05em; }
        .ml-meta { display: flex; align-items: center; justify-content: center; gap: 20px; flex-wrap: wrap; }
        .ml-meta-item { font-size: 12px; color: #94A3B8; }
        .ml-container { max-width: 860px; margin: 0 auto; padding: 48px 24px 80px; display: grid; grid-template-columns: 220px 1fr; gap: 40px; align-items: start; }
        .ml-toc { position: sticky; top: 88px; }
        .ml-toc-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94A3B8; margin-bottom: 12px; }
        .ml-toc a { display: block; padding: 6px 10px; border-radius: 6px; font-size: 13px; color: #475569; text-decoration: none; transition: all 0.15s ease; border-left: 2px solid transparent; margin-bottom: 2px; }
        .ml-toc a:hover { background: white; color: #2563EB; border-left-color: #2563EB; }
        .ml-section { background: white; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; margin-bottom: 20px; transition: box-shadow 0.2s ease; }
        .ml-section:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
        .ml-section-header { padding: 18px 24px; border-bottom: 1px solid #E2E8F0; display: flex; align-items: flex-start; gap: 14px; }
        .ml-section-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 18px; }
        .ml-section-title { font-size: 15px; font-weight: 600; color: #0F172A; margin-bottom: 2px; }
        .ml-section-sub { font-size: 12px; color: #94A3B8; }
        .ml-body { padding: 20px 24px; }
        .ml-body p { font-size: 14px; color: #475569; margin-bottom: 12px; line-height: 1.7; }
        .ml-body p:last-child { margin-bottom: 0; }
        .ml-alert { display: flex; gap: 12px; padding: 14px 16px; border-radius: 8px; border: 1px solid; margin: 12px 0; font-size: 13px; line-height: 1.6; }
        .alert-blue { background: #EFF6FF; border-color: #BFDBFE; color: #1E40AF; }
        .alert-green { background: #F0FDF4; border-color: #BBF7D0; color: #166534; }
        .alert-amber { background: #FFFBEB; border-color: #FDE68A; color: #92400E; }
        .ml-list { list-style: none; padding: 0; margin: 12px 0; }
        .ml-list li { display: flex; align-items: flex-start; gap: 10px; font-size: 13.5px; color: #475569; padding: 6px 0; border-bottom: 1px solid #F8FAFC; line-height: 1.6; }
        .ml-list li:last-child { border-bottom: none; }
        .list-dot { width: 6px; height: 6px; background: #2563EB; border-radius: 50%; flex-shrink: 0; margin-top: 7px; }
        .list-check { color: #22C55E; flex-shrink: 0; margin-top: 2px; }
        .host-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 14px 0; }
        .host-card { padding: 16px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; }
        .host-card-badge { display: inline-flex; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; }
        .badge-blue { background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; }
        .badge-violet { background: #F5F3FF; color: #7C3AED; border: 1px solid #DDD6FE; }
        .badge-orange { background: #FFF7ED; color: #C2410C; border: 1px solid #FED7AA; }
        .host-card-name { font-size: 14px; font-weight: 600; color: #0F172A; margin-bottom: 4px; }
        .host-card-desc { font-size: 12px; color: #94A3B8; margin-bottom: 8px; }
        .host-card-link { font-size: 12px; color: #2563EB; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
        .host-card-link:hover { text-decoration: underline; }
        .info-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; margin-bottom: 8px; font-size: 13px; }
        .info-row:last-child { margin-bottom: 0; }
        .info-label { color: #94A3B8; font-weight: 500; }
        .info-value { color: #0F172A; font-weight: 600; }
        .contact-card { display: flex; align-items: center; gap: 12px; padding: 14px 18px; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px; margin-top: 12px; }
        .contact-card a { color: #2563EB; font-size: 14px; font-weight: 600; text-decoration: none; }
        .contact-card a:hover { text-decoration: underline; }
        .privacy-link-card { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; text-decoration: none; transition: all 0.2s ease; }
        .privacy-link-card:hover { border-color: #2563EB; background: #EFF6FF; box-shadow: 0 2px 8px rgba(37,99,235,0.1); }
        .privacy-link-card-title { font-size: 14px; font-weight: 600; color: #0F172A; margin-bottom: 2px; }
        .privacy-link-card-sub { font-size: 12px; color: #94A3B8; }
        .privacy-link-arrow { color: #2563EB; font-size: 18px; }
        @media (max-width: 700px) {
          .ml-container { grid-template-columns: 1fr !important; }
          .ml-toc { display: none !important; }
          .host-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* HERO */}
      <div className="ml-hero">
        <div className="ml-tag">⚖️ Mentions légales</div>
        <h1>Mentions légales</h1>
        <p>Informations légales relatives à l'éditeur, à l'hébergement et aux conditions d'utilisation de CipherFlow.</p>
        <div className="ml-meta">
          <span className="ml-meta-item">📅 Dernière mise à jour : 1 février 2026</span>
          <span className="ml-meta-item">🏢 Éditeur : Jérémy Lafont</span>
          <span className="ml-meta-item">📋 8 articles</span>
        </div>
      </div>

      {/* LAYOUT */}
      <div className="ml-container">

        {/* SOMMAIRE */}
        <nav className="ml-toc">
          <div className="ml-toc-title">Sommaire</div>
          {[
            ['#s1', '1. Éditeur du site'],
            ['#s2', '2. Hébergement'],
            ['#s3', '3. Propriété intellectuelle'],
            ['#s4', '4. Utilisation du service'],
            ['#s5', '5. Données personnelles'],
            ['#s6', '6. Limitation de responsabilité'],
            ['#s7', '7. Liens externes'],
            ['#s8', '8. Contact'],
          ].map(([href, label]) => (
            <a key={href} href={href}>{label}</a>
          ))}
        </nav>

        {/* CONTENU */}
        <main>

          {/* 1 — ÉDITEUR */}
          <div className="ml-section" id="s1">
            <div className="ml-section-header">
              <div className="ml-section-icon" style={{background:'#EFF6FF'}}>🏢</div>
              <div>
                <div className="ml-section-title">1. Éditeur du site</div>
                <div className="ml-section-sub">Informations sur la société éditrice</div>
              </div>
            </div>
            <div className="ml-body">
              <p>Le présent site et l'application CipherFlow sont édités par :</p>
              <div style={{marginTop:'12px'}}>
                {[
                  ['Nom commercial', 'CipherFlow'],
                  ['Éditeur', 'Jérémy Lafont'],
                  ['Adresse', 'À compléter avant mise en production'],
                  ['Email', 'contact@cipherflow.company'],
                ].map(([label, value]) => (
                  <div key={label} className="info-row">
                    <span className="info-label">{label}</span>
                    <span className="info-value" style={label === 'Adresse' ? {color:'#F59E0B'} : {}}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="ml-alert alert-amber" style={{marginTop:'14px'}}>
                <span>📍</span>
                <div>Le champ <strong>Adresse</strong> doit être complété avant la mise en production officielle de la plateforme.</div>
              </div>
              <p style={{marginTop:'12px'}}>Le responsable de la publication est <strong>Jérémy Lafont</strong>, en qualité de fondateur de CipherFlow.</p>
            </div>
          </div>

          {/* 2 — HÉBERGEMENT */}
          <div className="ml-section" id="s2">
            <div className="ml-section-header">
              <div className="ml-section-icon" style={{background:'#F5F3FF'}}>☁️</div>
              <div>
                <div className="ml-section-title">2. Hébergement</div>
                <div className="ml-section-sub">Infrastructure technique de la plateforme</div>
              </div>
            </div>
            <div className="ml-body">
              <p>Les services de CipherFlow reposent sur plusieurs prestataires spécialisés :</p>
              <div className="host-grid">
                <div className="host-card">
                  <div className="host-card-badge badge-blue">Frontend</div>
                  <div className="host-card-name">Vercel Inc.</div>
                  <div className="host-card-desc">Interface web & déploiement continu</div>
                  <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="host-card-link">vercel.com ↗</a>
                </div>
                <div className="host-card">
                  <div className="host-card-badge badge-violet">Backend</div>
                  <div className="host-card-name">Railway</div>
                  <div className="host-card-desc">API, traitements & base de données</div>
                  <a href="https://railway.app" target="_blank" rel="noopener noreferrer" className="host-card-link">railway.app ↗</a>
                </div>
                <div className="host-card">
                  <div className="host-card-badge badge-orange">Stockage</div>
                  <div className="host-card-name">Cloudflare R2</div>
                  <div className="host-card-desc">Stockage fichiers (région EU)</div>
                  <a href="https://cloudflare.com" target="_blank" rel="noopener noreferrer" className="host-card-link">cloudflare.com ↗</a>
                </div>
              </div>
              <div className="ml-alert alert-blue">
                <span>ℹ️</span>
                <div>Ces prestataires assurent l'hébergement technique de l'application. <strong>CipherFlow reste responsable</strong> de la configuration de la plateforme et de la sécurité logique au niveau de l'application.</div>
              </div>
            </div>
          </div>

          {/* 3 — PROPRIÉTÉ INTELLECTUELLE */}
          <div className="ml-section" id="s3">
            <div className="ml-section-header">
              <div className="ml-section-icon" style={{background:'#FFFBEB'}}>©️</div>
              <div>
                <div className="ml-section-title">3. Propriété intellectuelle</div>
                <div className="ml-section-sub">Protection des éléments de la plateforme</div>
              </div>
            </div>
            <div className="ml-body">
              <p>L'ensemble des éléments composant l'application CipherFlow est protégé par le droit de la propriété intellectuelle :</p>
              <ul className="ml-list">
                {['Textes et contenus rédactionnels', 'Interfaces et composants graphiques', 'Logos et éléments visuels', 'Fonctionnalités et organisation des écrans', 'Code source et architecture logicielle'].map(item => (
                  <li key={item}><span className="list-check">✓</span>{item}</li>
                ))}
              </ul>
              <div className="ml-alert alert-amber">
                <span>⚠️</span>
                <div>Toute reproduction, diffusion, modification ou exploitation non autorisée de tout ou partie de l'application est <strong>interdite</strong> sans l'autorisation préalable de l'éditeur.</div>
              </div>
            </div>
          </div>

          {/* 4 — UTILISATION */}
          <div className="ml-section" id="s4">
            <div className="ml-section-header">
              <div className="ml-section-icon" style={{background:'#F0FDFA'}}>🏠</div>
              <div>
                <div className="ml-section-title">4. Utilisation du service</div>
                <div className="ml-section-sub">Conditions et périmètre d'utilisation</div>
              </div>
            </div>
            <div className="ml-body">
              <p>CipherFlow est destiné à un <strong>usage professionnel</strong>, notamment par des syndics de copropriété, agences immobilières et gestionnaires de biens.</p>
              <div className="ml-alert alert-green">
                <span>✅</span>
                <div>L'utilisateur s'engage à utiliser la plateforme dans le respect des lois et réglementations en vigueur, et à ne pas y introduire de contenus illicites ou manifestement inappropriés.</div>
              </div>
            </div>
          </div>

          {/* 5 — DONNÉES PERSONNELLES */}
          <div className="ml-section" id="s5">
            <div className="ml-section-header">
              <div className="ml-section-icon" style={{background:'#EFF6FF'}}>🔒</div>
              <div>
                <div className="ml-section-title">5. Données personnelles</div>
                <div className="ml-section-sub">Renvoi vers la politique de confidentialité</div>
              </div>
            </div>
            <div className="ml-body">
              <p>La gestion des données personnelles est décrite en détail dans notre politique de confidentialité dédiée.</p>
              <a href="/privacy" className="privacy-link-card" style={{display:'flex', marginTop:'12px'}}>
                <div>
                  <div className="privacy-link-card-title">📄 Politique de confidentialité & protection des données</div>
                  <div className="privacy-link-card-sub">Finalités, durées de conservation, droits RGPD et engagements de CipherFlow</div>
                </div>
                <span className="privacy-link-arrow">→</span>
              </a>
            </div>
          </div>

          {/* 6 — LIMITATION DE RESPONSABILITÉ */}
          <div className="ml-section" id="s6">
            <div className="ml-section-header">
              <div className="ml-section-icon" style={{background:'#FEF2F2'}}>⚡</div>
              <div>
                <div className="ml-section-title">6. Limitation de responsabilité</div>
                <div className="ml-section-sub">Périmètre de responsabilité de l'éditeur</div>
              </div>
            </div>
            <div className="ml-body">
              <p>CipherFlow met tout en œuvre pour assurer un fonctionnement fiable et sécurisé de la plateforme. Toutefois, l'éditeur ne saurait être tenu responsable des conséquences liées :</p>
              <ul className="ml-list">
                <li><span className="list-dot"></span>À une mauvaise utilisation du service par l'utilisateur</li>
                <li><span className="list-dot"></span>À des données inexactes, incomplètes ou illicites introduites par les utilisateurs</li>
                <li><span className="list-dot"></span>À des interruptions temporaires liées à la maintenance, à des évolutions techniques ou à des incidents hors du contrôle raisonnable de l'éditeur</li>
              </ul>
            </div>
          </div>

          {/* 7 — LIENS EXTERNES */}
          <div className="ml-section" id="s7">
            <div className="ml-section-header">
              <div className="ml-section-icon" style={{background:'#F5F3FF'}}>🔗</div>
              <div>
                <div className="ml-section-title">7. Liens externes</div>
                <div className="ml-section-sub">Responsabilité vis-à-vis des ressources tierces</div>
              </div>
            </div>
            <div className="ml-body">
              <p>L'application peut contenir des liens vers des sites ou services tiers.</p>
              <div className="ml-alert alert-amber">
                <span>⚠️</span>
                <div>CipherFlow n'exerce aucun contrôle sur ces ressources externes et ne peut être tenu responsable de leur contenu ou de leur politique de confidentialité.</div>
              </div>
            </div>
          </div>

          {/* 8 — CONTACT */}
          <div className="ml-section" id="s8">
            <div className="ml-section-header">
              <div className="ml-section-icon" style={{background:'#EFF6FF'}}>✉️</div>
              <div>
                <div className="ml-section-title">8. Contact</div>
                <div className="ml-section-sub">Pour toute question relative aux mentions légales</div>
              </div>
            </div>
            <div className="ml-body">
              <p>Pour toute question relative aux présentes mentions légales ou au fonctionnement de la plateforme :</p>
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
            <a href="/mentions-legales" style={{fontSize:'13px', color:'#2563EB', fontWeight:'500', textDecoration:'none'}}>Mentions légales</a>
            <a href="/privacy" style={{fontSize:'13px', color:'#94A3B8', textDecoration:'none'}}>Confidentialité</a>
            <a href="mailto:contact@cipherflow.company" style={{fontSize:'13px', color:'#94A3B8', textDecoration:'none'}}>Contact</a>
          </div>
        </div>
      </footer>

    </div>
  )
}
