import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../services/api";

/**
 * Page d'onboarding post-premier login.
 *
 * 4 étapes avec indicateur de progression :
 *  1. Bienvenue — présentation de CipherFlow
 *  2. Connecter la boîte email (Gmail / Outlook)
 *  3. Personnaliser le profil agence
 *  4. Prêt !
 *
 * Détection auto : si une boîte est déjà connectée au montage → étape 3.
 */
export default function Onboarding({ authFetch }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [checking, setChecking] = useState(true);
  const [connecting, setConnecting] = useState(null); // "gmail" | "outlook" | null

  const TOTAL_STEPS = 4;

  // ── Détection auto de connexion email ────────────────────────────────────
  useEffect(() => {
    async function checkConnected() {
      try {
        const [gRes, oRes] = await Promise.all([
          authFetch("/gmail/status"),
          authFetch("/outlook/status"),
        ]);
        const gData = gRes.ok ? await gRes.json() : {};
        const oData = oRes.ok ? await oRes.json() : {};
        if (gData.connected || oData.connected) {
          setStep(3); // email déjà connecté → passe étape 2
        }
      } catch (_) {
        // silencieux — si erreur, on commence à l'étape 1
      } finally {
        setChecking(false);
      }
    }
    checkConnected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Connexion Gmail via OAuth ─────────────────────────────────────────────
  const connectGmail = async () => {
    setConnecting("gmail");
    try {
      const res = await authFetch("/gmail/connect");
      if (res.ok) {
        const data = await res.json();
        if (data.auth_url) window.location.href = data.auth_url;
      }
    } catch (_) {
      setConnecting(null);
    }
  };

  // ── Connexion Outlook via OAuth ───────────────────────────────────────────
  const connectOutlook = async () => {
    setConnecting("outlook");
    try {
      const res = await authFetch("/outlook/connect");
      if (res.ok) {
        const data = await res.json();
        if (data.auth_url) window.location.href = data.auth_url;
      }
    } catch (_) {
      setConnecting(null);
    }
  };

  if (checking) return null; // spinner global évite le flash de contenu

  return (
    <div style={styles.page}>
      {/* Barre de progression */}
      <div style={styles.progressBar}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div
            key={i}
            style={{
              ...styles.progressDot,
              ...(i + 1 <= step ? styles.progressDotActive : {}),
            }}
          />
        ))}
      </div>

      {/* Carte principale */}
      <div style={styles.card}>
        {/* Étape 1 — Bienvenue */}
        {step === 1 && (
          <Step
            icon="👋"
            title="Bienvenue sur CipherFlow"
            desc="CipherFlow automatise le traitement de vos emails de candidature locative : extraction des pièces jointes, classification IA et génération de réponses."
            items={[
              "Connectez votre boîte Gmail ou Outlook",
              "Les candidatures arrivent automatiquement",
              "Chaque dossier locataire est créé en temps réel",
            ]}
          >
            <Btn label="Commencer la configuration →" onClick={() => setStep(2)} />
          </Step>
        )}

        {/* Étape 2 — Connexion email */}
        {step === 2 && (
          <Step
            icon="📬"
            title="Connectez votre boîte email"
            desc="CipherFlow surveille votre boîte en permanence pour traiter les emails entrants. Choisissez le provider que vous utilisez."
          >
            <div style={styles.btnGroup}>
              <button
                style={{ ...styles.providerBtn, ...styles.gmailBtn }}
                onClick={connectGmail}
                disabled={!!connecting}
              >
                {connecting === "gmail" ? "Connexion…" : "Connecter Gmail"}
              </button>
              <button
                style={{ ...styles.providerBtn, ...styles.outlookBtn }}
                onClick={connectOutlook}
                disabled={!!connecting}
              >
                {connecting === "outlook" ? "Connexion…" : "Connecter Outlook"}
              </button>
            </div>
            <button style={styles.skipLink} onClick={() => setStep(3)}>
              Passer cette étape →
            </button>
          </Step>
        )}

        {/* Étape 3 — Personnalisation */}
        {step === 3 && (
          <Step
            icon="⚙️"
            title="Personnalisez votre profil"
            desc="Ajoutez le nom de votre agence et une signature dans les Paramètres pour personnaliser les réponses automatiques envoyées aux candidats."
            items={[
              "Nom et logo de votre agence",
              "Ton des réponses IA (formel, cordial…)",
              "Signature personnalisée",
            ]}
          >
            <div style={styles.btnGroup}>
              <Btn label="Aller aux Paramètres" onClick={() => navigate("/settings")} secondary />
              <Btn label="Continuer →" onClick={() => setStep(4)} />
            </div>
          </Step>
        )}

        {/* Étape 4 — Prêt */}
        {step === 4 && (
          <Step
            icon="🎉"
            title="Vous êtes prêt !"
            desc="CipherFlow est configuré. Vos prochains emails de candidature seront traités automatiquement."
            items={[
              "Consultez le Dashboard pour suivre l'activité",
              "Gérez vos dossiers locataires dans l'onglet dédié",
              "Revenez aux Paramètres pour affiner la configuration",
            ]}
          >
            <Btn label="Accéder au Dashboard →" onClick={() => navigate("/dashboard")} />
          </Step>
        )}
      </div>

      {/* Étape actuelle */}
      <p style={styles.stepLabel}>
        Étape {step} sur {TOTAL_STEPS}
      </p>
    </div>
  );
}

// ── Composants utilitaires ─────────────────────────────────────────────────

function Step({ icon, title, desc, items, children }) {
  return (
    <>
      <div style={styles.icon}>{icon}</div>
      <h1 style={styles.title}>{title}</h1>
      <p style={styles.desc}>{desc}</p>
      {items && (
        <ul style={styles.list}>
          {items.map((item, i) => (
            <li key={i} style={styles.listItem}>
              <span style={styles.bullet}>✓</span> {item}
            </li>
          ))}
        </ul>
      )}
      <div style={styles.actions}>{children}</div>
    </>
  );
}

function Btn({ label, onClick, secondary }) {
  return (
    <button
      onClick={onClick}
      style={secondary ? styles.btnSecondary : styles.btnPrimary}
    >
      {label}
    </button>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg, #0f1117)",
    padding: "2rem",
  },
  progressBar: {
    display: "flex",
    gap: "10px",
    marginBottom: "2rem",
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.15)",
    transition: "background 0.3s",
  },
  progressDotActive: {
    background: "var(--accent, #6366f1)",
  },
  card: {
    background: "var(--card-bg, #1a1d2e)",
    borderRadius: 16,
    padding: "2.5rem",
    maxWidth: 520,
    width: "100%",
    textAlign: "center",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  icon: {
    fontSize: 48,
    marginBottom: "1rem",
  },
  title: {
    fontSize: "1.6rem",
    fontWeight: 700,
    color: "var(--text, #f1f5f9)",
    marginBottom: "0.75rem",
  },
  desc: {
    color: "rgba(255,255,255,0.65)",
    lineHeight: 1.6,
    marginBottom: "1.5rem",
  },
  list: {
    listStyle: "none",
    padding: 0,
    margin: "0 0 1.5rem",
    textAlign: "left",
  },
  listItem: {
    color: "rgba(255,255,255,0.75)",
    padding: "6px 0",
    display: "flex",
    gap: "8px",
  },
  bullet: {
    color: "var(--accent, #6366f1)",
    fontWeight: 700,
  },
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginTop: "1rem",
  },
  btnGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  btnPrimary: {
    padding: "12px 24px",
    background: "var(--accent, #6366f1)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  btnSecondary: {
    padding: "12px 24px",
    background: "transparent",
    color: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    fontSize: "1rem",
    fontWeight: 500,
    cursor: "pointer",
  },
  providerBtn: {
    padding: "12px 24px",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  gmailBtn: {
    background: "#ea4335",
    color: "#fff",
  },
  outlookBtn: {
    background: "#0078d4",
    color: "#fff",
  },
  skipLink: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.45)",
    cursor: "pointer",
    fontSize: "0.9rem",
    marginTop: "0.5rem",
    textDecoration: "underline",
  },
  stepLabel: {
    marginTop: "1.5rem",
    color: "rgba(255,255,255,0.35)",
    fontSize: "0.85rem",
  },
};
