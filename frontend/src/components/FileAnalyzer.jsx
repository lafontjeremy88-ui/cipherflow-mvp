import React, { useState, useEffect } from 'react';
import { Upload, FileText, Loader, CheckCircle, AlertCircle, Search, Clock } from 'lucide-react';

const FileAnalyzer = ({ token }) => {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]); // État pour l'historique

  // Fonction pour charger l'historique
  const fetchHistory = async () => {
    try {
      const res = await fetch('[https://cipherflow-mvp-production.up.railway.app/api/files/history](https://cipherflow-mvp-production.up.railway.app/api/files/history)', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setHistory(await res.json());
      }
    } catch (e) { console.error("Erreur historique fichiers", e); }
  };

  // Charger l'historique au démarrage
  useEffect(() => {
    fetchHistory();
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setError("");
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch('[https://cipherflow-mvp-production.up.railway.app/api/analyze-file](https://cipherflow-mvp-production.up.railway.app/api/analyze-file)', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}` 
        },
        body: formData
      });

      if (!res.ok) throw new Error("Erreur lors de l'analyse du fichier.");
      
      const data = await res.json();
      setResult(data);
      fetchHistory(); // 🔄 On rafraîchit la liste immédiatement !

    } catch (err) {
      console.error(err);
      setError("Impossible d'analyser ce document.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      
      {/* ZONE D'UPLOAD */}
      <div className="card" style={{ textAlign: 'center', padding: '3rem', border: '2px dashed #334155', backgroundColor: 'rgba(30, 41, 59, 0.5)' }}>
        <input 
          type="file" 
          id="fileInput" 
          onChange={handleFileChange} 
          style={{ display: 'none' }} 
          accept=".pdf,.jpg,.jpeg,.png"
        />
        
        <label htmlFor="fileInput" style={{ cursor: 'pointer' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <Upload size={40} color="#6366f1" />
            </div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                {file ? file.name : "Glissez votre document ici"}
            </h3>
            <p style={{ color: '#94a3b8' }}>
                {file ? "Prêt à être analysé" : "ou cliquez pour sélectionner (PDF, JPG, PNG)"}
            </p>
        </label>

        {file && (
            <button 
                className="btn btn-primary" 
                onClick={handleAnalyze} 
                disabled={loading}
                style={{ marginTop: '1.5rem', padding: '10px 30px' }}
            >
                {loading ? 'Analyse IA en cours...' : 'Lancer l\'analyse'} 
                {!loading && <Search size={18} style={{ marginLeft: '8px' }}/>}
            </button>
        )}
        
        {error && <div style={{ color: '#ef4444', marginTop: '1rem' }}><AlertCircle size={16} style={{display:'inline'}}/> {error}</div>}
      </div>

      {/* RÉSULTATS */}
      {loading && (
          <div style={{ textAlign: 'center', marginTop: '2rem', color: '#94a3b8' }}>
              <Loader size={40} className="spin" style={{ margin: '0 auto 1rem' }} />
              <p>L'IA lit votre document...</p>
          </div>
      )}

      {result && (
        <div className="card" style={{ marginTop: '2rem', borderColor: '#10b981' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#10b981', marginBottom: '1.5rem' }}>
                <CheckCircle size={24} /> Analyse Terminée
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="form-group">
                    <label>Type de Document</label>
                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{result.type || "Inconnu"}</div>
                </div>
                <div className="form-group">
                    <label>Expéditeur / Marque</label>
                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{result.sender || "Non détecté"}</div>
                </div>
                <div className="form-group">
                    <label>Date</label>
                    <div style={{ fontSize: '1.1rem' }}>{result.date || "Non détectée"}</div>
                </div>
                <div className="form-group">
                    <label>Montant Total</label>
                    <div style={{ fontSize: '1.5rem', color: '#6366f1', fontWeight: 'bold' }}>{result.amount || "N/A"}</div>
                </div>
            </div>

            <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>RÉSUMÉ IA</label>
                <p style={{ margin: '5px 0 0 0', lineHeight: '1.5' }}>{result.summary}</p>
            </div>
        </div>
      )}

      {/* HISTORIQUE */}
      <h3 style={{ marginTop: '3rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={20} /> Historique des Documents
      </h3>
      
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                <tr>
                    <th style={{ padding: '12px 20px' }}>Fichier</th>
                    <th style={{ padding: '12px 20px' }}>Type</th>
                    <th style={{ padding: '12px 20px' }}>Expéditeur</th>
                    <th style={{ padding: '12px 20px' }}>Date Doc</th>
                    <th style={{ padding: '12px 20px' }}>Montant</th>
                </tr>
            </thead>
            <tbody>
                {history.length === 0 ? (
                    <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>Aucun document analysé pour l'instant.</td></tr>
                ) : (
                    history.map((doc) => (
                        <tr key={doc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '12px 20px', color: '#94a3b8', fontSize:'0.9rem' }}>{doc.filename}</td>
                            <td style={{ padding: '12px 20px' }}><span className="badge badge-info">{doc.file_type}</span></td>
                            <td style={{ padding: '12px 20px' }}>{doc.sender}</td>
                            <td style={{ padding: '12px 20px' }}>{doc.extracted_date}</td>
                            <td style={{ padding: '12px 20px', fontWeight: 'bold' }}>{doc.amount}</td>
                        </tr>
                    ))
                )}
            </tbody>
        </table>
      </div>

    </div>
  );
};

export default FileAnalyzer;