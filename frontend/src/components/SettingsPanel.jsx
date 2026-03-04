import React, { useEffect, useState } from 'react';
import { Save, Building, User, PenTool, FileSignature, Image as ImageIcon, Upload, Loader2, CheckCircle, AlertCircle, Mail, Wifi, WifiOff, ExternalLink } from 'lucide-react';

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";


// ── Composant configuration IMAP (alternative manuelle) ──────────────────────
function ImapConfigSection({ authFetch }) {
  const [emailConfig, setEmailConfig] = React.useState({
    enabled: false,
    imap_host: '',
    imap_port: 993,
    imap_user: '',
    imap_password: '',
    from_email: '',
    has_password: false,
  });
  const [savingEmail, setSavingEmail] = React.useState(false);
  const [emailMessage, setEmailMessage] = React.useState(null);

  const cardStyle = { background: "#1e293b", padding: "2rem", borderRadius: "12px", marginBottom: "2rem", border: "1px solid #334155" };
  const labelStyle = { display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", color: "#94a3b8", fontSize: "0.9rem", fontWeight: "600" };
  const inputStyle = { width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #334155", background: "#0f172a", color: "white", outline: "none", fontSize: "1rem", boxSizing: "border-box" };

  React.useEffect(() => {
    const load = async () => {
      if (!authFetch) return;
      try {
        const res = await authFetch(API_BASE + "/settings/email-config");
        if (res.ok) setEmailConfig(await res.json());
      } catch (err) {
        console.error("Erreur chargement email config:", err);
      }
    };
    load();
  }, [authFetch]);

  const handleEmailChange = (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setEmailConfig({ ...emailConfig, [e.target.name]: val });
  };

  const handleSaveEmailConfig = async () => {
    setSavingEmail(true);
    setEmailMessage(null);
    try {
      const body = {
        enabled: emailConfig.enabled,
        imap_host: emailConfig.imap_host,
        imap_port: Number(emailConfig.imap_port) || 993,
        imap_user: emailConfig.imap_user,
        from_email: emailConfig.from_email,
      };
      if (emailConfig.imap_password) body.imap_password = emailConfig.imap_password;
      const res = await authFetch(API_BASE + "/settings/email-config", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEmailMessage({ type: "success", text: "Configuration IMAP sauvegardée !" });
        setEmailConfig({ ...emailConfig, imap_password: "", has_password: true });
      } else {
        setEmailMessage({ type: "error", text: "Erreur sauvegarde" });
      }
    } catch {
      setEmailMessage({ type: "error", text: "Erreur réseau" });
    } finally {
      setSavingEmail(false);
    }
  };

  return (
    <div style={cardStyle}>
      <h3 style={{ color: "white", marginBottom: "0.5rem", fontSize: "1.2rem", borderBottom: "1px solid #334155", paddingBottom: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
        <Mail size={20} /> Configuration IMAP manuelle
      </h3>
      <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
        Alternative pour les boîtes non-Gmail (Outlook, OVH, etc.) ou si vous préférez la configuration manuelle.
      </p>

      {/* Toggle activation */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "1.5rem", padding: "1rem", background: emailConfig.enabled ? "#0d2818" : "#1a1a2e", borderRadius: "8px", border: "1px solid " + (emailConfig.enabled ? "#16a34a" : "#334155") }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: "white", fontWeight: "bold" }}>Watcher IMAP actif</div>
          <div style={{ color: "#64748b", fontSize: "0.8rem" }}>
            {emailConfig.enabled ? "Votre boîte IMAP est surveillée" : "Activez pour surveiller via IMAP"}
          </div>
        </div>
        <label style={{ position: "relative", display: "inline-block", width: "52px", height: "28px" }}>
          <input type="checkbox" name="enabled" checked={emailConfig.enabled} onChange={handleEmailChange} style={{ opacity: 0, width: 0, height: 0 }} />
          <span style={{ position: "absolute", cursor: "pointer", top: 0, left: 0, right: 0, bottom: 0, background: emailConfig.enabled ? "#16a34a" : "#334155", borderRadius: "28px", transition: "0.3s" }}>
            <span style={{ position: "absolute", height: "20px", width: "20px", left: emailConfig.enabled ? "28px" : "4px", bottom: "4px", background: "white", borderRadius: "50%", transition: "0.3s" }} />
          </span>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.2rem" }}>
        <div><label style={labelStyle}>Serveur IMAP</label><input name="imap_host" value={emailConfig.imap_host || ""} onChange={handleEmailChange} style={inputStyle} placeholder="imap.gmail.com" /></div>
        <div><label style={labelStyle}>Port</label><input name="imap_port" type="number" value={emailConfig.imap_port || 993} onChange={handleEmailChange} style={inputStyle} placeholder="993" /></div>
        <div><label style={labelStyle}>Adresse email (login)</label><input name="imap_user" value={emailConfig.imap_user || ""} onChange={handleEmailChange} style={inputStyle} placeholder="agence@gmail.com" /></div>
        <div>
          <label style={labelStyle}>
            Mot de passe / App Password
            {emailConfig.has_password && <span style={{ color: "#34d399", fontSize: "0.75rem" }}>✓ configuré</span>}
          </label>
          <input name="imap_password" type="password" value={emailConfig.imap_password || ""} onChange={handleEmailChange} style={inputStyle} placeholder={emailConfig.has_password ? "Laisser vide pour conserver" : "Mot de passe app Gmail"} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Adresse affichée dans les réponses (optionnel)</label>
          <input name="from_email" value={emailConfig.from_email || ""} onChange={handleEmailChange} style={inputStyle} placeholder="contact@mon-agence.fr" />
        </div>
      </div>

      <div style={{ marginTop: "1rem", padding: "0.8rem", background: "#0f172a", borderRadius: "8px", fontSize: "0.8rem", color: "#64748b" }}>
        💡 Pour Gmail, utilisez un <strong style={{ color: "#94a3b8" }}>mot de passe d'application</strong> (Compte Google → Sécurité → Validation en 2 étapes → Mots de passe des applications).
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.5rem" }}>
        {emailMessage ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: emailMessage.type === "success" ? "#34d399" : "#f87171", fontWeight: "bold" }}>
            {emailMessage.type === "success" ? <CheckCircle size={18} /> : <AlertCircle size={18} />} {emailMessage.text}
          </div>
        ) : <div />}
        <button onClick={handleSaveEmailConfig} disabled={savingEmail} style={{ background: savingEmail ? "#334155" : "#0891b2", border: "none", color: "white", padding: "12px 24px", borderRadius: "8px", cursor: savingEmail ? "not-allowed" : "pointer", fontWeight: "bold", display: "flex", gap: "8px", alignItems: "center" }}>
          <Save size={18} /> {savingEmail ? "Sauvegarde..." : "Sauvegarder la config IMAP"}
        </button>
      </div>
    </div>
  );
}

// ── Composant connexion Gmail OAuth ───────────────────────────────────────────
function GmailConnectSection({ authFetch }) {
  const [status, setStatus] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [message, setMessage] = React.useState(null);

  const cardStyle = { background: "#1e293b", padding: "2rem", borderRadius: "12px", marginBottom: "2rem", border: "1px solid #334155" };

  React.useEffect(() => {
    // Lire le résultat du callback OAuth si on revient de Google
    const params = new URLSearchParams(window.location.search);
    const gmailResult = params.get("gmail");
    const gmailEmail = params.get("email");
    if (gmailResult === "success") {
      setMessage({ type: "success", text: "Gmail connecté" + (gmailEmail ? " : " + gmailEmail : "") + " ✅" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (gmailResult === "error") {
      const reason = params.get("reason") || "inconnu";
      setMessage({ type: "error", text: "Erreur de connexion Gmail (" + reason + ")" });
      window.history.replaceState({}, "", window.location.pathname);
    }

    const load = async () => {
      try {
        const res = await authFetch(API_BASE + "/gmail/status");
        if (res.ok) setStatus(await res.json());
      } catch (e) {
        console.error("Erreur statut Gmail:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [authFetch]);

  const handleConnect = async () => {
    try {
      const res = await authFetch(API_BASE + "/gmail/connect");
      const data = await res.json();
      if (data?.auth_url) {
        window.location.href = data.auth_url;
      } else {
        setMessage({ type: "error", text: "Impossible d'obtenir l'URL de connexion Google." });
      }
    } catch (e) {
      setMessage({ type: "error", text: "Erreur réseau lors de la connexion Gmail." });
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Déconnecter Gmail ? Le watcher s'arrêtera.")) return;
    setDisconnecting(true);
    setMessage(null);
    try {
      const res = await authFetch(API_BASE + "/gmail/disconnect", { method: "POST" });
      if (res.ok) {
        setStatus({ connected: false, email: null });
        setMessage({ type: "success", text: "Gmail déconnecté." });
      } else {
        setMessage({ type: "error", text: "Erreur lors de la déconnexion." });
      }
    } catch {
      setMessage({ type: "error", text: "Erreur réseau." });
    } finally {
      setDisconnecting(false);
    }
  };

  const isConnected = status?.connected;

  return (
    <div style={cardStyle}>
      <h3 style={{ color: "white", marginBottom: "0.5rem", fontSize: "1.15rem", borderBottom: "1px solid #334155", paddingBottom: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Gmail
      </h3>

      {/* Message feedback */}
      {message && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem", padding: "0.75rem 1rem", borderRadius: "8px", background: message.type === "success" ? "rgba(22,163,74,0.15)" : "rgba(239,68,68,0.15)", border: "1px solid " + (message.type === "success" ? "#16a34a" : "#ef4444"), color: message.type === "success" ? "#34d399" : "#f87171", fontWeight: "bold" }}>
          {message.type === "success" ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          {message.text}
        </div>
      )}

      {loading ? (
        <div style={{ color: "#64748b", display: "flex", alignItems: "center", gap: "8px" }}>
          <Loader2 size={18} /> Chargement...
        </div>
      ) : isConnected ? (
        <div>
          {/* État : Gmail connecté */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "1rem", background: "#0d2818", borderRadius: "8px", border: "1px solid #16a34a", marginBottom: "1.5rem" }}>
            <Wifi size={22} color="#34d399" />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ color: "white", fontWeight: "bold", fontSize: "0.95rem" }}>
                  {status.email || "Adresse non disponible"}
                </span>
                <span style={{ background: "#16a34a", color: "#dcfce7", fontSize: "0.72rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>
                  Connecté
                </span>
              </div>
              <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "4px" }}>
                Watcher actif — surveillance en cours
              </div>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            style={{ background: "transparent", border: "1px solid #ef4444", color: "#f87171", padding: "10px 20px", borderRadius: "8px", cursor: disconnecting ? "not-allowed" : "pointer", fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "0.9rem" }}
          >
            <WifiOff size={16} />
            {disconnecting ? "Déconnexion..." : "Déconnecter Gmail"}
          </button>
        </div>
      ) : (
        <div>
          {/* État : Gmail non connecté */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "1rem", background: "#1a1a2e", borderRadius: "8px", border: "1px solid #334155", marginBottom: "1.5rem" }}>
            <WifiOff size={22} color="#64748b" />
            <div style={{ flex: 1 }}>
              <div style={{ color: "white", fontWeight: "bold" }}>Aucune boîte email connectée</div>
              <div style={{ color: "#64748b", fontSize: "0.82rem", marginTop: "2px" }}>
                Connectez Gmail pour activer la surveillance automatique des emails
              </div>
            </div>
          </div>

          <button
            onClick={handleConnect}
            style={{ background: "white", border: "none", color: "#1a1a2e", padding: "12px 24px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "0.95rem", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Connecter Gmail
            <ExternalLink size={14} />
          </button>

          <div style={{ marginTop: "1rem", padding: "0.8rem", background: "#0f172a", borderRadius: "8px", fontSize: "0.8rem", color: "#64748b" }}>
            💡 La connexion se fait en <strong style={{ color: "#94a3b8" }}>1 clic</strong> via votre compte Google — aucun mot de passe à saisir.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Composant connexion Outlook OAuth ─────────────────────────────────────────
function OutlookConnectSection({ authFetch }) {
  const [status, setStatus] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [message, setMessage] = React.useState(null);

  const cardStyle = { background: "#1e293b", padding: "2rem", borderRadius: "12px", marginBottom: "2rem", border: "1px solid #334155" };

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outlookResult = params.get("outlook");
    const outlookEmail = params.get("email");
    if (outlookResult === "success") {
      setMessage({ type: "success", text: "Outlook connecté" + (outlookEmail ? " : " + outlookEmail : "") + " ✅" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (outlookResult === "error") {
      const reason = params.get("reason") || "inconnu";
      setMessage({ type: "error", text: "Erreur de connexion Outlook (" + reason + ")" });
      window.history.replaceState({}, "", window.location.pathname);
    }

    const load = async () => {
      try {
        const res = await authFetch(API_BASE + "/outlook/status");
        if (res.ok) setStatus(await res.json());
      } catch (e) {
        console.error("Erreur statut Outlook:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [authFetch]);

  const handleConnect = async () => {
    try {
      const res = await authFetch(API_BASE + "/outlook/connect");
      const data = await res.json();
      if (data?.auth_url) {
        window.location.href = data.auth_url;
      } else {
        setMessage({ type: "error", text: "Impossible d'obtenir l'URL de connexion Microsoft." });
      }
    } catch {
      setMessage({ type: "error", text: "Erreur réseau lors de la connexion Outlook." });
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Déconnecter Outlook ? La surveillance s'arrêtera.")) return;
    setDisconnecting(true);
    setMessage(null);
    try {
      const res = await authFetch(API_BASE + "/outlook/disconnect", { method: "POST" });
      if (res.ok) {
        setStatus({ connected: false, email: null });
        setMessage({ type: "success", text: "Outlook déconnecté." });
      } else {
        setMessage({ type: "error", text: "Erreur lors de la déconnexion." });
      }
    } catch {
      setMessage({ type: "error", text: "Erreur réseau." });
    } finally {
      setDisconnecting(false);
    }
  };

  const isConnected = status?.connected;

  return (
    <div style={cardStyle}>
      <h3 style={{ color: "white", marginBottom: "0.5rem", fontSize: "1.15rem", borderBottom: "1px solid #334155", paddingBottom: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
        <svg width="18" height="18" viewBox="0 0 23 23" fill="none"><path fill="#f25022" d="M1 1h10v10H1z"/><path fill="#7fba00" d="M12 1h10v10H12z"/><path fill="#00a4ef" d="M1 12h10v10H1z"/><path fill="#ffb900" d="M12 12h10v10H12z"/></svg>
        Outlook / Microsoft 365
      </h3>

      {message && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem", padding: "0.75rem 1rem", borderRadius: "8px", background: message.type === "success" ? "rgba(22,163,74,0.15)" : "rgba(239,68,68,0.15)", border: "1px solid " + (message.type === "success" ? "#16a34a" : "#ef4444"), color: message.type === "success" ? "#34d399" : "#f87171", fontWeight: "bold" }}>
          {message.type === "success" ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          {message.text}
        </div>
      )}

      {loading ? (
        <div style={{ color: "#64748b", display: "flex", alignItems: "center", gap: "8px" }}>
          <Loader2 size={18} /> Chargement...
        </div>
      ) : isConnected ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "1rem", background: "#0d2818", borderRadius: "8px", border: "1px solid #16a34a", marginBottom: "1.5rem" }}>
            <Wifi size={22} color="#34d399" />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ color: "white", fontWeight: "bold", fontSize: "0.95rem" }}>
                  {status.email || "Adresse non disponible"}
                </span>
                <span style={{ background: "#16a34a", color: "#dcfce7", fontSize: "0.72rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>
                  Connecté
                </span>
              </div>
              <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "4px" }}>
                Outlook connecté — surveillance en cours
              </div>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            style={{ background: "transparent", border: "1px solid #ef4444", color: "#f87171", padding: "10px 20px", borderRadius: "8px", cursor: disconnecting ? "not-allowed" : "pointer", fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "0.9rem" }}
          >
            <WifiOff size={16} />
            {disconnecting ? "Déconnexion..." : "Déconnecter Outlook"}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "1rem", background: "#1a1a2e", borderRadius: "8px", border: "1px solid #334155", marginBottom: "1.5rem" }}>
            <WifiOff size={22} color="#64748b" />
            <div style={{ flex: 1 }}>
              <div style={{ color: "white", fontWeight: "bold" }}>Aucune boîte Outlook connectée</div>
              <div style={{ color: "#64748b", fontSize: "0.82rem", marginTop: "2px" }}>
                Connectez Outlook / Microsoft 365 pour activer la surveillance automatique des emails
              </div>
            </div>
          </div>

          <button
            onClick={handleConnect}
            style={{ background: "#0078d4", border: "none", color: "white", padding: "12px 24px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "0.95rem", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
          >
            {/* Logo Microsoft */}
            <svg width="20" height="20" viewBox="0 0 23 23" fill="none">
              <path fill="#f25022" d="M1 1h10v10H1z"/>
              <path fill="#7fba00" d="M12 1h10v10H12z"/>
              <path fill="#00a4ef" d="M1 12h10v10H1z"/>
              <path fill="#ffb900" d="M12 12h10v10H12z"/>
            </svg>
            Connecter Outlook
            <ExternalLink size={14} />
          </button>

          <div style={{ marginTop: "1rem", padding: "0.8rem", background: "#0f172a", borderRadius: "8px", fontSize: "0.8rem", color: "#64748b" }}>
            💡 La connexion se fait en <strong style={{ color: "#94a3b8" }}>1 clic</strong> via votre compte Microsoft — aucun mot de passe à saisir.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────
const SettingsPanel = ({ token, authFetch }) => {
  const [settings, setSettings] = useState({
    company_name: '',
    agent_name: '',
    tone: 'pro',
    signature: '',
    logo: ''
  });

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!authFetch) return;
      try {
        const res = await authFetch(API_BASE + "/settings");
        if (res.ok) setSettings(await res.json());
      } catch (err) {
        console.error("Erreur chargement settings:", err);
      }
    };
    load();
  }, [authFetch]);

  const handleChange = (e) => setSettings({ ...settings, [e.target.name]: e.target.value });

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const res = await authFetch(API_BASE + "/settings/upload-logo", {
          method: "POST",
          body: JSON.stringify({ logo_base64: reader.result }),
        });
        if (res.ok) {
          const refresh = await authFetch(API_BASE + "/settings");
          if (refresh.ok) {
            const data = await refresh.json();
            setSettings(data);
            setMessage({ type: "success", text: "Logo mis à jour !" });
          }
        } else {
          setMessage({ type: "error", text: "Erreur serveur." });
        }
      } catch {
        setMessage({ type: "error", text: "Erreur réseau." });
      } finally {
        setUploading(false);
      }
    };
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await authFetch(API_BASE + "/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      if (res.ok) setMessage({ type: "success", text: "Paramètres sauvegardés !" });
      else setMessage({ type: "error", text: "Erreur sauvegarde" });
    } catch {
      setMessage({ type: "error", text: "Erreur réseau" });
    } finally {
      setLoading(false);
    }
  };

  const cardStyle = { background: "#1e293b", padding: "2rem", borderRadius: "12px", marginBottom: "2rem", border: "1px solid #334155" };
  const labelStyle = { display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", color: "#94a3b8", fontSize: "0.9rem", fontWeight: "600" };
  const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: 'white', outline: 'none', fontSize: '1rem', boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", paddingBottom: "6rem" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.8rem", fontWeight: "bold", color: "white" }}>Paramètres</h2>
        <p style={{ color: "#94a3b8" }}>Personnalisez votre agence et configurez la réception automatique des emails.</p>
      </div>

      {/* Identité */}
      <div style={cardStyle}>
        <h3 style={{ color: "white", marginBottom: "1.5rem", fontSize: "1.2rem", borderBottom: "1px solid #334155", paddingBottom: "10px" }}>🏢 Identité de l'Entreprise</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          <div><label style={labelStyle}><Building size={18} /> Nom de l'entreprise</label><input name="company_name" value={settings.company_name || ""} onChange={handleChange} style={inputStyle} placeholder="Ex: Agence Immobilière" /></div>
          <div><label style={labelStyle}><User size={18} /> Nom de l'Agent IA</label><input name="agent_name" value={settings.agent_name || ""} onChange={handleChange} style={inputStyle} placeholder="Ex: Sophie" /></div>
        </div>
      </div>

      {/* Logo */}
      <div style={cardStyle}>
        <h3 style={{ color: "white", marginBottom: "1.5rem", fontSize: "1.2rem", borderBottom: "1px solid #334155", paddingBottom: "10px" }}>🎨 Branding & Logo</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "2rem", flexWrap: "wrap" }}>
          <div style={{ width: "120px", height: "120px", background: "#0f172a", borderRadius: "12px", border: "2px dashed #475569", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {settings.logo ? <img src={settings.logo} alt="Logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <ImageIcon size={40} color="#475569" />}
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Mettre à jour le logo</label>
            <label style={{ cursor: "pointer", background: uploading ? "#334155" : "#3b82f6", color: "white", padding: "10px 20px", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "10px", fontWeight: "bold" }}>
              {uploading ? <Loader2 size={20} /> : <Upload size={20} />}
              {uploading ? "Traitement..." : "Choisir un fichier"}
              <input type="file" accept="image/png, image/jpeg" onChange={handleLogoUpload} disabled={uploading} style={{ display: "none" }} />
            </label>
          </div>
        </div>
      </div>

      {/* Comportement IA */}
      <div style={cardStyle}>
        <h3 style={{ color: "white", marginBottom: "1.5rem", fontSize: "1.2rem", borderBottom: "1px solid #334155", paddingBottom: "10px" }}>🤖 Comportement de l'IA</h3>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}><PenTool size={18} /> Ton de la réponse</label>
          <select name="tone" value={settings.tone || "pro"} onChange={handleChange} style={{ ...inputStyle, cursor: "pointer" }}>
            <option value="pro">👔 Professionnel</option>
            <option value="amical">👋 Amical & Chaleureux</option>
            <option value="direct">⚡ Direct & Concis</option>
            <option value="commercial">💼 Commercial</option>
            <option value="empathique">❤️ Empathique</option>
            <option value="formel">⚖️ Formel</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}><FileSignature size={18} /> Signature email automatique</label>
          <textarea name="signature" value={settings.signature || ""} onChange={handleChange} placeholder={"Cordialement,\nL'équipe"} style={{ ...inputStyle, minHeight: "100px", resize: "vertical" }} />
        </div>
      </div>

      {/* Bouton save paramètres */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", background: "#0f172a", padding: "10px", borderRadius: "12px", border: "1px solid #334155" }}>
        {message ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: message.type === "success" ? "#34d399" : "#f87171", fontWeight: "bold" }}>
            {message.type === "success" ? <CheckCircle size={20} /> : <AlertCircle size={20} />} {message.text}
          </div>
        ) : <div style={{ color: "#64748b", fontSize: "0.9rem" }}>Modifications non enregistrées</div>}
        <button onClick={handleSave} disabled={loading} style={{ background: loading ? "#334155" : "#6366f1", border: "none", color: "white", padding: "12px 24px", borderRadius: "8px", cursor: loading ? "not-allowed" : "pointer", fontWeight: "bold", display: "flex", gap: "8px", alignItems: "center" }}>
          <Save size={18} /> {loading ? "Sauvegarde..." : "Sauvegarder"}
        </button>
      </div>

      {/* ── Réception des emails ── */}
      <div style={{ marginBottom: "2rem" }}>
        <h3 style={{ color: "white", margin: "0 0 0.5rem", fontSize: "1.1rem" }}>
          📬 Réception des emails
        </h3>
        <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 1.25rem" }}>
          Connectez votre boîte email pour que CipherFlow traite automatiquement
          les dossiers locataires entrants.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          <GmailConnectSection authFetch={authFetch} />
          <OutlookConnectSection authFetch={authFetch} />
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
