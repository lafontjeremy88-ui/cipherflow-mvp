import React, { useState, useEffect } from 'react';
import { Save, Building, User, PenTool, FileSignature } from 'lucide-react';

// 1. On récupère 'token'
const SettingsPanel = ({ token }) => {
  const [settings, setSettings] = useState({
    company_name: '',
    agent_name: '',
    tone: '',
    signature: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!token) return;

    // 2. Authorization pour le chargement (MISE À JOUR URL)
    fetch('https://cipherflow-mvp-production.up.railway.app/settings', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => {
        if (res.status === 401) throw new Error("Non autorisé");
        return res.json();
      })
      .then(data => setSettings(data))
      .catch(err => console.error("Erreur chargement settings:", err));
  }, [token]);

  const handleChange = (e) => {
    setSettings({ ...settings, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);
    try {
      // 3. Authorization pour la sauvegarde (MISE À JOUR URL)
      const res = await fetch('https://cipherflow-mvp-production.up.railway.app/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // <--- CLÉ
        },
        body: JSON.stringify(settings)
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: "✅ Configuration sauvegardée avec succès !" });
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error("Erreur serveur");
      }
    } catch (e) {
      setMessage({ type: 'error', text: "❌ Erreur lors de la sauvegarde." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚙️ Configuration de l'IA</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Personnalisez l'identité de votre assistant. Ces réglages influencent toutes les futures réponses.
        </p>
      </div>

      <div className="card">
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building size={16} color="var(--accent)" /> Nom de l'entreprise
          </label>
          <input name="company_name" value={settings.company_name} onChange={handleChange} placeholder="Ex: Garage Durand" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={16} color="var(--accent)" /> Nom de l'Agent IA
            </label>
            <input name="agent_name" value={settings.agent_name} onChange={handleChange} placeholder="Ex: Sophie" />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PenTool size={16} color="var(--accent)" /> Ton de la réponse
            </label>
            <select name="tone" value={settings.tone} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', backgroundColor: 'var(--bg-app)', color: 'white', border: '1px solid var(--border)' }}>
              <option value="professionnel et empathique">Professionnel & Empathique</option>
              <option value="strict et formel">Strict & Formel</option>
              <option value="joyeux et décontracté">Joyeux & Décontracté</option>
              <option value="court et direct">Court & Direct</option>
              <option value="commercial et vendeur">Commercial & Vendeur</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSignature size={16} color="var(--accent)" /> Signature des emails
          </label>
          <textarea name="signature" value={settings.signature} onChange={handleChange} rows={3} placeholder="Ex: Cordialement, L'équipe..." />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
            {loading ? 'Sauvegarde...' : 'Sauvegarder les paramètres'}
            <Save size={18} />
          </button>
          {message && (
            <span style={{ color: message.type === 'success' ? 'var(--success)' : 'var(--danger)', fontWeight: '500', animation: 'fadeIn 0.3s' }}>
              {message.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;