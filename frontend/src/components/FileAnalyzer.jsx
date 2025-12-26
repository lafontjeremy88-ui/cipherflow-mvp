import React, { useEffect, useRef, useState } from "react";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, History } from "lucide-react";

// API Base : idéalement via VITE_API_URL, sinon fallback Railway
const API_BASE =
  import.meta.env.VITE_API_URL || "https://cipherflow-mvp-production.up.railway.app";

const FileAnalyzer = ({ token: tokenProp }) => {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  // Token : prop -> localStorage fallback
  const token =
    tokenProp ||
    localStorage.getItem("cipherflow_token") ||
    localStorage.getItem("token") ||
    "";

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = (e) => {
    setError("");
    setResult(null);
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
  };

  const fetchHistory = async () => {
    if (!token) return;
    setLoadingHistory(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/files/history`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Erreur historique (${res.status})`);
      }

      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Erreur historique", e);
      // Ne bloque pas l'app si l'historique fail
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleAnalyze = async () => {
    if (!file) {
      setError("Choisis un fichier d'abord.");
      return;
    }
    if (!token) {
      setError("Token manquant : reconnecte-toi.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file); // IMPORTANT: le nom doit être "file" (comme FastAPI)

      // IMPORTANT: ne mets PAS Content-Type ici !
      const res = await fetch(`${API_BASE}/api/analyze-file`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const contentType = res.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await res.json()
        : await res.text();

      if (!res.ok) {
        // FastAPI renvoie souvent {detail:[...]} sur 422
        const detail =
          typeof payload === "object"
            ? payload?.detail
              ? JSON.stringify(payload.detail)
              : JSON.stringify(payload)
            : payload;

        throw new Error(detail || `Erreur serveur (${res.status})`);
      }

      setResult(payload);
      await fetchHistory();
    } catch (e) {
      console.error("Erreur analyse fichier", e);
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ fontSize: 34, fontWeight: 800, marginBottom: 18 }}>
        Analyse de Documents
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Upload */}
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FileText size={18} />
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
              Analyse de fichiers
            </h2>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>
              Uploader un fichier
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />

            <button
              onClick={handlePickFile}
              style={{
                width: 190,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              <Upload size={16} /> Choisir un fichier
            </button>

            <div style={{ marginTop: 12, opacity: 0.85 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Fichier :</div>
              <div style={{ fontWeight: 800 }}>
                {file ? file.name : "Aucun fichier sélectionné"}
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={loading}
              style={{
                marginTop: 14,
                width: 140,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: loading ? "rgba(59,130,246,0.35)" : "rgba(59,130,246,0.8)",
                color: "white",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              {loading ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
              Analyser
            </button>

            {error ? (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(239,68,68,0.35)",
                  background: "rgba(239,68,68,0.12)",
                  color: "rgba(255,255,255,0.95)",
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <AlertCircle size={18} style={{ marginTop: 2 }} />
                <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{error}</div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Résultat */}
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: 18,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Résultat</div>
          {!result ? (
            <div style={{ opacity: 0.7 }}>Aucun résultat pour le moment.</div>
          ) : (
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(255,255,255,0.08)",
                padding: 12,
                borderRadius: 12,
                fontSize: 12,
              }}
            >
              {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {/* Historique */}
      <div
        style={{
          marginTop: 16,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <History size={18} />
          <div style={{ fontWeight: 800 }}>Historique</div>
          {loadingHistory ? (
            <span style={{ opacity: 0.7, fontSize: 12 }}>Chargement...</span>
          ) : null}
        </div>

        <div style={{ marginTop: 12 }}>
          {history.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Aucun historique disponible.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {history.map((h) => (
                <div
                  key={h.id || `${h.filename}-${h.created_at || ""}`}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(0,0,0,0.18)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>{h.filename}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {h.file_type} {h.amount ? `- ${h.amount}` : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>{h.extracted_date}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default FileAnalyzer;
