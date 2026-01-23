import React, { useState } from "react";

export default function EmailProcessor({ authFetch }) {
  const [fromEmail, setFromEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");

  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [result, setResult] = useState(null);

  function handleFileChange(e) {
    const list = Array.from(e.target.files || []);
    setFiles(list);
  }

  function resetForm() {
    setFromEmail("");
    setSubject("");
    setContent("");
    setFiles([]);
    setResult(null);
    setError("");
    setSuccess("");
  }

  async function buildAttachmentsPayload() {
    if (!files.length) return [];

    const promises = files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const result = reader.result;
              // result = "data:...;base64,AAAA..."
              const str = typeof result === "string" ? result : "";
              const base64 = str.includes(",") ? str.split(",")[1] : str;

              resolve({
                filename: file.name,
                content_base64: base64,
                content_type: file.type || "application/octet-stream",
              });
            } catch (e) {
              reject(e);
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
    );

    return Promise.all(promises);
  }

  async function handleProcess(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setResult(null);
    setLoading(true);

    try {
      if (!fromEmail || !subject || !content) {
        throw new Error(
          "Merci de renseigner l'email expéditeur, le sujet et le contenu."
        );
      }

      // Construit le payload des pièces jointes
      const attachments = await buildAttachmentsPayload();

      const res = await authFetch("/email/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from_email: fromEmail,
          subject,
          content,
          send_email: false, // tu pourras mettre true plus tard si tu veux envoyer réellement
          attachments,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.detail || `HTTP ${res.status}`);
      }

      setResult(data);
      setSuccess("Analyse réalisée avec succès ✅");
    } catch (e2) {
      console.error(e2);
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
        <p>
          Colle un email, ajoute les pièces jointes et lance l’analyse IA +
          réponse suggérée.
        </p>
      </div>

      {error && (
        <div className="alert error">
          <strong>Erreur :</strong> {error}
        </div>
      )}
      {success && (
        <div className="alert success">
          <strong>Succès :</strong> {success}
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

          <div>
            <label className="label">
              Pièces jointes (optionnel, prises en compte par l’IA)
            </label>
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              className="input"
            />
            {files.length > 0 && (
              <div className="muted" style={{ marginTop: 4 }}>
                {files.length} fichier(s) sélectionné(s) :{" "}
                {files.map((f) => f.name).join(", ")}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" disabled={loading}>
              {loading ? "Analyse..." : "Analyser"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={resetForm}
              disabled={loading}
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      {(analyse || reponse) && (
        <div className="grid-2" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="card-title">🧠 Analyse IA</div>
            <div className="muted" style={{ marginTop: 8 }}>
              <div>
                <b>Catégorie :</b> {analyse?.category || "-"}
              </div>
              <div>
                <b>Urgence :</b> {analyse?.urgency || "-"}
              </div>
              <div>
                <b>Résumé :</b> {analyse?.summary || "-"}
              </div>
              <div>
                <b>Titre suggéré :</b> {analyse?.suggested_title || "-"}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">✍️ Réponse suggérée</div>
            <div style={{ marginTop: 8 }}>
              <div className="muted">
                <b>Sujet :</b> {reponse?.subject || "(sans sujet)"}
              </div>
              <pre
                style={{ whiteSpace: "pre-wrap", marginTop: 10 }}
              >
                {reponse?.reply || "—"}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
