import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Mail } from "lucide-react";
import { authFetch, API_URL as API_BASE } from "../services/api";

/**
 * EmailHistory.jsx
 * ----------------
 * - GET /email/history?limit=50
 * - GET /email/{email_id}
 * - POST /email/send (avec email_id pour lier à l'historique)
 * - DELETE /email/history/{email_id}
 */

/* ==========================
   Helpers MIME
   ========================== */

function decodeQuotedPrintable(input) {
  if (!input) return "";
  let s = input.replace(/=\r?\n/g, "");
  s = s.replace(/=([A-Fa-f0-9]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  return s;
}

function base64ToUtf8(b64) {
  if (!b64) return "";
  let clean = b64.replace(/\s/g, "");
  try {
    const binary = atob(clean);
    try {
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
      return binary;
    }
  } catch {
    try {
      return atob(clean);
    } catch {
      return "";
    }
  }
}

function extractMimePart(raw, wantedType) {
  if (!raw) return null;

  const ctRegex = new RegExp(
    `Content-Type:\\s*${wantedType.replace("/", "\\/")}[^\\n]*\\n([\\s\\S]*?)(\\n--|\\nContent-Type:|$)`,
    "i"
  );

  const m = raw.match(ctRegex);
  if (!m) return null;

  let chunk = m[1] || "";

  const encodingMatch = chunk.match(/Content-Transfer-Encoding:\s*([^\n\r]+)/i);
  const encoding = encodingMatch ? encodingMatch[1].trim().toLowerCase() : "";

  // enlever les headers du chunk
  chunk = chunk.replace(/^[\s\S]*?\r?\n\r?\n/, "");

  if (encoding.includes("quoted-printable")) return decodeQuotedPrintable(chunk).trim();
  if (encoding.includes("base64")) return base64ToUtf8(chunk).trim();

  return chunk.trim();
}

function htmlToText(html) {
  if (!html) return "";
  try {
    const div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent || div.innerText || "").trim();
  } catch {
    return String(html || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

function formatDateShort(e) {
  const d = e?.received_at || e?.date || e?.created_at;
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return dt.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(d);
  }
}

function safeStr(v) {
  return (v ?? "").toString();
}

/* ==========================
   Catégories + couleurs
   ========================== */

const CATEGORY_COLORS = {
  Autre: "#6D5EF8",
  Administratif: "#44C2A8",
  Candidature: "#F4B04F",
  Incident: "#E46C6C",

  // immo
  Lead_location: "#0ea5e9",
  Lead_vente: "#22c55e",
  Propriétaire: "#f97316",
  Locataire: "#a855f7",
  Gestion: "#eab308",
  Notaire: "#6366f1",
  Banque: "#14b8a6",
  Publicité_Marketing: "#64748b",
  Spam: "#ef4444",
};

const CATEGORY_OPTIONS = ["all", ...Object.keys(CATEGORY_COLORS)];

function getCategoryColor(name) {
  if (!name) return "#64748b";
  return CATEGORY_COLORS[name] || "#64748b";
}

/* ==========================
   Urgence normalisée
   ========================== */
function getUrgencyLevel(u) {
  const s = safeStr(u).toLowerCase();

  // HIGH
  if (s.includes("high") || s.includes("haute") || s.includes("urgent")) return "high";

  // MEDIUM
  if (s.includes("medium") || s.includes("moy")) return "medium";

  // LOW (faible/basse/low/...)
  if (s.includes("low") || s.includes("basse") || s.includes("faible")) return "low";

  // par défaut : low
  return "low";
}

/* ==========================
   Component
   ========================== */

export default function EmailHistory() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  // recent | oldest | prio_high | prio_medium | prio_low
  const [sortMode, setSortMode] = useState("recent");

  const [selectedId, setSelectedId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  const [showRaw, setShowRaw] = useState(true);

  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linkingTenant, setLinkingTenant] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [reportModal, setReportModal] = useState(null); // { emailId } | null

  const [editedReply, setEditedReply] = useState(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState(null);

  const urlEmailId = searchParams.get("emailId");
  const urlCategory = searchParams.get("category");

  function setEmailIdInUrl(id) {
    const next = new URLSearchParams(searchParams);
    if (!id) next.delete("emailId");
    else next.set("emailId", String(id));
    setSearchParams(next, { replace: true });
  }

  async function loadHistory() {
    setLoading(true);
    try {
      const res = await authFetch("/email/history?limit=50");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : data?.items || []);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(emailId) {
    if (!emailId) return;
    setDetailLoading(true);
    setSelected(null);

    try {
      const res = await authFetch(`/email/${emailId}`);
      const data = await res.json();

      const raw = data?.raw || "";

      const plain = extractMimePart(raw, "text/plain");
      const html = extractMimePart(raw, "text/html");

      let bodyText = "";
      if (plain && plain.trim()) {
        bodyText = plain.trim();
      } else if (html && html.trim()) {
        bodyText = htmlToText(html.trim());
      } else if (raw && raw.trim()) {
        bodyText = raw.trim();
      } else {
        bodyText = (
          data?.body_text ||
          data?.bodyText ||
          data?.text ||
          data?.content ||
          data?.body ||
          data?.snippet ||
          ""
        ).toString();
      }

      setSelected({
        ...data,
        bodyText,
      });
    } catch (e) {
      console.error(e);
      setSelected({ bodyText: "" });
    } finally {
      setDetailLoading(false);
    }
  }

  function onClickItem(id) {
    setSelectedId(id);
    setEmailIdInUrl(id);
    setShowRaw(true);
    setActionError("");
    setActionSuccess("");
    setEditedReply(null);
    setRegenError(null);
  }

  // premier chargement
  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL → catégorie
  useEffect(() => {
    if (urlCategory) setCategory(urlCategory);
    else setCategory("all");
  }, [urlCategory]);

  // URL → emailId
  useEffect(() => {
    if (urlEmailId) {
      setSelectedId(urlEmailId);
      loadDetail(urlEmailId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlEmailId]);

  const filtered = useMemo(() => {
    let arr = [...items];

    // Filtre catégorie
    if (category !== "all") {
      const c = category.toLowerCase();
      arr = arr.filter((e) => safeStr(e.category).toLowerCase() === c);
    }

    // Recherche texte
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter((e) => {
        const subject = safeStr(e.subject).toLowerCase();
        const from = safeStr(e.from || e.from_email || e.sender_email).toLowerCase();
        const cat = safeStr(e.category).toLowerCase();
        return subject.includes(q) || from.includes(q) || cat.includes(q);
      });
    }

    // Priorité : haute/moyenne/basse (comportement "filtre")
    if (
      sortMode === "prio_high" ||
      sortMode === "prio_medium" ||
      sortMode === "prio_low"
    ) {
      const wanted =
        sortMode === "prio_high"
          ? "high"
          : sortMode === "prio_medium"
          ? "medium"
          : "low";
      arr = arr.filter((e) => getUrgencyLevel(e.urgency) === wanted);

      // tri "plus récents" dans ce mode
      arr.sort((a, b) => {
        const da = new Date(
          a.received_at || a.date || a.created_at || 0
        ).getTime();
        const db = new Date(
          b.received_at || b.date || b.created_at || 0
        ).getTime();
        return db - da;
      });

      return arr;
    }

    // Tri chrono global
    arr.sort((a, b) => {
      const da = new Date(
        a.received_at || a.date || a.created_at || 0
      ).getTime();
      const db = new Date(
        b.received_at || b.date || b.created_at || 0
      ).getTime();
      return sortMode === "oldest" ? da - db : db - da; // recent par défaut
    });

    return arr;
  }, [items, category, sortMode, query]);

  const selectedFromList = useMemo(() => {
    if (!selectedId) return null;
    return (
      filtered.find((x) => String(x.id) === String(selectedId)) || null
    );
  }, [filtered, selectedId]);

  // Champs IA / méta
  const summary = safeStr(selected?.summary || selectedFromList?.summary);
  const suggestedResponse = safeStr(selected?.suggested_response_text);
  const hasReplied = !!(
    selected?.reply_sent || selectedFromList?.reply_sent
  );

  const fromLabel = safeStr(
    selected?.from ||
      selectedFromList?.from ||
      selected?.sender_email ||
      selectedFromList?.from_email ||
      selectedFromList?.sender_email
  );

  const categoryLabel = safeStr(
    selected?.category || selectedFromList?.category || "—"
  );

  const receivedLabel = selected?.received_at
    ? safeStr(selected.received_at)
    : formatDateShort(selectedFromList);

  const titleLabel = safeStr(
    selected?.subject || selectedFromList?.subject || "Email"
  );

  /* ==========================
     Actions : envoyer / supprimer / dossier locataire
     ========================== */

  async function handleSendSuggestedResponse() {
    const replyToSend = editedReply ?? suggestedResponse;
    if (!selectedId || !replyToSend) return;

    const target = selected || selectedFromList;
    if (!target) return;

    const toEmail =
      target.sender_email || target.from_email || target.from || "";
    const subject = `Re: ${target.subject || titleLabel}`;

    setSending(true);
    setActionError("");
    setActionSuccess("");

    try {
      const res = await authFetch("/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_email: toEmail,
          subject,
          body: replyToSend,
          email_id: Number(selectedId),
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 409) {
          setActionError("Une réponse a déjà été envoyée pour cet email.");
          setActionSuccess("");
          return;
        }
        throw new Error(`Status ${res.status}${txt ? " - " + txt : ""}`);
      }

      setActionSuccess("Réponse envoyée avec succès ✅");
      setActionError("");

      // update local (grise le bouton)
      const nowIso = new Date().toISOString();
      setSelected((prev) =>
        prev ? { ...prev, reply_sent: true, reply_sent_at: nowIso } : prev
      );

      setItems((prev) =>
        prev.map((e) =>
          String(e.id) === String(selectedId)
            ? { ...e, reply_sent: true, reply_sent_at: nowIso }
            : e
        )
      );
    } catch (e) {
      console.error(e);
      setActionError(
        "Impossible d’envoyer la réponse (vérifie POST /email/send côté backend)."
      );
      setActionSuccess("");
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteEmail() {
    if (!selectedId) return;
    const confirmDelete = window.confirm(
      "Supprimer cet email de la liste ?"
    );
    if (!confirmDelete) return;

    setDeleting(true);
    setActionError("");
    setActionSuccess("");

    try {
      const res = await authFetch(`/email/history/${selectedId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(
          `DELETE /email/history/${selectedId} -> ${res.status}${
            txt ? " - " + txt : ""
          }`
        );
      }

      setItems((prev) =>
        prev.filter((e) => String(e.id) !== String(selectedId))
      );
      setSelectedId(null);
      setSelected(null);
      setEmailIdInUrl(null);

      setActionSuccess("Email supprimé avec succès ✅");
      setActionError("");
    } catch (e) {
      console.error(e);
      setActionError(
        "Impossible de supprimer l’email (vérifie le endpoint DELETE /email/history/{id} côté backend)."
      );
      setActionSuccess("");
    } finally {
      setDeleting(false);
    }
  }

  async function handleOpenTenantFile() {
    if (!selectedId) return;

    setLinkingTenant(true);
    setActionError("");
    setActionSuccess("");

    try {
      const res = await authFetch(
        `/tenant-files/from-email/${selectedId}`,
        {
          method: "POST",
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(
          `POST /tenant-files/from-email/${selectedId} -> ${
            res.status
          }${txt ? " - " + txt : ""}`
        );
      }

      const data = await res.json().catch(() => null);
      const tfId = data?.id;

      setActionSuccess(
        tfId
          ? `Dossier locataire #${tfId} créé / mis à jour pour cet email.`
          : "Dossier locataire créé / mis à jour pour cet email."
      );
      setActionError("");
    } catch (e) {
      console.error(e);
      setActionError(
        "Impossible de créer / ouvrir le dossier locataire."
      );
      setActionSuccess("");
    } finally {
      setLinkingTenant(false);
    }
  }

  async function handleRegenerateReply() {
    if (!selectedId) return;
    setIsRegenerating(true);
    setRegenError(null);
    try {
      const res = await authFetch(`/email/${selectedId}/regenerate-reply`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setEditedReply(data.suggested_reply);
    } catch {
      setRegenError("Impossible de régénérer la réponse. Réessaie.");
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleReport(emailId, reason) {
    if (!emailId || !reason) return;
    setActionError("");
    setActionSuccess("");
    try {
      const res = await authFetch(`${API_BASE}/feedback/email/${emailId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        const data = await res.json();
        const extra = data.auto_blacklisted ? " (domaine auto-blacklisté)" : "";
        setActionSuccess(`Signalement envoyé.${extra}`);
      } else {
        setActionError("Erreur lors du signalement.");
      }
    } catch {
      setActionError("Erreur réseau.");
    } finally {
      setReportModal(null);
    }
  }

  async function handleBlacklist(senderEmail) {
    if (!senderEmail) return;
    const atIdx = senderEmail.indexOf("@");
    const pattern = atIdx !== -1 ? senderEmail.slice(atIdx) : senderEmail;
    if (!window.confirm(`Blacklister le domaine "${pattern}" pour ignorer tous les prochains emails de cette source ?`)) return;
    setActionError("");
    setActionSuccess("");
    try {
      const res = await authFetch(API_BASE + "/settings/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern }),
      });
      if (res.ok) {
        setActionSuccess(`Domaine "${pattern}" ajouté à la blacklist.`);
      } else {
        setActionError("Erreur lors de l'ajout à la blacklist.");
      }
    } catch {
      setActionError("Erreur réseau.");
    }
  }

  return (
    <>
    {/* ── Modal de signalement ─────────────────────────────────────────────── */}
    {reportModal && (
      <ReportModal
        emailId={reportModal.emailId}
        onConfirm={(reason) => handleReport(reportModal.emailId, reason)}
        onClose={() => setReportModal(null)}
      />
    )}

    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Historique des emails</h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            Recherche, filtre et ouvre un email pour afficher le contenu.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            className="px-3 py-2 border border-surface-border rounded-lg text-sm bg-white text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
            placeholder="Rechercher… (objet, expéditeur, catégorie)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {/* Type de message (Catégorie) */}
          <select
            className="px-3 py-2 border border-surface-border rounded-lg text-sm bg-white text-ink focus:outline-none cursor-pointer"
            value={category}
            onChange={(e) => {
              const nextCat = e.target.value;
              setCategory(nextCat);

              const next = new URLSearchParams(searchParams);
              if (nextCat === "all") next.delete("category");
              else next.set("category", nextCat);
              setSearchParams(next, { replace: true });
            }}
          >
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat}>
                {cat === "all" ? "Catégorie : Toutes" : cat}
              </option>
            ))}
          </select>

          {/* Tri / Priorité */}
          <select
            className="px-3 py-2 border border-surface-border rounded-lg text-sm bg-white text-ink focus:outline-none cursor-pointer"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value)}
            title="Tri / Priorité"
          >
            <option value="recent">Tri : plus récents</option>
            <option value="oldest">Tri : plus anciens</option>
            <option disabled>────────────</option>
            <option value="prio_high">Priorité : haute</option>
            <option value="prio_medium">Priorité : moyenne</option>
            <option value="prio_low">Priorité : basse</option>
          </select>

          <button
            className="px-4 py-2 rounded-lg text-sm font-medium bg-surface-muted text-ink hover:bg-surface-border transition-colors border border-surface-border"
            onClick={loadHistory}
            disabled={loading}
          >
            {loading ? "Chargement…" : "Rafraîchir"}
          </button>

          {/* mini reset */}
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium text-ink-secondary hover:bg-surface-muted transition-colors"
            onClick={() => {
              setQuery("");
              setSortMode("recent");
              setCategory("all");
              const next = new URLSearchParams(searchParams);
              next.delete("category");
              setSearchParams(next, { replace: true });
            }}
            title="Réinitialiser filtres"
          >
            Reset
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-ink-secondary">Chargement de l’historique…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
            <Mail className="h-8 w-8 text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-ink mb-2">
            {items.length === 0 ? "Aucun email pour l’instant" : "Aucun résultat"}
          </h3>
          <p className="text-sm text-ink-tertiary max-w-xs">
            {items.length === 0
              ? "Connectez votre boîte Gmail dans les Paramètres pour commencer la surveillance automatique."
              : "Modifiez vos filtres ou votre recherche pour trouver des emails."}
          </p>
          {items.length === 0 && (
            <a href="/settings" className="mt-6 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-all duration-200 no-underline">
              Aller aux Paramètres
            </a>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          {/* LISTE */}
          <div className="bg-white border border-surface-border rounded-xl shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
              <h2 className="text-sm font-semibold text-ink">Liste</h2>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-surface-muted text-ink-secondary">
                {filtered.length}
              </span>
            </div>

            <div className="overflow-y-auto max-h-[600px] divide-y divide-surface-border">
              {filtered.map((e) => {
                const active = String(e.id) === String(selectedId);
                const lvl = getUrgencyLevel(e.urgency);

                const pillCls =
                  lvl === "high"
                    ? "text-xs px-2 py-0.5 rounded-full font-semibold bg-red-50 text-red-700 border border-red-200"
                    : lvl === "medium"
                    ? "text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                    : "text-xs px-2 py-0.5 rounded-full font-semibold bg-surface-muted text-ink-tertiary";

                return (
                  <button
                    key={e.id}
                    type="button"
                    className={`w-full text-left px-4 py-3 transition-colors duration-150 cursor-pointer block ${
                      active ? "bg-primary-50 border-l-2 border-l-primary-600" : "hover:bg-surface-bg"
                    }`}
                    onClick={() => onClickItem(e.id)}
                    title="Ouvrir"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={pillCls}>
                        {safeStr(e.urgency).toUpperCase() || "—"}
                      </span>
                      <span className="text-xs text-ink-tertiary">
                        {formatDateShort(e)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-ink-secondary flex-wrap">
                      <span className="truncate font-medium">
                        {e.from || e.from_email || e.sender_email || "—"}
                      </span>
                      <span className="text-ink-tertiary">•</span>
                      <span className="flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full inline-block flex-shrink-0"
                          style={{ backgroundColor: getCategoryColor(e.category) }}
                        />
                        {e.category || "—"}
                      </span>

                      {e.tenant_file_id && (
                        <>
                          <span className="text-ink-tertiary">•</span>
                          <span className="text-primary-600 font-medium">
                            {e.tenant_name || e.tenant_email || `Dossier #${e.tenant_file_id}`}
                          </span>
                        </>
                      )}
                    </div>

                  </button>
                );
              })}
            </div>
          </div>

          {/* PREVIEW */}
          <div className="bg-white border border-surface-border rounded-xl shadow-card overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-ink">Prévisualisation</h2>

              {!!selectedId && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-secondary hover:bg-surface-muted transition-colors"
                    onClick={() => setShowRaw((v) => !v)}
                    title="Afficher/Masquer l’email brut"
                  >
                    {showRaw ? "Masquer le brut" : "Afficher le brut"}
                  </button>

                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-muted text-ink hover:bg-surface-border transition-colors border border-surface-border disabled:opacity-50"
                    onClick={handleOpenTenantFile}
                    disabled={linkingTenant || deleting || sending}
                    title="Créer / ouvrir le dossier locataire pour cet email"
                  >
                    {linkingTenant ? "Lien dossier…" : "Dossier locataire"}
                  </button>

                  <button
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-secondary hover:bg-surface-muted transition-colors"
                    onClick={() => {
                      setEmailIdInUrl(null);
                      setSelectedId(null);
                      setSelected(null);
                      setActionError("");
                      setActionSuccess("");
                    }}
                  >
                    Fermer
                  </button>
                </div>
              )}
            </div>

            {/* Alertes */}
            {actionSuccess && (
              <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                {actionSuccess}
              </div>
            )}
            {actionError && (
              <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {actionError}
              </div>
            )}

            {!selectedId ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="text-sm font-semibold text-ink mb-1">Sélectionne un email</div>
                <div className="text-sm text-ink-secondary">
                  Clique à gauche pour afficher le contenu ici.
                </div>
              </div>
            ) : detailLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="text-sm text-ink-secondary">Chargement de l’email…</div>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-surface-border">
                  <div className="text-base font-semibold text-ink mb-1">
                    {titleLabel}
                  </div>

                  <div className="flex items-center gap-2 text-sm text-ink-secondary flex-wrap">
                    <span>{fromLabel}</span>
                    <span className="text-ink-tertiary">•</span>
                    <span className="flex items-center gap-1">
                      <span
                        className="w-2 h-2 rounded-full inline-block flex-shrink-0"
                        style={{ backgroundColor: getCategoryColor(categoryLabel) }}
                      />
                      {categoryLabel}
                    </span>
                    <span className="text-ink-tertiary">•</span>
                    <span>{receivedLabel}</span>
                  </div>

                  {hasReplied && (
                    <span className="inline-flex mt-2 text-xs px-2 py-0.5 rounded-full font-semibold bg-green-50 text-green-700 border border-green-200">
                      Réponse envoyée
                    </span>
                  )}
                </div>

                {/* Résumé IA */}
                {summary && (
                  <div className="mx-4 mt-4 border border-surface-border rounded-xl overflow-hidden">
                    <div className="flex items-center px-4 py-3 border-b border-surface-border">
                      <h3 className="text-sm font-semibold text-ink">Résumé IA</h3>
                    </div>
                    <div className="px-4 py-3 text-sm text-ink-secondary" style={{ whiteSpace: "pre-wrap" }}>
                      {summary}
                    </div>
                  </div>
                )}

                {/* Réponse proposée */}
                <div className="mx-4 mt-4 mb-4 border border-surface-border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border flex-wrap gap-2">
                    <h3 className="text-sm font-semibold text-ink">Réponse proposée</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(suggestedResponse || editedReply !== null) && (
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50"
                          onClick={handleSendSuggestedResponse}
                          disabled={sending || deleting || hasReplied}
                        >
                          {hasReplied
                            ? "Réponse déjà envoyée"
                            : sending
                            ? "Envoi…"
                            : "Envoyer la réponse"}
                        </button>
                      )}

                      <button
                        type="button"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary-600 border border-primary-600/30 hover:bg-primary-50 transition-colors disabled:opacity-50"
                        onClick={handleRegenerateReply}
                        disabled={isRegenerating || sending}
                        title="Régénérer la réponse IA"
                      >
                        {isRegenerating ? (
                          <>
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                            </svg>
                            Génération…
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 4v6h6M23 20v-6h-6"/>
                              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                            </svg>
                            Régénérer
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-secondary hover:bg-surface-muted transition-colors disabled:opacity-50"
                        onClick={handleDeleteEmail}
                        disabled={sending || deleting}
                      >
                        {deleting ? "Suppression…" : "Supprimer de la liste"}
                      </button>

                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-secondary hover:bg-surface-muted transition-colors disabled:opacity-50"
                        onClick={() => handleBlacklist(
                          selected?.sender_email || selected?.from_email || selected?.from ||
                          selectedFromList?.sender_email || selectedFromList?.from_email || selectedFromList?.from || ""
                        )}
                        disabled={sending || deleting}
                        title="Blacklister le domaine de cet expéditeur"
                      >
                        🚫 Blacklister ce domaine
                      </button>

                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-secondary hover:bg-surface-muted transition-colors disabled:opacity-50"
                        onClick={() => setReportModal({ emailId: selectedId })}
                        disabled={sending || deleting}
                        title="Signaler une erreur de traitement"
                      >
                        ⚠️ Signaler
                      </button>
                    </div>
                  </div>

                  {regenError && (
                    <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
                      {regenError}
                    </div>
                  )}

                  {(suggestedResponse || editedReply !== null) ? (
                    <div className="px-4 pb-4 pt-3">
                      <textarea
                        value={editedReply ?? suggestedResponse}
                        onChange={(e) => setEditedReply(e.target.value)}
                        rows={8}
                        className="w-full px-3 py-2.5 bg-surface-bg border border-surface-border rounded-lg text-xs text-ink-secondary leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 focus:bg-white transition-all duration-200 resize-y"
                        placeholder="La réponse IA apparaîtra ici…"
                      />
                      {editedReply !== null && editedReply !== suggestedResponse && (
                        <p className="mt-1 text-xs text-ink-tertiary">
                          Réponse modifiée — sera envoyée telle quelle
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="px-4 py-3 text-sm text-ink-secondary">
                      Aucune réponse IA générée pour cet email.
                    </div>
                  )}
                </div>

                {/* Email brut */}
                {showRaw && (
                  <div className="px-4 pb-4">
                    {selected?.bodyText ? (
                      <pre className="font-mono text-xs text-ink-secondary whitespace-pre-wrap bg-surface-bg rounded-lg p-3 overflow-auto max-h-64">
                        {selected.bodyText}
                      </pre>
                    ) : (
                      <div className="text-sm text-ink-secondary">
                        Pas de contenu texte
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}

// ── Composant modal de signalement ────────────────────────────────────────────

const REPORT_REASONS = [
  { value: "non_immobilier",        label: "Email hors-sujet (pas une candidature locative)" },
  { value: "agence",                label: "Email de ma propre agence (boucle interne)" },
  { value: "mauvaise_classification", label: "Classifié incorrectement par l'IA" },
  { value: "autre",                 label: "Autre raison" },
];

function ReportModal({ emailId, onConfirm, onClose }) {
  const [reason, setReason] = React.useState("");

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-[#E2E8F0] max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Titre */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-amber-500 text-lg">⚠️</span>
          <h3 className="text-lg font-semibold text-[#0F172A]">Signaler un problème</h3>
        </div>
        <p className="text-sm text-[#475569] mt-1 mb-5">
          Indiquez pourquoi cet email a été mal traité. Votre retour améliore la classification IA.
        </p>

        {/* Options */}
        <div className="flex flex-col gap-3">
          {REPORT_REASONS.map((r) => {
            const selected = reason === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                className={`flex items-center gap-3 w-full text-left rounded-xl p-3 border transition-all duration-200 cursor-pointer ${
                  selected
                    ? "bg-[#EFF6FF] border-[#2563EB]"
                    : "bg-[#F8FAFC] border-[#E2E8F0] hover:border-[#2563EB]/40 hover:bg-[#EFF6FF]"
                }`}
              >
                <span
                  className={`flex-shrink-0 w-4 h-4 rounded-full border-2 transition-all ${
                    selected
                      ? "bg-[#2563EB] border-[#2563EB]"
                      : "bg-white border-[#CBD5E1]"
                  }`}
                />
                <span className="text-sm font-medium text-[#0F172A]">{r.label}</span>
              </button>
            );
          })}
        </div>

        {/* Boutons */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            className="px-4 py-2 rounded-lg text-sm bg-transparent border border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC] transition-all"
            onClick={onClose}
          >
            Annuler
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] transition-all ${
              !reason ? "opacity-50 cursor-not-allowed" : ""
            }`}
            onClick={() => reason && onConfirm(reason)}
            disabled={!reason}
          >
            Envoyer le signalement
          </button>
        </div>
      </div>
    </div>
  );
}