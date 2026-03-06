import React, { useState, useEffect, useRef } from "react";
import {
  Upload, FileText, CheckCircle, AlertTriangle, Loader2,
  Download, RefreshCw, FileCheck, Trash2, Eye
} from "lucide-react";

import { API_URL as API_BASE } from "../services/api";

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function getTypeBadgeClass(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("facture") || t.includes("invoice"))
    return "bg-blue-50 text-blue-700 border border-blue-200";
  if (t.includes("contrat") || t.includes("bail"))
    return "bg-violet-50 text-violet-700 border border-violet-200";
  if (t.includes("paie") || t.includes("salaire") || t.includes("bulletin"))
    return "bg-green-50 text-green-700 border border-green-200";
  if (t.includes("impôt") || t.includes("tax"))
    return "bg-amber-50 text-amber-700 border border-amber-200";
  return "bg-slate-50 text-slate-600 border border-slate-200";
}

function SolvencyBadge({ doc }) {
  const rawAmount = parseFloat(String(doc.amount || "").replace(/[^0-9.,]/g, "").replace(",", "."));
  const type = (doc.file_type || "").toLowerCase();
  const isIncome = type.includes("paie") || type.includes("salaire") || type.includes("impôt");

  if (!isIncome || isNaN(rawAmount) || rawAmount === 0) {
    return <span className="font-semibold text-ink">{doc.amount}</span>;
  }

  const LOYER_REFERENCE = 600;
  const ratio = rawAmount / LOYER_REFERENCE;

  const badge =
    ratio >= 3
      ? { label: `Solvable (${ratio.toFixed(1)}x)`, cls: "bg-green-50 text-green-700 border border-green-200" }
      : ratio >= 2.5
      ? { label: `Juste (${ratio.toFixed(1)}x)`, cls: "bg-amber-50 text-amber-700 border border-amber-200" }
      : { label: `Risqué (${ratio.toFixed(1)}x)`, cls: "bg-red-50 text-red-700 border border-red-200" };

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="font-semibold text-ink">{doc.amount}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

const FileAnalysis = ({ token, authFetch }) => {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => { fetchHistory(); }, [authFetch]);

  useEffect(() => {
    if (!errorMessage && !successMessage) return;
    const t = setTimeout(() => { setErrorMessage(null); setSuccessMessage(null); }, 4000);
    return () => clearTimeout(t);
  }, [errorMessage, successMessage]);

  const fetchHistory = async () => {
    if (!authFetch) return;
    setHistoryLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/files/history`);
      if (res.ok) setHistory(await res.json());
    } catch (error) {
      console.error("Erreur historique:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleFileSelect = (f) => {
    if (f) { setFile(f); setAnalysis(null); }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setAnalysis(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await authFetch(`${API_BASE}/api/analyze-file`, { method: "POST", body: formData });
      if (res.ok) { setAnalysis(await res.json()); fetchHistory(); }
      else setErrorMessage("Erreur lors de l'analyse");
    } catch (error) {
      console.error(error);
      setErrorMessage("Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (id) => {
    if (!authFetch) return;
    try {
      const res = await authFetch(`${API_BASE}/api/files/view/${id}`);
      if (res.ok) { const url = window.URL.createObjectURL(await res.blob()); window.open(url, "_blank"); }
      else setErrorMessage("Impossible de visualiser le fichier.");
    } catch (e) { console.error(e); setErrorMessage("Erreur lors de l'ouverture."); }
  };

  const handleDownload = async (id, filename) => {
    if (!authFetch) return;
    try {
      const res = await authFetch(`${API_BASE}/api/files/download/${id}`);
      if (res.ok) {
        const url = window.URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = url; a.download = filename || `document_${id}`;
        document.body.appendChild(a); a.click(); a.remove();
        window.URL.revokeObjectURL(url);
      } else setErrorMessage("Impossible de télécharger le fichier.");
    } catch (e) { console.error(e); setErrorMessage("Erreur lors du téléchargement."); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Voulez-vous vraiment supprimer ce document ?")) return;
    try {
      const res = await authFetch(`${API_BASE}/api/files/${id}`, { method: "DELETE" });
      if (res.ok) setHistory(history.filter(f => f.id !== id));
      else setErrorMessage("Erreur lors de la suppression.");
    } catch (err) { console.error(err); setErrorMessage("Erreur réseau."); }
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto pb-16">

      {(errorMessage || successMessage) && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium ${
          errorMessage
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-green-50 border-green-200 text-green-700"
        }`}>
          <AlertTriangle size={16} className="flex-shrink-0" />
          <span>{errorMessage || successMessage}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center">
            <FileCheck size={20} className="text-violet-600" />
          </div>
          <h2 className="text-xl font-semibold text-ink">Vérification de Dossiers</h2>
        </div>
        <p className="text-sm text-ink-secondary ml-12">Analysez automatiquement les pièces justificatives des locataires.</p>
      </div>

      {/* Upload + Résultat */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Zone upload */}
        <div className="bg-white border border-surface-border rounded-xl shadow-card p-6">
          <h3 className="text-sm font-semibold text-ink mb-4">Nouveau document</h3>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={[
              "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200",
              dragging
                ? "bg-blue-50 border-blue-300"
                : "bg-surface-bg border-surface-border hover:border-primary-600 hover:bg-blue-50/40",
            ].join(" ")}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.png,.jpeg"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
              className="hidden"
            />

            <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${dragging ? "bg-blue-100" : "bg-surface-muted"}`}>
              <Upload size={28} className={dragging ? "text-primary-600" : "text-ink-tertiary"} />
            </div>

            {file ? (
              <div className="text-center">
                <p className="font-semibold text-ink">{file.name}</p>
                <p className="text-xs text-ink-tertiary mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-medium text-ink">
                  {dragging ? "Relâchez pour déposer" : "Glissez un document ici"}
                </p>
                <p className="text-xs text-ink-tertiary mt-0.5">ou cliquez pour parcourir</p>
                <p className="text-xs text-ink-tertiary mt-2">PDF, JPG, PNG — max 10 MB</p>
              </div>
            )}
          </div>

          <button
            onClick={handleAnalyze}
            disabled={!file || loading}
            className="w-full mt-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <><Loader2 size={18} className="animate-spin" /> Analyse IA en cours…</>
            ) : (
              "Lancer l'analyse"
            )}
          </button>
        </div>

        {/* Résultat analyse */}
        <div className="bg-white border border-surface-border rounded-xl shadow-card p-6 flex flex-col">
          <h3 className="text-sm font-semibold text-ink mb-4">Résultat de l'analyse</h3>

          {analysis ? (
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Analyse terminée</p>
                  <p className="text-xs text-green-700">Le document a été traité avec succès.</p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { label: "Type détecté", value: analysis.type || "Inconnu" },
                  { label: "Source", value: analysis.sender || "Non identifié" },
                  { label: "Montant / Revenu", value: analysis.amount || "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-2 border-b border-surface-border last:border-0">
                    <span className="text-xs text-ink-tertiary uppercase tracking-wide">{label}</span>
                    <span className="text-sm font-semibold text-ink">{value}</span>
                  </div>
                ))}
              </div>

              {analysis.summary && (
                <div>
                  <p className="text-xs text-ink-tertiary uppercase tracking-wide mb-2">Résumé IA</p>
                  <div className="bg-surface-bg rounded-lg p-3 text-sm text-ink-secondary leading-relaxed">
                    {analysis.summary}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center border-2 border-dashed border-surface-border rounded-xl py-10">
              <FileText size={40} className="text-surface-border mb-3" />
              <p className="text-sm text-ink-tertiary">Les résultats s'afficheront ici</p>
              <p className="text-xs text-ink-tertiary mt-1">Déposez un document et lancez l'analyse</p>
            </div>
          )}
        </div>
      </div>

      {/* Historique */}
      <div className="bg-white border border-surface-border rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h3 className="text-sm font-semibold text-ink">Documents traités</h3>
          <button
            onClick={fetchHistory}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-muted text-ink-secondary transition-colors"
            title="Rafraîchir"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {historyLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-ink-tertiary gap-2">
            <Loader2 size={18} className="animate-spin" /> Chargement…
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 bg-surface-muted rounded-2xl flex items-center justify-center mb-3">
              <FileText size={24} className="text-ink-tertiary" />
            </div>
            <p className="text-sm font-medium text-ink">Aucun document analysé</p>
            <p className="text-xs text-ink-tertiary mt-1">Uploadez votre premier document ci-dessus</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Header */}
            <div className="grid grid-cols-5 gap-4 px-6 py-3 bg-surface-bg border-b border-surface-border text-xs font-semibold text-ink-tertiary uppercase tracking-wider">
              <span>Fichier</span>
              <span>Type détecté</span>
              <span>Entité</span>
              <span className="text-right">Revenus / Analyse</span>
              <span className="text-right">Actions</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-surface-border">
              {history.map((doc) => (
                <div
                  key={doc.id}
                  className="grid grid-cols-5 gap-4 px-6 py-4 items-center hover:bg-surface-bg transition-colors duration-150"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={16} className="text-ink-tertiary flex-shrink-0" />
                    <span className="text-sm font-medium text-ink truncate">{doc.filename}</span>
                  </div>

                  <div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${getTypeBadgeClass(doc.file_type)}`}>
                      {doc.file_type}
                    </span>
                  </div>

                  <span className="text-sm text-ink-secondary">{doc.sender}</span>

                  <div className="text-right">
                    <SolvencyBadge doc={doc} />
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleView(doc.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      title="Visionner"
                    >
                      <Eye size={15} />
                    </button>
                    <button
                      onClick={() => handleDownload(doc.id, doc.filename)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-muted text-ink-secondary hover:bg-surface-border transition-colors"
                      title="Télécharger"
                    >
                      <Download size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileAnalysis;
