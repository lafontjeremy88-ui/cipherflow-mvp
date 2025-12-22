import React, { useEffect, useState } from 'react';
import { Save, Building, User, PenTool, FileSignature, Image as ImageIcon } from 'lucide-react';
// ❌ On retire apiFetch
// import { apiFetch } from "../services/api";

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

const SettingsPanel = ({ token, authFetch }) => { // ✅ authFetch ajouté
  const [settings, setSettings] = useState({
    company_name: '',
    agent_name: '',
    tone: '',
    signature: '',
    logo: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (!authFetch) return;
        const res = await authFetch(`${API_BASE}/settings`);
        if (res?.ok) {
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

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const res = await authFetch(`${API_BASE}/settings`, {
        method: "POST",
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "✅ Paramètres sauvegardés !" });
      } else {
        setMessage({ type: "error", text: "❌ Erreur sauvegarde" });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "❌ Erreur réseau" });
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #374151',
    background: '#111827',
    color: 'white',
    outline: 'none'
  };

  return (
    <div style={{ padding: 20, color: "white" }}>
      <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 12 }}>
        Paramètres
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, opacity: 0.85 }}>
            <Building size={16} /> Nom entreprise
          </div>
          <input name="company_name" value={settings.company_name || ""} onChange={handleChange} style={inputStyle} />
        </div>

        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, opacity: 0.85 }}>
            <User size={16} /> Nom agent
          </div>
          <input name="agent_name" value={settings.agent_name || ""} onChange={handleChange} style={inputStyle} />
        </div>

        <div style={{ gridColumn: "span 2" }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, opacity: 0.85 }}>
            <PenTool size={16} /> Ton
          </div>
          <input name="tone" value={settings.tone || ""} onChange={handleChange} style={inputStyle} />
        </div>

        <div style={{ gridColumn: "span 2" }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, opacity: 0.85 }}>
            <FileSignature size={16} /> Signature
          </div>
          <textarea
            name="signature"
            value={settings.signature || ""}
            onChange={handleChange}
            style={{ ...inputStyle, minHeight: 90 }}
          />
        </div>

        <div style={{ gridColumn: "span 2" }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, opacity: 0.85 }}>
            <ImageIcon size={16} /> Logo (URL)
          </div>
          <input name="logo" value={settings.logo || ""} onChange={handleChange} style={inputStyle} />
        </div>
      </div>

      {message && (
        <div style={{ marginTop: 12, opacity: 0.95, color: message.type === "success" ? "#34d399" : "#fca5a5" }}>
          {message.text}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={loading}
        style={{
          marginTop: 14,
          background: loading ? "#374151" : "#3b82f6",
          border: "none",
          color: "white",
          padding: "10px 14px",
          borderRadius: 10,
          cursor: loading ? "not-allowed" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8
        }}
      >
        <Save size={16} />
        {loading ? "Sauvegarde..." : "Sauvegarder"}
      </button>
    </div>
  );
};

export default SettingsPanel;