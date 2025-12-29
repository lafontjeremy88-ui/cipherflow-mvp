import React, { useState, useEffect } from "react";
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2, Download, RefreshCw, FileCheck, Trash2, Eye } from "lucide-react";

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

const FileAnalysis = ({ token, authFetch }) => {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [authFetch]);

  const fetchHistory = async () => {
    if (!authFetch) return;
    setHistoryLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/files/history`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (error) {
      console.error("Erreur historique:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setAnalysis(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setAnalysis(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await authFetch(`${API_BASE}/api/analyze-file`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
        fetchHistory();
      } else {
        alert("Erreur lors de l'analyse");
      }
    } catch (error) {
      console.error(error);
      alert("Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  // --- 👁️ NOUVELLE FONCTION : VISIONNER ---
  const handleView = async (id) => {
    if (!authFetch) return;
    try {
        // On appelle l'endpoint "view" du backend
        const res = await authFetch(`${API_BASE}/api/files/view/${id}`);
        if (res.ok) {
            // On transforme la réponse en "Blob" (fichier en mémoire)
            const blob = await res.blob();
            // On crée une URL temporaire locale
            const url = window.URL.createObjectURL(blob);
            // On ouvre cette URL dans un nouvel onglet
            window.open(url, '_blank');
        } else {
            alert("Impossible de visualiser le fichier.");
        }
    } catch (e) {
        console.error(e);
        alert("Erreur lors de l'ouverture.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Voulez-vous vraiment supprimer ce document ?")) return;
    try {
      const res = await authFetch(`${API_BASE}/api/files/${id}`, { method: "DELETE" });
      if (res.ok) {
        setHistory(history.filter(f => f.id !== id));
      } else {
        alert("Erreur lors de la suppression.");
      }
    } catch (err) {
      console.error(err);
      alert("Erreur réseau.");
    }
  };

  const getTypeBadgeStyle = (type) => {
    const t = (type || "").toLowerCase();
    if (t.includes("facture") || t.includes("invoice")) return { bg: "rgba(59, 130, 246, 0.2)", text: "#60a5fa" };
    if (t.includes("contrat") || t.includes("bail")) return { bg: "rgba(168, 85, 247, 0.2)", text: "#c084fc" };
    if (t.includes("paie") || t.includes("salaire") || t.includes("bulletin")) return { bg: "rgba(16, 185, 129, 0.2)", text: "#34d399" };
    if (t.includes("impôt") || t.includes("tax")) return { bg: "rgba(245, 158, 11, 0.2)", text: "#fbbf24" };
    return { bg: "rgba(148, 163, 184, 0.2)", text: "#cbd5e1" };
  };

  // --- LOGIQUE SOLVABILITÉ ---
  const renderSolvencyBadge = (doc) => {
    const rawString = String(doc.amount).replace(/[^0-9.,]/g, "").replace(",", ".");
    const rawAmount = parseFloat(rawString);
    
    const type = (doc.file_type || "").toLowerCase();
    const isIncome = type.includes("paie") || type.includes("salaire") || type.includes("impôt");

    if (!isIncome || isNaN(rawAmount) || rawAmount === 0) {
      return <span style={{ color: "white", fontWeight: "bold" }}>{doc.amount}</span>;
    }

    const LOYER_REFERENCE = 600;
    const ratio = rawAmount / LOYER_REFERENCE;

    if (ratio >= 3) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={{ color: "white", fontWeight: "bold" }}>{doc.amount}</span>
          <span style={{ fontSize: "0.7rem", color: "#10b981", background: "rgba(16,185,129,0.1)", padding: "2px 6px", borderRadius: "4px", marginTop: "4px", display: "inline-flex", alignItems: "center", gap: "4px", border: "1px solid rgba(16,185,129,0.2)" }}>
            <CheckCircle size={10} /> Solvable ({ratio.toFixed(1)}x)
          </span>
        </div>
      );
    } else if (ratio >= 2.5) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={{ color: "white", fontWeight: "bold" }}>{doc.amount}</span>
          <span style={{ fontSize: "0.7rem", color: "#f59e0b", background: "rgba(245,158,11,0.1)", padding: "2px 6px", borderRadius: "4px", marginTop: "4px", border: "1px solid rgba(245,158,11,0.2)" }}>
            Dossier Juste ({ratio.toFixed(1)}x)
          </span>
        </div>
      );
    } else {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={{ color: "white", fontWeight: "bold" }}>{doc.amount}</span>
          <span style={{ fontSize: "0.7rem", color: "#ef4444", background: "rgba(239,68,68,0.1)", padding: "2px 6px", borderRadius: "4px", marginTop: "4px", display: "inline-flex", alignItems: "center", gap: "4px", border: "1px solid rgba(239,68,68,0.2)" }}>
            <AlertTriangle size={10} /> Risqué ({ratio.toFixed(1)}x)
          </span>
        </div>
      );
    }
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "4rem" }}>
      
      {/* HEADER */}
      <div style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.8rem", fontWeight: "bold", color: "white", display: "flex", alignItems: "center", gap: "10px" }}>
          <FileCheck size={28} color="#6366f1" /> Vérification de Dossiers
        </h2>
        <p style={{ color: "#94a3b8" }}>Analysez automatiquement les pièces justificatives des locataires.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "3rem" }}>
        
        {/* ZONE D'UPLOAD */}
        <div className="card" style={{ background: "#1e293b", padding: "2rem", borderRadius: "12px", border: "1px solid #334155" }}>
          <h3 style={{ color: "white", marginBottom: "1.5rem", fontSize: "1.1rem", fontWeight: "bold" }}>Nouveau Document</h3>
          
          <div 
            style={{ 
              border: "2px dashed #475569", 
              borderRadius: "12px", 
              padding: "3rem", 
              textAlign: "center", 
              background: "#0f172a",
              cursor: "pointer",
              transition: "border-color 0.2s"
            }}
            onClick={() => document.getElementById("fileInput").click()}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = "#6366f1"}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = "#475569"}
          >
            <input 
              id="fileInput" 
              type="file" 
              accept=".pdf,.jpg,.png,.jpeg" 
              onChange={handleFileChange} 
              style={{ display: "none" }} 
            />
            
            <div style={{ background: "rgba(99, 102, 241, 0.1)", width: "60px", height: "60px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem auto" }}>
              <Upload size={28} color="#6366f1" />
            </div>
            
            {file ? (
              <div>
                <p style={{ color: "white", fontWeight: "bold", fontSize: "1.1rem" }}>{file.name}</p>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : (
              <div>
                <p style={{ color: "white", fontWeight: "bold", marginBottom: "5px" }}>Cliquez pour déposer un dossier</p>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>PDF, JPG, PNG acceptés</p>
              </div>
            )}
          </div>

          <button 
            onClick={handleAnalyze} 
            disabled={!file || loading}
            style={{ 
              width: "100%", 
              marginTop: "1.5rem", 
              padding: "14px", 
              background: loading ? "#334155" : "#6366f1", 
              color: "white", 
              border: "none", 
              borderRadius: "8px", 
              fontWeight: "bold", 
              cursor: loading || !file ? "not-allowed" : "pointer",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "10px"
            }}
          >
            {loading ? <><Loader2 className="spin" /> Analyse IA en cours...</> : "Lancer l'analyse"}
          </button>
        </div>

        {/* RÉSULTAT ANALYSE LIVE */}
        <div className="card" style={{ background: "#1e293b", padding: "2rem", borderRadius: "12px", border: "1px solid #334155", display: "flex", flexDirection: "column" }}>
          <h3 style={{ color: "white", marginBottom: "1.5rem", fontSize: "1.1rem", fontWeight: "bold" }}>Résultat de l'analyse</h3>
          
          {analysis ? (
            <div style={{ flex: 1, animation: "fadeIn 0.3s" }}>
              <div style={{ padding: "1.5rem", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "12px", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#34d399", fontWeight: "bold", marginBottom: "5px" }}>
                  <CheckCircle size={20} /> Analyse Terminée
                </div>
                <p style={{ color: "#e2e8f0", fontSize: "0.9rem" }}>Le document a été traité avec succès.</p>
              </div>

              <div style={{ display: "grid", gap: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #334155", paddingBottom: "10px" }}>
                  <span style={{ color: "#94a3b8" }}>Type détecté</span>
                  <span style={{ color: "white", fontWeight: "bold" }}>{analysis.type || "Inconnu"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #334155", paddingBottom: "10px" }}>
                  <span style={{ color: "#94a3b8" }}>Source</span>
                  <span style={{ color: "white", fontWeight: "bold" }}>{analysis.sender || "Non identifié"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #334155", paddingBottom: "10px" }}>
                  <span style={{ color: "#94a3b8" }}>Revenu / Montant</span>
                  <span style={{ color: "#6366f1", fontWeight: "bold", fontSize: "1.1rem" }}>{analysis.amount}</span>
                </div>
              </div>

              <div style={{ marginTop: "1.5rem" }}>
                <span style={{ color: "#94a3b8", display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Résumé IA</span>
                <div style={{ background: "#0f172a", padding: "1rem", borderRadius: "8px", color: "#cbd5e1", lineHeight: "1.5" }}>
                  {analysis.summary}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#64748b", border: "2px dashed #334155", borderRadius: "12px" }}>
              <FileText size={48} style={{ marginBottom: "1rem", opacity: 0.5 }} />
              <p>Les résultats de l'analyse s'afficheront ici.</p>
            </div>
          )}
        </div>
      </div>

      {/* HISTORIQUE DES DOCUMENTS */}
      <div style={{ borderTop: "1px solid #334155", paddingTop: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "1.4rem", fontWeight: "bold", color: "white" }}>📂 Documents Traités</h3>
          <button onClick={fetchHistory} style={{ background: "transparent", border: "none", color: "#6366f1", cursor: "pointer" }}><RefreshCw size={20} /></button>
        </div>

        {historyLoading ? (
          <div style={{ color: "#94a3b8", textAlign: "center", padding: "20px" }}>Chargement...</div>
        ) : history.length === 0 ? (
          <div style={{ padding: "20px", background: "#1e293b", borderRadius: "8px", textAlign: "center", color: "#94a3b8" }}>Aucun document dans l'historique.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 10px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", color: "#94a3b8", padding: "10px" }}>Fichier</th>
                  <th style={{ textAlign: "left", color: "#94a3b8", padding: "10px" }}>Type Détecté</th>
                  <th style={{ textAlign: "left", color: "#94a3b8", padding: "10px" }}>Entité</th>
                  <th style={{ textAlign: "right", color: "#94a3b8", padding: "10px" }}>Revenus / Analyse</th>
                  <th style={{ textAlign: "right", color: "#94a3b8", padding: "10px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((doc) => {
                  const badgeStyle = getTypeBadgeStyle(doc.file_type);
                  return (
                    <tr key={doc.id} style={{ background: "#1e293b", transition: "transform 0.1s" }}>
                      <td style={{ padding: "15px", borderTopLeftRadius: "8px", borderBottomLeftRadius: "8px", color: "white", fontWeight: "bold", display: "flex", alignItems: "center", gap: "10px" }}>
                        <FileText size={18} color="#94a3b8" /> {doc.filename}
                      </td>
                      <td style={{ padding: "15px" }}>
                        <span style={{ background: badgeStyle.bg, color: badgeStyle.text, padding: "4px 10px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase" }}>
                          {doc.file_type}
                        </span>
                      </td>
                      <td style={{ padding: "15px", color: "#cbd5e1" }}>{doc.sender}</td>
                      
                      {/* COLONNE INTELLIGENTE */}
                      <td style={{ padding: "15px", textAlign: "right" }}>
                        {renderSolvencyBadge(doc)}
                      </td>
                      
                      {/* ACTIONS */}
                      <td style={{ padding: "15px", textAlign: "right", borderTopRightRadius: "8px", borderBottomRightRadius: "8px" }}>
                        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                            {/* BOUTON VISIONNER */}
                            <button 
                              onClick={() => handleView(doc.id)} 
                              style={{ background: "#3b82f6", color: "white", border: "none", padding: "8px", borderRadius: "6px", cursor: "pointer", display: "grid", placeItems: "center" }}
                              title="Visionner"
                            >
                              <Eye size={16} />
                            </button>

                            {/* BOUTON TÉLÉCHARGER */}
                            <a 
                              href={`${API_BASE}/api/files/download/${doc.id}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              style={{ background: "#0f172a", border: "1px solid #334155", color: "#94a3b8", padding: "8px", borderRadius: "6px", display: "inline-block" }}
                              title="Télécharger"
                            >
                              <Download size={16} />
                            </a>

                            {/* BOUTON SUPPRIMER */}
                            <button 
                              onClick={() => handleDelete(doc.id)} 
                              style={{ background: "#331e1e", border: "1px solid #450a0a", color: "#f87171", padding: "8px", borderRadius: "6px", cursor: "pointer", display: "grid", placeItems: "center" }}
                              title="Supprimer"
                            >
                              <Trash2 size={16} />
                            </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileAnalysis;