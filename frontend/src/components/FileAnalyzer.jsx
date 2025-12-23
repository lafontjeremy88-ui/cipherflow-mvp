import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, History } from 'lucide-react';

// ✅ URL PROPRE (Sans crochets)
const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

const FileAnalyzer = ({ token }) => { 
  // NOTE: On retire 'authFetch' des props ici pour l'upload, on utilise fetch natif.
  
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  // Fonction pour charger l'historique
  const fetchHistory = async () => {
    if (!token) return;
    setLoadingHistory(true);
    try {
      // Fetch natif pour la lecture (GET)
      const res = await fetch(`${API_BASE}/api/files/history`, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      } else {
        console.error("Erreur historique:", res.status);
      }
    } catch (e) {
      console.error("Erreur chargement historique", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [token]);

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = (e) => {
    setError("");
    setResult(null);
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
  };

  // --- C'EST ICI QUE LA CORRECTION OPÈRE ---
  const handleAnalyze = async () => {
    if (!file) {
      setError("Choisis un fichier d’abord.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append('file', file); // Le champ DOIT s'appeler 'file'

    try {
      console.log("Envoi du fichier...", file.name);

      // 1. On utilise fetch NATIF
      // 2. On met le Header Authorization
      // 3. IMPORTANT: On NE MET PAS "Content-Type". Le navigateur le fera tout seul.
      const res = await fetch(`${API_BASE}/api/analyze-file`, {
        method: "POST",
        headers: {
             "Authorization": `Bearer ${token}` 
        },
        body: formData,
      });

      // Lecture de la réponse brute pour éviter le crash JSON immédiat
      const responseText = await res.text();
      console.log("Réponse serveur:", responseText);

      if (!res.ok) {
        // On essaie de parser l'erreur pour l'afficher proprement
        try {
            const errJson = JSON.parse(responseText);
            // Si le serveur renvoie un détail précis, on l'affiche
            const detail = errJson.detail || JSON.stringify(errJson);
            throw new Error(`Erreur serveur : ${detail}`);
        } catch (parseError) {
            // Sinon on affiche le texte brut
            throw new Error(`Erreur ${res.status}: ${responseText}`);
        }
      }

      // Si tout est OK
      const data = JSON.parse(responseText);
      setResult(data);
      await fetchHistory();
    } catch (e) {
      console.error("Erreur Catch:", e);
      setError(e.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  const card = { background: "#111827", color: "white", borderRadius: 12, padding: 16, boxShadow: "0 4px 20px rgba(0,0,0,0.25)" };

  return (
    <div style={{ padding: 20, color: "white" }}>
      <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 12 }}>
        <FileText size={20} style={{ marginRight: 8 }} /> Analyse de fichiers
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Carte Upload */}
        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Uploader un fichier</div>
          <input ref={fileInputRef} type="file" onChange={handleFileChange} style={{ display: "none" }} />
          
          <button onClick={handlePickFile} style={{ background: "#1f2937", border: "none", color: "white", padding: "10px 14px", borderRadius: 10, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Upload size={16} /> Choisir un fichier
          </button>

          {file && <div style={{ marginTop: 12, opacity: 0.9 }}>Fichier : <b>{file.name}</b></div>}

          <button onClick={handleAnalyze} disabled={loading} style={{ marginTop: 12, background: loading ? "#374151" : "#3b82f6", border: "none", color: "white", padding: "10px 14px", borderRadius: 10, cursor: loading ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
            {loading ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
            {loading ? "Analyse..." : "Analyser"}
          </button>

          {error && <div style={{ marginTop: 12, color: "#fca5a5", fontSize: "0.9em", wordBreak: "break-word", padding: 10, background: 'rgba(255,0,0,0.1)', borderRadius: 5 }}> <AlertCircle size={16} style={{display:'inline', marginRight:5}}/> {error}</div>}
        </div>

        {/* Carte Résultat */}
        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Résultat</div>
          {!result ? (
            <div style={{ opacity: 0.8 }}>Aucun résultat pour le moment.</div>
          ) : (
            <div style={{ fontSize: 13 }}>
                <p><b>Type:</b> {result.type}</p>
                <p><b>Expéditeur:</b> {result.sender}</p>
                <p><b>Date:</b> {result.date}</p>
                <p><b>Montant:</b> {result.amount}</p>
                <div style={{background: 'rgba(255,255,255,0.1)', padding: 10, borderRadius: 6, marginTop: 10}}>
                    {result.summary}
                </div>
            </div>
          )}
        </div>

        {/* Carte Historique */}
        <div style={{ ...card, gridColumn: "span 2" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 900 }}><History size={16} style={{ marginRight: 8 }} /> Historique</div>
            <button onClick={fetchHistory} style={{ background: "#1f2937", border: "none", color: "white", padding: "8px 12px", borderRadius: 10, cursor: "pointer" }}><Loader2 size={16} /></button>
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {history.length === 0 && <div style={{ opacity: 0.8 }}>Aucun historique disponible.</div>}
            {history.map((h) => (
              <div key={h.id} style={{ background: "#1f2937", padding: 12, borderRadius: 10, display:'flex', justifyContent:'space-between' }}>
                <div>
                    <div style={{ fontWeight: 800 }}>{h.filename}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{h.file_type} - {h.amount}</div>
                </div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{h.extracted_date}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileAnalyzer;