import React, { useState, useEffect } from 'react';
import { Save, Building, User, PenTool, FileSignature, Image as ImageIcon } from 'lucide-react';

const SettingsPanel = ({ token }) => {
  const [settings, setSettings] = useState({
    company_name: '',
    agent_name: '',
    tone: '',
    signature: '',
    logo: '' // Nouveau champ pour le logo
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!token) return;

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

  // --- NOUVELLE FONCTION : Convertir l'image en texte (Base64) ---
  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 2 * 1024 * 1024) {
            alert("L'image est trop lourde ! Essayez un logo plus petit (moins de 2Mo).");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setSettings({ ...settings, logo: reader.result });
        };
        reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('https://cipherflow-mvp-production.up.railway.app/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: "✅ Configuration (et logo) sauvegardée !" });
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
          Personnalisez l'identité de votre assistant et votre image de marque (Logo).
        </p>
      </div>

      <div className="card">
        
        {/* --- NOUVEAU BLOC LOGO --- */}
        <div className="form-group" style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <ImageIcon size={16} color="var(--accent)" /> Logo de l'entreprise
            </label>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ 
                    width: '100px', 
                    height: '100px', 
                    border: '2px dashed var(--border)', 
                    borderRadius: '8px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    overflow: 'hidden',
                    background: 'white' 
                }}>
                    {settings.logo ? (
                        <img src={settings.logo} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                    ) : (
                        <span style={{ fontSize: '0.8rem', color: '#888' }}>Aucun</span>
                    )}
                </div>

                <div>
                    <input 
                        type="file" 
                        accept="image/*" 
                        id="logo-upload" 
                        onChange={handleLogoUpload} 
                        style={{ display: 'none' }} 
                    />
                    <label 
                        htmlFor="logo-upload" 
                        className="btn btn-secondary"
                        style={{ cursor: 'pointer', padding: '8px 16px', background: '#334155', color: 'white', borderRadius: '6px' }}
                    >
                        Choisir une image...
                    </label>
                    <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '5px' }}>Format: PNG, JPG (Max 2Mo)</p>
                </div>
            </div>
        </div>

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