import React, { useState } from "react";
import { Paperclip, Send, RotateCcw, Brain, MessageSquare } from "lucide-react";

const inputCls =
  "w-full px-4 py-3 bg-white border border-surface-border rounded-lg text-sm text-ink placeholder-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600 transition-all duration-200";
const labelCls = "block text-sm font-medium text-ink-secondary mb-2";

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
    setFiles(Array.from(e.target.files || []));
  }

  function resetForm() {
    setFromEmail(""); setSubject(""); setContent("");
    setFiles([]); setResult(null); setError(""); setSuccess("");
  }

  async function buildAttachmentsPayload() {
    if (!files.length) return [];
    return Promise.all(
      files.map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const str = typeof reader.result === "string" ? reader.result : "";
                const base64 = str.includes(",") ? str.split(",")[1] : str;
                resolve({ filename: file.name, content_base64: base64, content_type: file.type || "application/octet-stream" });
              } catch (e) { reject(e); }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    );
  }

  async function handleProcess(e) {
    e.preventDefault();
    setError(""); setSuccess(""); setResult(null); setLoading(true);
    try {
      if (!fromEmail || !subject || !content) {
        throw new Error("Merci de renseigner l'email expéditeur, le sujet et le contenu.");
      }
      const attachments = await buildAttachmentsPayload();
      const res = await authFetch("/email/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_email: fromEmail, subject, content, send_email: false, attachments }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      setResult(data);
      setSuccess("Analyse réalisée avec succès ✅");
    } catch (e2) {
      setError(e2?.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  const analyse = result?.analyse;
  const reponse = result?.reponse;

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Alertes */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
          <strong>Erreur :</strong> {error}
        </div>
      )}
      {success && (
        <div className="px-4 py-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl">
          {success}
        </div>
      )}

      {/* Formulaire */}
      <div className="bg-white border border-surface-border rounded-xl shadow-card p-6">
        <h2 className="text-base font-semibold text-ink mb-1">Traitement Email</h2>
        <p className="text-sm text-ink-tertiary mb-6">
          Colle un email, ajoute les pièces jointes et lance l'analyse IA + réponse suggérée.
        </p>

        <form onSubmit={handleProcess} className="space-y-4">
          <div>
            <label className={labelCls}>Email expéditeur</label>
            <input
              className={inputCls}
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="ex: client@gmail.com"
              required
            />
          </div>

          <div>
            <label className={labelCls}>Sujet</label>
            <input
              className={inputCls}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="ex: Problème de quittance"
              required
            />
          </div>

          <div>
            <label className={labelCls}>Contenu de l'email</label>
            <textarea
              className={inputCls + " resize-none"}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Colle ici le contenu de l'email…"
              rows={10}
              required
            />
          </div>

          {/* Pièces jointes */}
          <div>
            <label className={labelCls}>Pièces jointes (optionnel)</label>
            <input id="email-attachments-input" type="file" multiple onChange={handleFileChange} className="hidden" />
            <label
              htmlFor="email-attachments-input"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-surface-border rounded-lg text-sm text-ink-secondary font-medium cursor-pointer hover:bg-surface-bg hover:border-[#CBD5E1] transition-all duration-200"
            >
              <Paperclip size={15} />
              {files.length ? "Modifier les fichiers" : "Sélectionner des fichiers"}
            </label>
            {files.length > 0 && (
              <p className="text-xs text-ink-secondary mt-2">
                {files.length} fichier(s) : {files.map((f) => f.name).join(", ")}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-semibold transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={15} />
              {loading ? "Analyse…" : "Analyser"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-white border border-surface-border text-ink-secondary rounded-lg text-sm font-medium hover:bg-surface-bg transition-all duration-200 disabled:opacity-50"
            >
              <RotateCcw size={15} />
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Résultats */}
      {(analyse || reponse) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white border border-surface-border rounded-xl shadow-card p-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-surface-border">
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                <Brain size={16} className="text-violet-600" />
              </div>
              <h3 className="text-sm font-semibold text-ink">Analyse IA</h3>
            </div>
            <div className="space-y-2.5">
              {[
                { label: "Catégorie", value: analyse?.category || "—" },
                { label: "Urgence", value: analyse?.urgency || "—" },
                { label: "Titre suggéré", value: analyse?.suggested_title || "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-3 py-2 border-b border-surface-border last:border-0">
                  <span className="text-xs text-ink-tertiary uppercase tracking-wide flex-shrink-0">{label}</span>
                  <span className="text-sm font-medium text-ink text-right">{value}</span>
                </div>
              ))}
              {analyse?.summary && (
                <div className="mt-3">
                  <p className="text-xs text-ink-tertiary uppercase tracking-wide mb-1.5">Résumé</p>
                  <p className="text-sm text-ink-secondary leading-relaxed">{analyse.summary}</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-surface-border rounded-xl shadow-card p-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-surface-border">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <MessageSquare size={16} className="text-blue-600" />
              </div>
              <h3 className="text-sm font-semibold text-ink">Réponse suggérée</h3>
            </div>
            <p className="text-xs text-ink-tertiary mb-3">
              <strong className="text-ink-secondary">Sujet :</strong> {reponse?.subject || "(sans sujet)"}
            </p>
            <pre className="whitespace-pre-wrap text-sm text-ink-secondary leading-relaxed bg-surface-bg rounded-lg p-3 max-h-60 overflow-y-auto font-sans">
              {reponse?.reply || "—"}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
