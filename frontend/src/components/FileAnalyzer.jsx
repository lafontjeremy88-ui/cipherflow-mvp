import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

export default function FileAnalyzer() {
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
      formData.append("file", file); // ⚠️ NOM EXACT requis par FastAPI

      const token = localStorage.getItem("token");

      const response = await fetch(`${API_URL}/api/analyze-file`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}` // ❗ PAS de Content-Type ici
        },
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(JSON.stringify(err));
      }

      const data = await response.json();
      setResult(data);
    } catch (e) {
      console.error("Erreur analyse fichier:", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={(e) => setFile(e.target.files[0])}
      />

      <button onClick={handleAnalyze} disabled={loading}>
        {loading ? "Analyse..." : "Analyser"}
      </button>

      {error && <pre style={{ color: "red" }}>{error}</pre>}
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
