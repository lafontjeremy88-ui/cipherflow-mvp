import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from "../services/api";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, History, Download } from 'lucide-react';

const FileAnalyzer = ({ token }) => {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await apiFetch("/api/files/history");
      if (res?.ok) setHistory(await res.json());
    } catch (e) {
      console.error("Erreur chargement historique", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = (e) => {
    setError("");
    setResult(null);
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError("Choisis un fichier d’abord.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch("/api/analyze-file", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Erreur analyse fichier");
      }

      const data = await res.json();
      setResult(data);
      await fetchHistory();
    } catch (e) {
      console.error(e);
      setError(e.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  const card = {
    background: "#111827",
    color: "white",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 4px 20px rgba(0,0,0,0.25)"
  };

  return (
    <div style={{ padding: 20, color: "white" }}>
      <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 12 }}>
        <FileText size={20} style={{ marginRight: 8 }} />
        Analyse de fichiers
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Uploader un fichier</div>

          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />

          <button
            onClick={handlePickFile}
            style={{
              background: "#1f2937",
              border: "none",
              color: "white",
              padding: "10px 14px",
              borderRadius: 10,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8
            }}
          >
            <Upload size={16} />
            Choisir un fichier
          </button>

          {file && (
            <div style={{ marginTop: 12, opacity: 0.9 }}>
              Fichier : <b>{file.name}</b>
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={loading}
            style={{
              marginTop: 12,
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
            {loading ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
            {loading ? "Analyse..." : "Analyser"}
          </button>

          {error && (
            <div style={{ marginTop: 12, color: "#fca5a5", display: "flex", gap: 8, alignItems: "center" }}>
              <AlertCircle size={16} />
              {error}
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Résultat</div>

          {!result ? (
            <div style={{ opacity: 0.8 }}>Aucun résultat pour le moment.</div>
          ) : (
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, opacity: 0.95 }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>

        <div style={{ ...card, gridColumn: "span 2" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 900 }}>
              <History size={16} style={{ marginRight: 8 }} />
              Historique des analyses
            </div>
            <button
              onClick={fetchHistory}
              disabled={loadingHistory}
              style={{
                background: "#1f2937",
                border: "none",
                color: "white",
                padding: "8px 12px",
                borderRadius: 10,
                cursor: "pointer",
                display: "inline-flex",
                gap: 8,
                alignItems: "center"
              }}
            >
              {loadingHistory ? <Loader2 size={16} /> : <Download size={16} />}
              Rafraîchir
            </button>
          </div>

          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {history.length === 0 && <div style={{ opacity: 0.8 }}>Aucun historique.</div>}

            {history.map((h) => (
              <div key={h.id} style={{ background: "#1f2937", padding: 12, borderRadius: 10 }}>
                <div style={{ fontWeight: 800 }}>{h.filename || "Fichier"}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{h.created_at || ""}</div>
                <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>
                  {h.summary || ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileAnalyzer;
