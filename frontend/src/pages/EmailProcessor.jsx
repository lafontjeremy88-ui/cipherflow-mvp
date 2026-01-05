import React, { useState } from "react";

export default function EmailProcessor({ authFetch }) {
  const [fromEmail, setFromEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function handleProcess(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const res = await authFetch("/email/process", {
        method: "POST",
        body: JSON.stringify({
          from_email: fromEmail,
          subject,
          content,
          send_email: false, // tu peux mettre true plus tard si tu veux envoyer réellement
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.detail || `HTTP ${res.status}`);
      }

      setResult(data);
    } catch (e2) {
      setError(e2?.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  const analyse = result?.analyse;
  const reponse = result?.reponse;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Traitement Email</h1>
        <p>Colle un email et lance l’analyse IA + réponse suggérée.</p>
      </div>

      {error && (
        <div className="alert error">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      <div className="card">
        <form onSubmit={handleProcess} style={{ display: "grid", gap: 12 }}>
          <div>
            <label className="label">Email expéditeur</label>
            <input
              className="input"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="ex: client@gmail.com"
              required
            />
          </div>

          <div>
            <label className="label">Sujet</label>
            <input
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="ex: Problème de quittance"
              required
            />
          </div>

          <div>
            <label className="label">Contenu</label>
            <textarea
              className="input"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Colle ici le contenu de l’email…"
              rows={10}
              required
            />
          </div>

          <button className="btn btn-primary" disabled={loading}>
            {loading ? "Analyse..." : "Analyser"}
          </button>
        </form>
      </div>

      {(analyse || reponse) && (
        <div className="grid-2" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="card-title">🧠 Analyse IA</div>
            <div className="muted" style={{ marginTop: 8 }}>
              <div><b>Catégorie :</b> {analyse?.category || "-"}</div>
              <div><b>Urgence :</b> {analyse?.urgency || "-"}</div>
              <div><b>Résumé :</b> {analyse?.summary || "-"}</div>
              <div><b>Titre suggéré :</b> {analyse?.suggested_title || "-"}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">✍️ Réponse suggérée</div>
            <div style={{ marginTop: 8 }}>
              <div className="muted"><b>Sujet :</b> {reponse?.subject || "(sans sujet)"}</div>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>
                {reponse?.reply || "—"}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
