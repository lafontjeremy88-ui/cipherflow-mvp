import React, { useEffect, useState } from 'react';
import { Save, Building, User, PenTool, FileSignature, Image as ImageIcon, Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

const API_BASE = "[https://cipherflow-mvp-production.up.railway.app](https://cipherflow-mvp-production.up.railway.app)";

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
        const res = await authFetch(`${API_BASE}/settings`);
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
        }
      } catch (err) {
        console.error("Erreur chargement settings:", err);
      }
    };
    load();
  }, [authFetch]);

  const handleChange = (e) => {
    setSettings({ ...settings, [e.target.name]: e.target.value });
  };

  // --- GESTION DU LOGO (CONVERSION BASE64 CÔTÉ CLIENT) ---
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limite de taille simple (ex: 2MB)
    if (file.size > 2 * 1024 * 1024) {
        setMessage({ type: "error", text: "Fichier trop volumineux (Max 2MB)." });
        return;
    }

    setUploading(true);
    setMessage(null);

    // On utilise FileReader pour transformer l'image en chaîne de caractères
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = async () => {
        const base64Str = reader.result;

        try {
            console.log("Envoi du logo en Base64...");

            // On utilise authFetch normalement car c'est du JSON !
            const res = await authFetch(`${API_BASE}/settings/upload-logo`, {
                method: "POST",
                // On envoie un objet JSON
                body: JSON.stringify({ logo_base64: base64Str }), 
            });

            if (res.ok) {
                const refresh = await authFetch(`${API_BASE}/settings`);
                if (refresh.ok) {
                    const data = await refresh.json();
                    setSettings(data);
                    setMessage({ type: "success", text: "Logo mis à jour !" });
                }
            } else {
                const errData = await res.json().catch(() => ({})); 
                console.error("Erreur Upload:", errData);
                setMessage({ type: "error", text: "Erreur serveur." });
            }
        } catch (err) {
            console.error(err);
            setMessage({ type: "error", text: "Erreur réseau." });
        } finally {
            setUploading(false);
        }
    };

    reader.onerror = () => {
        setUploading(false);
        setMessage({ type: "error", text: "Erreur lecture fichier." });
    };
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await authFetch(`${API_BASE}/settings`, {
        method: "POST",
        body: JSON.stringify(settings),
      });
      if (res.ok) setMessage({ type: "success", text: "Paramètres sauvegardés !" });
      else setMessage({ type: "error", text: "Erreur sauvegarde" });
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Erreur réseau" });
    } finally {
      setLoading(false);
    }
  };

  const cardStyle = { background: "#1e293b", padding: "2rem", borderRadius: "12px", marginBottom: "2rem", border: "1px solid #334155" };
  const labelStyle = { display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", color: "#94a3b8", fontSize: "0.9rem", fontWeight: "600" };
  const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: 'white', outline: 'none', fontSize: '1rem' };

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", paddingBottom: "4rem" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.8rem", fontWeight: "bold", color: "white" }}>Paramètres du SaaS</h2>
        <p style={{ color: "#94a3b8" }}>Personnalisez l'identité de votre assistant IA et vos documents.</p>
      </div>

      <div style={cardStyle}>
        <h3 style={{ color: "white", marginBottom: "1.5rem", fontSize: "1.2rem", borderBottom: "1px solid #334155", paddingBottom: "10px" }}>🏢 Identité de l'Entreprise</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div><label style={labelStyle}><Building size={18} /> Nom de l'entreprise</label><input name="company_name" value={settings.company_name || ""} onChange={handleChange} style={inputStyle} placeholder="Ex: Agence Immobilière"/></div>
          <div><label style={labelStyle}><User size={18} /> Nom de l'Agent IA</label><input name="agent_name" value={settings.agent_name || ""} onChange={handleChange} style={inputStyle} placeholder="Ex: Sophie"/></div>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ color: "white", marginBottom: "1.5rem", fontSize: "1.2rem", borderBottom: "1px solid #334155", paddingBottom: "10px" }}>🎨 Branding & Logo</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
          <div style={{ width: "120px", height: "120px", background: "#0f172a", borderRadius: "12px", border: "2px dashed #475569", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {settings.logo ? <img src={settings.logo} alt="Logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <ImageIcon size={40} color="#475569" />}
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Mettre à jour le logo (Fichier image)</label>
            <div style={{ display: "flex", gap: "10px" }}>
              <label style={{ cursor: "pointer", background: uploading ? "#334155" : "#3b82f6", color: "white", padding: "10px 20px", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "10px", fontWeight: "bold", transition: "background 0.2s" }}>
                {uploading ? <Loader2 className="spin" size={20} /> : <Upload size={20} />}
                {uploading ? "Traitement..." : "Choisir un fichier"}
                <input type="file" accept="image/png, image/jpeg, image/jpg" onChange={handleLogoUpload} disabled={uploading} style={{ display: "none" }} />
              </label>
            </div>
            <p style={{ marginTop: "10px", fontSize: "0.8rem", color: "#64748b" }}>Formats supportés : PNG, JPG. L'image sera automatiquement optimisée par le serveur.</p>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ color: "white", marginBottom: "1.5rem", fontSize: "1.2rem", borderBottom: "1px solid #334155", paddingBottom: "10px" }}>🤖 Comportement de l'IA</h3>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}><PenTool size={18} /> Ton de la réponse</label>
          <select name="tone" value={settings.tone || "pro"} onChange={handleChange} style={{ ...inputStyle, cursor: "pointer" }}>
            <option value="pro">Professionnel & Formel</option>
            <option value="amical">Amical & Décontracté</option>
            <option value="direct">Direct & Concis</option>
            <option value="commercial">Commercial & Persuasif</option>
            <option value="emphatique">Empathique & Rassurant</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}><FileSignature size={18} /> Signature d'email automatique</label>
          <textarea name="signature" value={settings.signature || ""} onChange={handleChange} placeholder="Cordialement, L'équipe..." style={{ ...inputStyle, minHeight: "100px", resize: "vertical" }} />
        </div>
      </div>

      <div style={{ position: "sticky", bottom: "20px", background: "#0f172a", padding: "10px", borderTop: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "12px", boxShadow: "0 -4px 20px rgba(0,0,0,0.3)" }}>
        {message ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: message.type === "success" ? "#34d399" : "#f87171", fontWeight: "bold" }}>
            {message.type === "success" ? <CheckCircle size={20} /> : <AlertCircle size={20} />} {message.text}
          </div>
        ) : (<div style={{ color: "#64748b", fontSize: "0.9rem" }}>Modifications non enregistrées</div>)}
        <button onClick={handleSave} disabled={loading || uploading} style={{ background: loading ? "#334155" : "#6366f1", border: "none", color: "white", padding: "12px 24px", borderRadius: "8px", cursor: loading ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "1rem", fontWeight: "bold" }}>
          <Save size={20} /> {loading ? "Sauvegarde..." : "Sauvegarder les paramètres"}
        </button>
      </div>
    </div>
  );
};

export default SettingsPanel;