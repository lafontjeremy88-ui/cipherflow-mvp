import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Loader, CheckCircle, AlertCircle, DollarSign, Calendar, User, X, Download, Eye } from 'lucide-react';

const FileAnalyzer = ({ token }) => {
  const [history, setHistory] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null); // État pour la fenêtre Pop-up
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

  useEffect(() => {
    fetchHistory();
  }, [token]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/files/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setHistory(await res.json());
    } catch (e) { console.error("Erreur historique", e); }
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) processFile(files[0]);
  };

  const handleFileSelect = (e) => {
    if (e.target.files.length > 0) processFile(e.target.files[0]);
  };

  const processFile = async (file) => {
    setIsAnalyzing(true);
    setLastAnalysis(null);
    setError("");

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/api/analyze-file`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) throw new Error("Erreur serveur");

      const data = await res.json();
      setLastAnalysis(data);
      fetchHistory();
    } catch (err) {
      console.error(err);
      setError("Impossible d'analyser ce document.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Fonction de nettoyage
  const cleanData = (data) => {
    if (!data) return "Non détecté";
    if (typeof data === 'string') {
        if (data.startsWith('["') || data.startsWith('{"')) {
            try { return cleanData(JSON.parse(data)); } catch(e) { return data; }
        }
        return data;
    }
    if (typeof data === 'object') {
        if (data.value !== undefined) return `${data.value} ${data.currency || '€'}`;
        if (data.amount !== undefined) return `${data.amount} €`;
        if (data.name) return data.name;
        if (Array.isArray(data)) return data.map(item => item.description || item.name || JSON.stringify(item)).join(", ");
        return Object.values(data)[0] || JSON.stringify(data);
    }
    return data;
  };

  // --- NOUVELLE FONCTION INTELLIGENTE ---
  const handleAction = (docId, mode) => {
    // mode sera soit 'view' (pour voir), soit 'download' (pour télécharger)
    // Cela correspond aux routes que nous avons créées dans le backend
    const url = `${API_BASE}/api/files/${mode}/${docId}`;
    window.open(url, '_blank');
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '2rem' }}>Analyse de Documents</h1>

      {/* ZONE D'UPLOAD */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current.click()}
        style={{
          border: isDragging ? '2px solid #6366f1' : '2px dashed #475569',
          backgroundColor: isDragging ? 'rgba(99,102,241,0.1)' : '#1e293b',
          borderRadius: '16px',
          padding: '4rem 2rem',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          marginBottom: '3rem',
          position: 'relative'
        }}
      >
        <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png" />
        
        {isAnalyzing ? (
          <div style={{ animation: 'pulse 2s infinite' }}>
            <Loader className="spin" size={48} color="#6366f1" style={{ margin: '0 auto 1rem auto' }} />
            <h3 style={{ color: 'white', marginBottom: '0.5rem' }}>Analyse IA en cours...</h3>
            <p style={{ color: '#94a3b8' }}>Lecture intelligente des données</p>
          </div>
        ) : (
          <>
            <div style={{ background: 'rgba(99,102,241,0.2)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
                <Upload size={32} color="#818cf8" />
            </div>
            <h3 style={{ color: 'white', fontSize: '1.2rem', marginBottom: '0.5rem' }}>
              {isDragging ? "Lâchez pour analyser" : "Glissez votre document ici"}
            </h3>
            <p style={{ color: '#94a3b8' }}>PDF, Factures, Devis (JPG/PNG)</p>
          </>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={20} /> {error}
        </div>
      )}

      {/* RÉSULTAT DERNIÈRE ANALYSE */}
      {lastAnalysis && (
        <div style={{ background: '#1e293b', border: '1px solid #6366f1', borderRadius: '16px', overflow: 'hidden', marginBottom: '3rem', boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.1)' }}>
            <div style={{ background: 'rgba(99,102,241,0.1)', padding: '1rem 1.5rem', borderBottom: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle size={20} color="#818cf8" /> <span style={{ fontWeight: 'bold', color: '#818cf8' }}>Analyse Terminée</span>
            </div>
            <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
                <div><div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '8px' }}>EXPÉDITEUR</div><div style={{ fontSize: '1.1rem', fontWeight: '600' }}>{cleanData(lastAnalysis.sender)}</div></div>
                <div><div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '8px' }}>MONTANT TOTAL</div><div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#34d399' }}>{cleanData(lastAnalysis.amount)}</div></div>
                <div><div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '8px' }}>DATE</div><div style={{ fontSize: '1.1rem', fontWeight: '600' }}>{cleanData(lastAnalysis.date)}</div></div>
            </div>
        </div>
      )}

      {/* TABLEAU HISTORIQUE */}
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', marginBottom: '1.5rem' }}>
        <FileText size={20} color="#94a3b8"/> Documents Récents
      </h3>

      <div style={{ background: '#1e293b', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: '#94a3b8', textAlign: 'left' }}>
              <th style={{ padding: '1rem' }}>Document</th>
              <th style={{ padding: '1rem' }}>Expéditeur</th>
              <th style={{ padding: '1rem' }}>Date</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Montant</th>
            </tr>
          </thead>
          <tbody>
            {history.map((doc) => (
              <tr 
                key={doc.id} 
                onClick={() => setSelectedDoc(doc)} 
                className="clickable-row"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'background 0.2s' }}
                onMouseOver={(e) => e.currentTarget.style.background = '#334155'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: '500', color: 'white' }}>{doc.filename ? (doc.filename.length > 25 ? doc.filename.substring(0,25)+'...' : doc.filename) : "Sans nom"}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6366f1', marginTop: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>{doc.file_type || "Fichier"}</div>
                </td>
                <td style={{ padding: '1rem', color: '#cbd5e1' }}>{cleanData(doc.sender)}</td>
                <td style={{ padding: '1rem', color: '#94a3b8' }}>{cleanData(doc.extracted_date)}</td>
                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: '#e2e8f0' }}>{cleanData(doc.amount)}</td>
              </tr>
            ))}
            {history.length === 0 && <tr><td colSpan="4" style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Aucun document.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* --- MODALE DE DÉTAIL (POP-UP) --- */}
      {selectedDoc && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(5px)' }}>
            <div style={{ background: '#1e293b', padding: '2rem', borderRadius: '16px', width: '90%', maxWidth: '600px', border: '1px solid #334155', position: 'relative', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
                <button onClick={() => setSelectedDoc(null)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={24}/></button>
                
                <h2 style={{ marginBottom: '0.5rem', fontSize: '1.4rem' }}>Détails du Document</h2>
                <div style={{ color: '#6366f1', fontSize: '0.9rem', marginBottom: '1.5rem', textTransform: 'uppercase', fontWeight: 'bold' }}>{selectedDoc.file_type || "Fichier"}</div>

                <div style={{ background: '#0f172a', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div><label style={{color:'#94a3b8', fontSize:'0.8rem'}}>EXPÉDITEUR</label><div style={{fontWeight:'bold'}}>{cleanData(selectedDoc.sender)}</div></div>
                        <div><label style={{color:'#94a3b8', fontSize:'0.8rem'}}>DATE</label><div style={{fontWeight:'bold'}}>{cleanData(selectedDoc.extracted_date)}</div></div>
                        <div style={{gridColumn: 'span 2'}}><label style={{color:'#94a3b8', fontSize:'0.8rem'}}>MONTANT DÉTECTÉ</label><div style={{fontWeight:'bold', color: '#34d399', fontSize: '1.2rem'}}>{cleanData(selectedDoc.amount)}</div></div>
                    </div>
                </div>

                <div style={{ marginBottom: '2rem' }}>
                    <label style={{color:'#94a3b8', fontSize:'0.8rem', display:'block', marginBottom:'5px'}}>RÉSUMÉ IA</label>
                    <p style={{ color: '#cbd5e1', lineHeight: '1.6', fontSize: '0.95rem' }}>{cleanData(selectedDoc.summary)}</p>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    {/* BOUTON VOIR -> appelle /view/ */}
                    <button onClick={() => handleAction(selectedDoc.id, 'view')} style={{ flex: 1, background: '#6366f1', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold' }}>
                        <Eye size={18}/> Voir le document
                    </button>
                    
                    {/* BOUTON TÉLÉCHARGER -> appelle /download/ */}
                    <button onClick={() => handleAction(selectedDoc.id, 'download')} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid #334155', padding: '12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <Download size={18}/> Télécharger
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default FileAnalyzer;