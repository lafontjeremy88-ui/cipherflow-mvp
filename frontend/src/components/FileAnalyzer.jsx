import React, { useState, useEffect } from 'react';
import { Upload, FileText, Loader, CheckCircle, AlertCircle, Search, Clock } from 'lucide-react';

const FileAnalyzer = ({ token }) => {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);

  // On utilise l'URL relative pour que ça marche partout (local et prod)
  // Si ton frontend et backend sont sur des domaines différents, remets l'URL complète
  const API_URL = "https://cipherflow-mvp-production.up.railway.app"; 

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/api/files/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setHistory(await res.json());
      }
    } catch (e) { console.error("Erreur historique fichiers", e); }
  };

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

    console.log("🚀 CLIC REÇU : Démarrage analyse..."); // Log 1

    const formData = new FormData();
    formData.append("file", file);

    try {
      console.log("📡 Envoi requête vers:", `${API_URL}/api/analyze-file`); // Log 2
      
      const res = await fetch(`${API_URL}/api/analyze-file`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
          // Pas de Content-Type ici, c'est voulu !
        },
        body: formData
      });

      console.log("⬅️ Réponse reçue:", res.status); // Log 3

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Erreur serveur (${res.status}): ${txt}`);
      }
      
      const data = await res.json();
      console.log("✅ Données JSON:", data); // Log 4
      
      setResult(data);
      fetchHistory(); 

    } catch (err) {
      console.error("❌ ERREUR CATCH:", err);
      setError("Erreur : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      
      {/* ZONE D'UPLOAD */}
      <div className="card" style={{ textAlign: 'center', padding: '3rem', border: '2px dashed #334155', backgroundColor: 'rgba(30, 41, 59, 0.5)' }}>
        <input type="file" id="fileInput" onChange={handleFileChange} style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png"/>
        <label htmlFor="fileInput" style={{ cursor: 'pointer' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <Upload size={40} color="#6366f1" />
            </div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>{file ? file.name : "Glissez votre document ici"}</h3>
            <p style={{ color: '#94a3b8' }}>{file ? "Prêt à être analysé" : "PDF, JPG, PNG"}</p>
        </label>
        
        {file && !loading && (
            <button className="btn btn-primary" onClick={handleAnalyze} style={{ marginTop: '1.5rem', padding: '10px 30px' }}>
                Lancer l'analyse <Search size={18} style={{ marginLeft: '8px' }}/>
            </button>
        )}
        
        {loading && (
            <div style={{ marginTop: '1.5rem', color: '#6366f1' }}>
                <Loader size={24} className="spin" style={{ display:'inline-block', verticalAlign:'middle' }} /> Analyse en cours...
            </div>
        )}

        {error && <div style={{ color: '#ef4444', marginTop: '1rem' }}><AlertCircle size={16} style={{display:'inline'}}/> {error}</div>}
      </div>

      {/* RÉSULTAT */}
      {result && (
        <div className="card" style={{ marginTop: '2rem', borderColor: '#10b981' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#10b981', marginBottom: '1.5rem' }}><CheckCircle size={24} /> Résultat</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', textAlign: 'center' }}>
                <div><small style={{color:'#94a3b8'}}>TYPE</small><div style={{fontWeight:'bold'}}>{result.type}</div></div>
                <div><small style={{color:'#94a3b8'}}>EXPÉDITEUR</small><div style={{fontWeight:'bold'}}>{result.sender}</div></div>
                <div><small style={{color:'#94a3b8'}}>DATE</small><div>{result.date}</div></div>
                <div><small style={{color:'#94a3b8'}}>MONTANT</small><div style={{color:'#10b981', fontWeight:'bold', fontSize:'1.1rem'}}>{result.amount}</div></div>
            </div>
        </div>
      )}

      {/* HISTORIQUE */}
      <h3 style={{ marginTop: '3rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={20} /> Historique
      </h3>
      
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                <tr>
                    <th style={{ padding: '12px 20px' }}>Fichier</th>
                    <th style={{ padding: '12px 20px' }}>Type</th>
                    <th style={{ padding: '12px 20px' }}>Expéditeur</th>
                    <th style={{ padding: '12px 20px' }}>Montant</th>
                </tr>
            </thead>
            <tbody>
                {history.length === 0 ? (
                    <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>Aucun document.</td></tr>
                ) : (
                    history.map((doc) => (
                        <tr key={doc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '12px 20px' }}>{doc.filename}</td>
                            <td style={{ padding: '12px 20px' }}><span className="badge badge-info">{doc.file_type}</span></td>
                            <td style={{ padding: '12px 20px' }}>{doc.sender}</td>
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