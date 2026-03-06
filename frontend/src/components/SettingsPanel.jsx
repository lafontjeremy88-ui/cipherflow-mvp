import React, { useEffect, useState } from 'react';
import {
  Save, Building, User, PenTool, FileSignature,
  Image as ImageIcon, Upload, Loader2, CheckCircle,
  AlertCircle, Mail, Wifi, WifiOff, ExternalLink, Trash2
} from 'lucide-react';

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

/* ── Composants partagés ──────────────────────────────────────────────────── */

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white border border-surface-border rounded-xl shadow-card p-6 mb-5 ${className}`}>
      {children}
    </div>
  );
}

function CardTitle({ children }) {
  return (
    <h3 className="text-sm font-semibold text-ink mb-4 pb-3 border-b border-surface-border flex items-center gap-2">
      {children}
    </h3>
  );
}

const inputCls = "w-full px-4 py-2.5 bg-white border border-surface-border rounded-lg text-sm text-ink placeholder-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600 transition-all duration-200";
const labelCls = "block text-sm font-medium text-ink-secondary mb-1.5";

function Toggle({ checked, onChange, name }) {
  return (
    <label className="relative inline-block w-12 h-6 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        className="opacity-0 w-0 h-0 absolute"
      />
      <span
        className={`absolute inset-0 rounded-full transition-colors duration-200 ${checked ? "bg-green-500" : "bg-slate-200"}`}
      >
        <span
          className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${checked ? "left-7" : "left-1"}`}
        />
      </span>
    </label>
  );
}

function FeedbackMsg({ msg }) {
  if (!msg) return null;
  const isOk = msg.type === "success";
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isOk ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
      {isOk ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {msg.text}
    </div>
  );
}

/* ── IMAP Config ─────────────────────────────────────────────────────────── */

function ImapConfigSection({ authFetch }) {
  const [emailConfig, setEmailConfig] = React.useState({
    enabled: false, imap_host: '', imap_port: 993, imap_user: '',
    imap_password: '', from_email: '', has_password: false,
  });
  const [savingEmail, setSavingEmail] = React.useState(false);
  const [emailMessage, setEmailMessage] = React.useState(null);

  React.useEffect(() => {
    const load = async () => {
      if (!authFetch) return;
      try {
        const res = await authFetch(API_BASE + "/settings/email-config");
        if (res.ok) setEmailConfig(await res.json());
      } catch (err) { console.error("Erreur chargement email config:", err); }
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
        enabled: emailConfig.enabled, imap_host: emailConfig.imap_host,
        imap_port: Number(emailConfig.imap_port) || 993, imap_user: emailConfig.imap_user,
        from_email: emailConfig.from_email,
      };
      if (emailConfig.imap_password) body.imap_password = emailConfig.imap_password;
      const res = await authFetch(API_BASE + "/settings/email-config", {
        method: "PATCH", body: JSON.stringify(body),
      });
      if (res.ok) {
        setEmailMessage({ type: "success", text: "Configuration IMAP sauvegardée !" });
        setEmailConfig({ ...emailConfig, imap_password: "", has_password: true });
      } else {
        setEmailMessage({ type: "error", text: "Erreur sauvegarde" });
      }
    } catch { setEmailMessage({ type: "error", text: "Erreur réseau" }); }
    finally { setSavingEmail(false); }
  };

  return (
    <Card>
      <CardTitle><Mail size={16} /> Configuration IMAP manuelle</CardTitle>
      <p className="text-sm text-ink-secondary mb-4">
        Alternative pour les boîtes non-Gmail (Outlook, OVH, etc.) ou configuration manuelle.
      </p>

      {/* Toggle */}
      <div className={`flex items-center gap-4 p-4 rounded-lg border mb-4 transition-colors ${emailConfig.enabled ? "bg-green-50 border-green-200" : "bg-surface-bg border-surface-border"}`}>
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink">Watcher IMAP actif</p>
          <p className="text-xs text-ink-secondary mt-0.5">
            {emailConfig.enabled ? "Votre boîte IMAP est surveillée" : "Activez pour surveiller via IMAP"}
          </p>
        </div>
        <Toggle checked={emailConfig.enabled} onChange={handleEmailChange} name="enabled" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Serveur IMAP</label>
          <input name="imap_host" value={emailConfig.imap_host || ""} onChange={handleEmailChange} className={inputCls} placeholder="imap.gmail.com" />
        </div>
        <div>
          <label className={labelCls}>Port</label>
          <input name="imap_port" type="number" value={emailConfig.imap_port || 993} onChange={handleEmailChange} className={inputCls} placeholder="993" />
        </div>
        <div>
          <label className={labelCls}>Adresse email (login)</label>
          <input name="imap_user" value={emailConfig.imap_user || ""} onChange={handleEmailChange} className={inputCls} placeholder="agence@gmail.com" />
        </div>
        <div>
          <label className={labelCls}>
            Mot de passe / App Password
            {emailConfig.has_password && <span className="ml-2 text-green-600 text-xs font-medium">✓ configuré</span>}
          </label>
          <input name="imap_password" type="password" value={emailConfig.imap_password || ""} onChange={handleEmailChange} className={inputCls} placeholder={emailConfig.has_password ? "Laisser vide pour conserver" : "Mot de passe app Gmail"} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Adresse affichée dans les réponses (optionnel)</label>
          <input name="from_email" value={emailConfig.from_email || ""} onChange={handleEmailChange} className={inputCls} placeholder="contact@mon-agence.fr" />
        </div>
      </div>

      <p className="text-xs text-ink-tertiary bg-surface-bg rounded-lg px-3 py-2 mt-4 border border-surface-border">
        Pour Gmail, utilisez un <strong className="text-ink-secondary">mot de passe d'application</strong> (Compte Google → Sécurité → Mots de passe des applications).
      </p>

      <div className="flex items-center justify-between mt-4">
        <FeedbackMsg msg={emailMessage} />
        <button
          onClick={handleSaveEmailConfig}
          disabled={savingEmail}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={16} /> {savingEmail ? "Sauvegarde…" : "Sauvegarder la config IMAP"}
        </button>
      </div>
    </Card>
  );
}

/* ── Gmail OAuth ─────────────────────────────────────────────────────────── */

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

function GmailConnectSection({ authFetch }) {
  const [status, setStatus] = React.useState(null);
  const [loadingStatus, setLoadingStatus] = React.useState(true);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [message, setMessage] = React.useState(null);

  React.useEffect(() => {
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
      } catch (e) { console.error("Erreur statut Gmail:", e); }
      finally { setLoadingStatus(false); }
    };
    load();
  }, [authFetch]);

  const handleConnect = async () => {
    try {
      const res = await authFetch(API_BASE + "/gmail/connect");
      const data = await res.json();
      if (data?.auth_url) window.location.href = data.auth_url;
      else setMessage({ type: "error", text: "Impossible d'obtenir l'URL de connexion Google." });
    } catch { setMessage({ type: "error", text: "Erreur réseau lors de la connexion Gmail." }); }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Déconnecter Gmail ? Le watcher s'arrêtera.")) return;
    setDisconnecting(true);
    setMessage(null);
    try {
      const res = await authFetch(API_BASE + "/gmail/disconnect", { method: "POST" });
      if (res.ok) { setStatus({ connected: false, email: null }); setMessage({ type: "success", text: "Gmail déconnecté." }); }
      else setMessage({ type: "error", text: "Erreur lors de la déconnexion." });
    } catch { setMessage({ type: "error", text: "Erreur réseau." }); }
    finally { setDisconnecting(false); }
  };

  const isConnected = status?.connected;

  return (
    <div className="bg-white border border-surface-border rounded-xl shadow-card p-6">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-surface-border">
        <GoogleIcon />
        <h3 className="text-sm font-semibold text-ink">Gmail</h3>
      </div>

      {message && <div className="mb-4"><FeedbackMsg msg={message} /></div>}

      {loadingStatus ? (
        <div className="flex items-center gap-2 text-sm text-ink-secondary">
          <Loader2 size={16} className="animate-spin" /> Chargement…
        </div>
      ) : isConnected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
            <Wifi size={18} className="text-green-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-ink truncate">{status.email || "Adresse non disponible"}</span>
                <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-200">Connecté</span>
              </div>
              <p className="text-xs text-green-700 mt-0.5">Watcher actif — surveillance en cours</p>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-all duration-200 disabled:opacity-50"
          >
            <WifiOff size={15} />
            {disconnecting ? "Déconnexion…" : "Déconnecter Gmail"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-4 bg-surface-bg rounded-lg border border-surface-border">
            <div className="flex items-center gap-2">
              <WifiOff size={16} className="text-ink-tertiary" />
              <span className="text-sm font-medium text-ink">Aucune boîte Gmail connectée</span>
            </div>
            <p className="text-xs text-ink-secondary mt-1 ml-6">Connectez Gmail pour activer la surveillance automatique</p>
          </div>
          <button
            onClick={handleConnect}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-all duration-200"
          >
            <GoogleIcon />
            Connecter Gmail
            <ExternalLink size={13} />
          </button>
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <span className="text-amber-700 text-xs mt-0.5">💡</span>
            <p className="text-xs text-amber-700">La connexion se fait en <strong>1 clic</strong> via votre compte Google — aucun mot de passe à saisir.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Outlook OAuth ───────────────────────────────────────────────────────── */

const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 23 23" fill="none">
    <path fill="#f25022" d="M1 1h10v10H1z" />
    <path fill="#7fba00" d="M12 1h10v10H12z" />
    <path fill="#00a4ef" d="M1 12h10v10H1z" />
    <path fill="#ffb900" d="M12 12h10v10H12z" />
  </svg>
);

const OUTLOOK_ERROR_MESSAGES = {
  server_error: "Connexion Outlook annulée ou refusée. Réessayez.",
  access_denied: "Connexion Outlook annulée ou refusée. Réessayez.",
  temporarily_unavailable: "Connexion Outlook annulée ou refusée. Réessayez.",
  missing_config: "Configuration Microsoft manquante. Contactez l'administrateur.",
  invalid_state: "Session expirée. Relancez la connexion depuis le bouton.",
  no_code: "Connexion Outlook annulée ou refusée. Réessayez.",
  already_connected: "Cette boîte Outlook est déjà connectée à une autre agence.",
  token_exchange: "Erreur lors de l'échange de tokens. Vérifiez la configuration Azure.",
  missing_tokens: "Microsoft n'a pas fourni de refresh token. Vérifiez les scopes et le consentement.",
};

function OutlookConnectSection({ authFetch }) {
  const [status, setStatus] = React.useState(null);
  const [loadingStatus, setLoadingStatus] = React.useState(true);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [message, setMessage] = React.useState(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outlookResult = params.get("outlook");
    const outlookEmail = params.get("email");
    if (outlookResult === "success") {
      setMessage({ type: "success", text: "Outlook connecté" + (outlookEmail ? " : " + outlookEmail : "") + " ✅" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (outlookResult === "error") {
      const reason = params.get("reason") || "inconnu";
      setMessage({ type: "error", text: OUTLOOK_ERROR_MESSAGES[reason] || ("Erreur Outlook (" + reason + ")") });
      window.history.replaceState({}, "", window.location.pathname);
    }
    const load = async () => {
      try {
        const res = await authFetch(API_BASE + "/outlook/status");
        if (res.ok) setStatus(await res.json());
      } catch (e) { console.error("Erreur statut Outlook:", e); }
      finally { setLoadingStatus(false); }
    };
    load();
  }, [authFetch]);

  const handleConnect = async () => {
    try {
      const res = await authFetch(API_BASE + "/outlook/connect");
      const data = await res.json();
      if (data?.auth_url) window.location.href = data.auth_url;
      else setMessage({ type: "error", text: "Impossible d'obtenir l'URL de connexion Microsoft." });
    } catch { setMessage({ type: "error", text: "Erreur réseau lors de la connexion Outlook." }); }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Déconnecter Outlook ? La surveillance s'arrêtera.")) return;
    setDisconnecting(true);
    setMessage(null);
    try {
      const res = await authFetch(API_BASE + "/outlook/disconnect", { method: "POST" });
      if (res.ok) { setStatus({ connected: false, email: null }); setMessage({ type: "success", text: "Outlook déconnecté." }); }
      else setMessage({ type: "error", text: "Erreur lors de la déconnexion." });
    } catch { setMessage({ type: "error", text: "Erreur réseau." }); }
    finally { setDisconnecting(false); }
  };

  const isConnected = status?.connected;

  return (
    <div className="bg-white border border-surface-border rounded-xl shadow-card p-6">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-surface-border">
        <MicrosoftIcon />
        <h3 className="text-sm font-semibold text-ink">Outlook / Microsoft 365</h3>
      </div>

      {message && <div className="mb-4"><FeedbackMsg msg={message} /></div>}

      {loadingStatus ? (
        <div className="flex items-center gap-2 text-sm text-ink-secondary">
          <Loader2 size={16} className="animate-spin" /> Chargement…
        </div>
      ) : isConnected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
            <Wifi size={18} className="text-green-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-ink truncate">{status.email || "Adresse non disponible"}</span>
                <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-200">Connecté</span>
              </div>
              <p className="text-xs text-green-700 mt-0.5">Outlook connecté — surveillance en cours</p>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-all duration-200 disabled:opacity-50"
          >
            <WifiOff size={15} />
            {disconnecting ? "Déconnexion…" : "Déconnecter Outlook"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-4 bg-surface-bg rounded-lg border border-surface-border">
            <div className="flex items-center gap-2">
              <WifiOff size={16} className="text-ink-tertiary" />
              <span className="text-sm font-medium text-ink">Aucune boîte Outlook connectée</span>
            </div>
            <p className="text-xs text-ink-secondary mt-1 ml-6">Connectez Outlook / Microsoft 365 pour activer la surveillance automatique</p>
          </div>
          <button
            onClick={handleConnect}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0078d4] hover:bg-[#106ebe] text-white rounded-lg text-sm font-medium transition-all duration-200"
          >
            <MicrosoftIcon />
            Connecter Outlook
            <ExternalLink size={13} />
          </button>
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200 mt-2">
            <span className="text-amber-700 text-xs mt-0.5">💡</span>
            <p className="text-xs text-amber-700">La connexion se fait en <strong>1 clic</strong> via votre compte Microsoft — aucun mot de passe à saisir.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Blacklist ───────────────────────────────────────────────────────────── */

function BlacklistSection({ authFetch }) {
  const [patterns, setPatterns] = React.useState([]);
  const [newPattern, setNewPattern] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    const load = async () => {
      if (!authFetch) return;
      try {
        const res = await authFetch(API_BASE + "/settings/blacklist");
        if (res.ok) setPatterns(await res.json());
      } catch (e) { console.error("Erreur chargement blacklist:", e); }
    };
    load();
  }, [authFetch]);

  const handleAdd = async () => {
    const pattern = newPattern.trim();
    if (!pattern) return;
    setErr(null);
    setLoading(true);
    try {
      const res = await authFetch(API_BASE + "/settings/blacklist", {
        method: "POST", body: JSON.stringify({ pattern }),
      });
      if (res.ok) { const added = await res.json(); setPatterns(prev => [added, ...prev]); setNewPattern(''); }
      else setErr("Erreur lors de l'ajout.");
    } catch { setErr("Erreur réseau."); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    setErr(null);
    try {
      const res = await authFetch(API_BASE + "/settings/blacklist/" + id, { method: "DELETE" });
      if (res.ok) setPatterns(prev => prev.filter(p => p.id !== id));
      else setErr("Erreur lors de la suppression.");
    } catch { setErr("Erreur réseau."); }
  };

  return (
    <Card>
      <CardTitle>Filtres personnalisés (blacklist)</CardTitle>
      <p className="text-sm text-ink-secondary mb-4">
        Les emails dont l'expéditeur contient l'un de ces patterns seront ignorés automatiquement.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          value={newPattern}
          onChange={e => setNewPattern(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAdd()}
          placeholder="ex: @spam.com ou mauvaisexp@"
          className={`${inputCls} flex-1`}
        />
        <button
          onClick={handleAdd}
          disabled={loading || !newPattern.trim()}
          className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          Ajouter
        </button>
      </div>

      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}

      {patterns.length === 0 ? (
        <p className="text-sm text-ink-tertiary">Aucun filtre configuré.</p>
      ) : (
        <div className="space-y-2">
          {patterns.map(p => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 bg-surface-bg rounded-lg border border-surface-border">
              <span className="flex-1 text-sm font-mono text-ink">{p.pattern}</span>
              <button
                onClick={() => handleDelete(p.id)}
                className="text-ink-tertiary hover:text-red-500 transition-colors"
                title="Supprimer"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ── Composant principal ─────────────────────────────────────────────────── */

const SettingsPanel = ({ token, authFetch }) => {
  const [settings, setSettings] = useState({
    company_name: '', agent_name: '', tone: 'pro', signature: '',
    logo: '', auto_reply_enabled: false, auto_reply_delay_minutes: 0,
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
      } catch (err) { console.error("Erreur chargement settings:", err); }
    };
    load();
  }, [authFetch]);

  const handleChange = (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked
              : e.target.type === 'number' ? Number(e.target.value)
              : e.target.value;
    setSettings({ ...settings, [e.target.name]: val });
  };

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
          method: "POST", body: JSON.stringify({ logo_base64: reader.result }),
        });
        if (res.ok) {
          const refresh = await authFetch(API_BASE + "/settings");
          if (refresh.ok) { setSettings(await refresh.json()); setMessage({ type: "success", text: "Logo mis à jour !" }); }
        } else { setMessage({ type: "error", text: "Erreur serveur." }); }
      } catch { setMessage({ type: "error", text: "Erreur réseau." }); }
      finally { setUploading(false); }
    };
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await authFetch(API_BASE + "/settings", {
        method: "PATCH", body: JSON.stringify(settings),
      });
      if (res.ok) setMessage({ type: "success", text: "Paramètres sauvegardés !" });
      else setMessage({ type: "error", text: "Erreur sauvegarde" });
    } catch { setMessage({ type: "error", text: "Erreur réseau" }); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-[960px] mx-auto pb-16 space-y-1">

      {/* Identité */}
      <Card>
        <CardTitle><Building size={16} /> Identité de l'agence</CardTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}><span className="flex items-center gap-1"><Building size={14} /> Nom de l'entreprise</span></label>
            <input name="company_name" value={settings.company_name || ""} onChange={handleChange} className={inputCls} placeholder="Ex: Agence Immobilière" />
          </div>
          <div>
            <label className={labelCls}><span className="flex items-center gap-1"><User size={14} /> Nom de l'Agent IA</span></label>
            <input name="agent_name" value={settings.agent_name || ""} onChange={handleChange} className={inputCls} placeholder="Ex: Sophie" />
          </div>
        </div>
      </Card>

      {/* Logo */}
      <Card>
        <CardTitle><ImageIcon size={16} /> Branding &amp; Logo</CardTitle>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="w-24 h-24 border-2 border-dashed border-surface-border rounded-xl flex items-center justify-center overflow-hidden bg-surface-bg hover:border-primary-600 hover:bg-blue-50/40 transition-all duration-200 cursor-pointer" onClick={() => document.getElementById("logo-upload-input")?.click()}>
            {settings.logo
              ? <img src={settings.logo} alt="Logo" className="max-w-full max-h-full object-contain" />
              : <ImageIcon size={32} className="text-ink-tertiary" />
            }
          </div>
          <div>
            <p className="text-sm font-medium text-ink mb-2">Mettre à jour le logo</p>
            <label className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium cursor-pointer transition-all">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {uploading ? "Traitement…" : "Choisir un fichier"}
              <input id="logo-upload-input" type="file" accept="image/png, image/jpeg" onChange={handleLogoUpload} disabled={uploading} className="hidden" />
            </label>
            <p className="text-xs text-ink-tertiary mt-1.5">PNG, JPEG — recommandé 256×256 px</p>
          </div>
        </div>
      </Card>

      {/* Comportement IA */}
      <Card>
        <CardTitle><PenTool size={16} /> Comportement de l'IA</CardTitle>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Ton de la réponse</label>
            <select name="tone" value={settings.tone || "pro"} onChange={handleChange} className={inputCls + " cursor-pointer"}>
              <option value="pro">👔 Professionnel</option>
              <option value="amical">👋 Amical & Chaleureux</option>
              <option value="direct">⚡ Direct & Concis</option>
              <option value="commercial">💼 Commercial</option>
              <option value="empathique">❤️ Empathique</option>
              <option value="formel">⚖️ Formel</option>
            </select>
          </div>
          <div>
            <label className={labelCls}><span className="flex items-center gap-1"><FileSignature size={14} /> Signature email automatique</span></label>
            <textarea name="signature" value={settings.signature || ""} onChange={handleChange} placeholder={"Cordialement,\nL'équipe"} rows={4} className={inputCls + " resize-vertical"} />
          </div>
        </div>
      </Card>

      {/* Réponse automatique */}
      <Card>
        <CardTitle>Réponse automatique</CardTitle>
        <div className={`flex items-center gap-4 p-4 rounded-lg border mb-4 transition-colors ${settings.auto_reply_enabled ? "bg-green-50 border-green-200" : "bg-surface-bg border-surface-border"}`}>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">Réponse automatique active</p>
            <p className="text-xs text-ink-secondary mt-0.5">
              {settings.auto_reply_enabled
                ? "Les candidatures reçoivent une réponse automatique"
                : "Activez pour envoyer automatiquement les réponses IA"}
            </p>
          </div>
          <Toggle checked={!!settings.auto_reply_enabled} onChange={handleChange} name="auto_reply_enabled" />
        </div>

        {settings.auto_reply_enabled && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200 mb-4">
            <span className="text-amber-700 text-sm">⚠️</span>
            <p className="text-xs text-amber-700">Les emails seront envoyés automatiquement en votre nom</p>
          </div>
        )}

        <div>
          <label className={labelCls}>Délai avant envoi (minutes)</label>
          <input name="auto_reply_delay_minutes" type="number" min="0" value={settings.auto_reply_delay_minutes ?? 0} onChange={handleChange} disabled className={inputCls + " opacity-50 cursor-not-allowed"} />
          <p className="text-xs text-ink-tertiary mt-1">Fonctionnalité en préparation</p>
        </div>
      </Card>

      {/* Bouton sauvegarder */}
      <div className="flex items-center justify-between p-4 bg-surface-bg rounded-xl border border-surface-border mb-6">
        <FeedbackMsg msg={message} />
        {!message && <p className="text-sm text-ink-tertiary">Modifications non enregistrées</p>}
        <button
          onClick={handleSave}
          disabled={loading}
          className="ml-auto flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={16} /> {loading ? "Sauvegarde…" : "Sauvegarder"}
        </button>
      </div>

      {/* Réception des emails */}
      <div>
        <h3 className="text-sm font-semibold text-ink mb-1">Réception des emails</h3>
        <p className="text-sm text-ink-secondary mb-4">
          Connectez votre boîte email pour que CipherFlow traite automatiquement les dossiers locataires entrants.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <GmailConnectSection authFetch={authFetch} />
          <OutlookConnectSection authFetch={authFetch} />
        </div>
      </div>

      <div className="mt-5">
        <ImapConfigSection authFetch={authFetch} />
        <BlacklistSection authFetch={authFetch} />
      </div>
    </div>
  );
};

export default SettingsPanel;
