import { useState } from "react";

const API_URL =
  import.meta.env.VITE_API_URL || "https://cipherflow-mvp-production.up.railway.app";

export default function FileAnalyzer({ authFetch }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!file) {
      setError("Aucun fichier sélectionné");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file); // ✅ NOM EXACT attendu par FastAPI

      // ✅ On utilise authFetch si fourni (recommandé), sinon fallback fetch avec token
      let response;

      if (typeof authFetch === "function") {
        response = await authFetch(`${API_URL}/api/analyze-file`, {
          method: "POST",
          body: formData, // IMPORTANT: FormData -> authFetch ne doit pas forcer Content-Type
        });
      } else {
        const token = localStorage.getItem("cipherflow_token");
        if (!token) throw new Error("Token manquant. Déconnecte-toi puis reconnecte-toi.");

        response = await fetch(`${API_URL}/api/analyze-file`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
      }

      if (!response.ok) {
        // Essaie de lire le JSON d'erreur, sinon texte brut
        let detail = "";
        try {
          const errJson = await response.json();
          detail = errJson?.detail ? JSON.stringify(errJson.detail) : JSON.stringify(errJson);
        } catch {
          detail = await response.text();
        }
        throw new Error(`Erreur ${response.status}: ${detail || "Erreur inconnue"}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (e) {
      console.error("Erreur analyse fichier:", e);
      setError(e?.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      <button onClick={handleAnalyze} disabled={loading}>
        {loading ? "Analyse..." : "Analyser"}
      </button>

      {error && <pre style={{ color: "red", whiteSpace: "pre-wrap" }}>{error}</pre>}
      {result && <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
