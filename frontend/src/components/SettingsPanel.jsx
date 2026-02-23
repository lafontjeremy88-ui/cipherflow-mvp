import React, { useEffect, useState } from 'react';
import { Save, Building, User, PenTool, FileSignature, Image as ImageIcon, Upload, Loader2, CheckCircle, AlertCircle, Mail, Power } from 'lucide-react';

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

const SettingsPanel = ({ token, authFetch }) => {
  const [settings, setSettings] = useState({
    company_name: '',
    agent_name: '',
    tone: 'pro',
    signature: '',
    logo: ''
  });

  const [emailConfig, setEmailConfig] = useState({
    enabled: false,
    imap_host: '',
    imap_port: 993,
    imap_user: '',
    imap_password: '',
    from_email: '',
    has_password: false,
  });

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [message, setMessage] = useState(null);
  const [emailMessage, setEmailMessage] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!authFetch) return;
      try {
        const [resSettings, resEmail] = await Promise.all([
          authFetch(`${API_BASE}/settings`),
          authFetch(`${API_BASE}/settings/email-config`),
        ]);
        if (resSettings.ok) setSettings(await resSettings.json());
        if (resEmail.ok) setEmailConfig(await resEmail.json());
      } catch (err) {
        console.error("Erreur chargement settings:", err);
      }
    };
    load();
  }, [authFetch]);

  const handleChange = (e) => setSettings({ ...settings, [e.target.name]: e.target.value });
  const handleEmailChange = (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setEmailConfig({ ...emailConfig, [e.target.name]: val });
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
        const res = await authFetch(`${API_BASE}/settings/upload-logo`, {
          method: "POST",
          body: JSON.stringify({ logo_base64: reader.result }),
        });
        if (res.ok) {
          const refresh = await authFetch(`${API_BASE}/settings`);
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
      const res = await authFetch(`${API_BASE}/settings`, {
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
      // N'envoyer le mot de passe que s'il a été modifié
      if (emailConfig.imap_password) {
        body.imap_password = emailConfig.imap_password;
      }
      const res = await authFetch(`${API_BASE}/settings/email-config`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEmailMessage({ type: "success", text: "Configuration email sauvegardée !" });
        setEmailConfig({ ...emailConfig, imap_password: '', has_password: true });
      } else {
        setEmailMessage({ type: "error", text: "Erreur sauvegarde" });
      }
    } catch {
      setEmailMessage({ type: "error", text: "Erreur réseau" });
    } finally {
      setSavingEmail(false);
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
          <textarea name="signature" value={settings.signature || ""} onChange={handleChange} placeholder="Cordialement,\nL'équipe" style={{ ...inputStyle, minHeight: "100px", resize: "vertical" }} />
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

      {/* ── Configuration Email IMAP ── */}
      <div style={cardStyle}>
        <h3 style={{ color: "white", marginBottom: "0.5rem", fontSize: "1.2rem", borderBottom: "1px solid #334155", paddingBottom: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
          <Mail size={20} /> Réception automatique des emails
        </h3>
        <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
          Connectez votre boîte email pour que CipherFlow traite automatiquement les dossiers locataires entrants.
        </p>

        {/* Toggle activation */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "1.5rem", padding: "1rem", background: emailConfig.enabled ? "#0d2818" : "#1a1a2e", borderRadius: "8px", border: `1px solid ${emailConfig.enabled ? "#16a34a" : "#334155"}` }}>
          <Power size={20} color={emailConfig.enabled ? "#34d399" : "#64748b"} />
          <div style={{ flex: 1 }}>
            <div style={{ color: "white", fontWeight: "bold" }}>Watcher actif</div>
            <div style={{ color: "#64748b", fontSize: "0.8rem" }}>
              {emailConfig.enabled ? "Votre boîte email est surveillée automatiquement" : "Activez pour surveiller votre boîte email"}
            </div>
          </div>
          <label style={{ position: "relative", display: "inline-block", width: "52px", height: "28px" }}>
            <input type="checkbox" name="enabled" checked={emailConfig.enabled} onChange={handleEmailChange} style={{ opacity: 0, width: 0, height: 0 }} />
            <span style={{
              position: "absolute", cursor: "pointer", top: 0, left: 0, right: 0, bottom: 0,
              background: emailConfig.enabled ? "#16a34a" : "#334155",
              borderRadius: "28px", transition: "0.3s",
            }}>
              <span style={{
                position: "absolute", content: "", height: "20px", width: "20px",
                left: emailConfig.enabled ? "28px" : "4px", bottom: "4px",
                background: "white", borderRadius: "50%", transition: "0.3s",
              }} />
            </span>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.2rem" }}>
          <div>
            <label style={labelStyle}>Serveur IMAP</label>
            <input name="imap_host" value={emailConfig.imap_host || ""} onChange={handleEmailChange} style={inputStyle} placeholder="imap.gmail.com" />
          </div>
          <div>
            <label style={labelStyle}>Port</label>
            <input name="imap_port" type="number" value={emailConfig.imap_port || 993} onChange={handleEmailChange} style={inputStyle} placeholder="993" />
          </div>
          <div>
            <label style={labelStyle}>Adresse email (login)</label>
            <input name="imap_user" value={emailConfig.imap_user || ""} onChange={handleEmailChange} style={inputStyle} placeholder="agence@gmail.com" />
          </div>
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
            <Save size={18} /> {savingEmail ? "Sauvegarde..." : "Sauvegarder la config email"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
