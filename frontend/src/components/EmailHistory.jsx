import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { authFetch } from "../services/api";

/**
 * EmailHistory.jsx
 * ----------------
 * Page "Historique des Activités" :
 * - Charge la liste des emails (GET /email/history?limit=50)
 * - Permet filtre / recherche
 * - Permet d'ouvrir un email via URL : /emails/history?emailId=25
 * - Va chercher le détail email côté backend : GET /email/{email_id}
 * - Transforme raw_email_text (MIME) en contenu lisible (text/plain ou text/html)
 */

function stripHtmlToText(html) {
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

function decodeQuotedPrintable(input) {
  if (!input) return "";
  // supprime les "soft line breaks" =\r\n
  let s = input.replace(/=\r?\n/g, "");
  // remplace =XX
  s = s.replace(/=([A-Fa-f0-9]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  return s;
}

function base64ToUtf8(b64) {
  if (!b64) return "";
  // nettoie les espaces / retours ligne
  const clean = b64.replace(/\s+/g, "");
  try {
    // atob donne une string binaire latin1 ; on reconvertit vers utf-8
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    // fallback
    try {
      return atob(clean);
    } catch {
      return "";
    }
  }
}

function extractMimePart(raw, wantedType /* "text/plain" | "text/html" */) {
  if (!raw) return null;

  // Cherche une section Content-Type: wantedType ... puis récupère le payload jusqu'à la prochaine boundary
  // (Parsing simple mais très efficace pour 80% des emails)
  const re = new RegExp(
    `Content-Type:\\s*${wantedType}[^\\n]*\\n([\\s\\S]*?)\\n\\n([\\s\\S]*?)(\\n--|\\n\\r?--|\\Z)`,
    "i"
  );
  const m = raw.match(re);
  if (!m) return null;

  const headersBlock = m[1] || "";
  let payload = (m[2] || "").trim();

  const isBase64 = /Content-Transfer-Encoding:\s*base64/i.test(headersBlock);
  const isQP = /Content-Transfer-Encoding:\s*quoted-printable/i.test(headersBlock);

  if (isBase64) payload = base64ToUtf8(payload);
  else if (isQP) payload = decodeQuotedPrintable(payload);

  return payload.trim();
}

function buildReadableBodyFromRaw(raw) {
  if (!raw) return "";

  // 1) text/plain
  const plain = extractMimePart(raw, "text/plain");
  if (plain) return plain;

  // 2) text/html -> text
  const html = extractMimePart(raw, "text/html");
  if (html) return stripHtmlToText(html);

  // 3) fallback : si raw est déjà "lisible"
  // (mais on évite d'afficher des blocs base64 énormes)
  const maybe = String(raw);
  if (maybe.length < 5000 && /[a-zA-Z]{3,}/.test(maybe)) return maybe;

  return "";
}

function normalizeUrgency(u) {
  const s = String(u || "").toLowerCase().trim();
  if (!s) return "";
  if (s.includes("haute") || s === "high" || s === "urgent") return "haute";
  if (s.includes("moy") || s === "medium") return "moyenne";
  if (s.includes("faible") || s === "low") return "faible";
  return s;
}

function parseDateValue(x) {
  // essaie de parser e.date / e.received_at / e.created_at
  const raw = x?.date || x?.received_at || x?.created_at || "";
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

function formatDateShort(x) {
  const d = parseDateValue(x);
  if (!d) return "";
  try {
    return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return d.toISOString();
  }
}

export default function EmailHistory() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [filter, setFilter] = useState("all"); // all | high_urgency
  const [sort, setSort] = useState("recent"); // recent | oldest
  const [query, setQuery] = useState("");

  // Detail state (panneau à droite)
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null); // { id, subject, ... , bodyText }
  const [detailLoading, setDetailLoading] = useState(false);

  // --------- Load list (history) ----------
  async function loadHistory() {
    setLoading(true);
    try {
      const res = await authFetch("/email/history?limit=50");
      if (!res.ok) throw new Error("Erreur chargement historique");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------- Open detail by URL (?emailId=xx) ----------
  const emailIdFromUrl = searchParams.get("emailId");

  async function loadEmailDetail(emailId) {
    if (!emailId) return;
    setDetailLoading(true);

    try {
      const res = await authFetch(`/email/${emailId}`);
      if (!res.ok) throw new Error("Erreur chargement détail email");
      const detail = await res.json();

      const raw = detail?.raw_email_text || detail?.raw || "";
      const readable = buildReadableBodyFromRaw(raw);

      // On garde aussi un fallback sur ce qu'on a déjà
      const fallbackBody = readable || detail?.summary || detail?.suggested_response || "";

      setSelected({
        id: detail?.id ?? Number(emailId),
        subject: detail?.subject || "(Sans sujet)",
        from: detail?.from_email || detail?.from || "",
        category: detail?.category || "",
        urgency: detail?.urgency || "",
        received_at: detail?.received_at || detail?.created_at || "",
        bodyText: fallbackBody,
        // pour debug au besoin :
        raw_email_text: raw,
      });
    } catch (e) {
      console.error(e);
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (emailIdFromUrl) {
      setSelectedId(String(emailIdFromUrl));
      loadEmailDetail(String(emailIdFromUrl));
    } else {
      setSelectedId(null);
      setSelected(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailIdFromUrl]);

  function setEmailIdInUrl(id) {
    const next = new URLSearchParams(searchParams);
    if (!id) next.delete("emailId");
    else next.set("emailId", String(id));
    setSearchParams(next, { replace: false });
  }

  function onClickItem(id) {
    setEmailIdInUrl(id);
  }

  // --------- Filtering / sorting ----------
  const filtered = useMemo(() => {
    let arr = Array.isArray(items) ? [...items] : [];

    // filtre URL prioritaire (ex: depuis dashboard)
    const filterFromUrl = searchParams.get("filter");
    const effectiveFilter = filterFromUrl || filter;

    if (effectiveFilter && effectiveFilter !== "all") {
      if (effectiveFilter === "high_urgency") {
        arr = arr.filter((x) => normalizeUrgency(x.urgency).includes("haute"));
      }
    }

    // recherche
    const q = query.trim().toLowerCase();
    if (q) {
      arr = arr.filter((x) => {
        const subject = String(x.subject || "").toLowerCase();
        const from = String(x.from || x.from_email || "").toLowerCase();
        const category = String(x.category || "").toLowerCase();
        return subject.includes(q) || from.includes(q) || category.includes(q);
      });
    }

    // tri réel par date si possible (sinon on garde l’ordre backend)
    arr.sort((a, b) => {
      const da = parseDateValue(a)?.getTime() ?? 0;
      const db = parseDateValue(b)?.getTime() ?? 0;
      if (sort === "oldest") return da - db;
      return db - da;
    });

    return arr;
  }, [items, query, sort, filter, searchParams]);

  const selectedFromList = useMemo(() => {
    if (!selectedId) return null;
    return items.find((x) => String(x.id) === String(selectedId)) || null;
  }, [items, selectedId]);

  return (
    <div className="page email-history">
      <div className="page-header">
        <h1>Historique des Activités</h1>

        <div className="toolbar">
          <input
            className="search"
            placeholder="Rechercher…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Filtre: Tout</option>
            <option value="high_urgency">Urgence haute</option>
          </select>

          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Plus récents (Défaut)</option>
            <option value="oldest">Plus anciens</option>
          </select>

          <button className="btn" onClick={loadHistory} disabled={loading}>
            {loading ? "Chargement…" : "Rafraîchir"}
          </button>

          {searchParams.get("filter") && (
            <button
              className="btn"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("filter");
                setSearchParams(next, { replace: true });
              }}
            >
              Retirer le filtre
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="muted">Chargement de l’historique…</div>
      ) : filtered.length === 0 ? (
        <div className="muted">Aucun email trouvé.</div>
      ) : (
        <div className="eh-layout">
          {/* LISTE (gauche) */}
          <div className="eh-list" role="list">
            {filtered.map((e) => {
              const urg = normalizeUrgency(e.urgency);
              const active = String(e.id) === String(selectedId);

              return (
                <button
                  key={e.id}
                  type="button"
                  className={`eh-item ${active ? "is-active" : ""}`}
                  onClick={() => onClickItem(e.id)}
                  title="Ouvrir"
                >
                  <div className="eh-item-top">
                    <span className={`eh-pill eh-pill-${urg || "none"}`}>
                      {(e.urgency || "").toString().toUpperCase() || "—"}
                    </span>
                    <span className="eh-date">{formatDateShort(e)}</span>
                  </div>

                  <div className="eh-subject">{e.subject || "(Sans sujet)"}</div>

                  <div className="eh-meta">
                    <span className="eh-from">{e.from || e.from_email || "—"}</span>
                    <span className="eh-dot">•</span>
                    <span className="eh-cat">{e.category || "—"}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* PREVIEW (droite) */}
          <div className="eh-preview">
            {!selectedId ? (
              <div className="eh-empty">
                <div className="eh-empty-title">Sélectionne un email</div>
                <div className="muted">
                  Clique à gauche pour afficher le contenu ici.
                </div>
              </div>
            ) : detailLoading ? (
              <div className="eh-empty">
                <div className="muted">Chargement de l’email…</div>
              </div>
            ) : (
              <>
                <div className="eh-preview-header">
                  <div className="eh-preview-title">
                    {selected?.subject || selectedFromList?.subject || "Email"}
                  </div>

                  <div className="eh-preview-sub">
                    <span className="muted">
                      {selected?.from ||
                        selectedFromList?.from ||
                        selectedFromList?.from_email ||
                        ""}
                    </span>
                    <span className="eh-dot">•</span>
                    <span className="muted">
                      {selected?.category || selectedFromList?.category || "—"}
                    </span>
                    <span className="eh-dot">•</span>
                    <span className="muted">
                      {selected?.received_at
                        ? String(selected.received_at)
                        : formatDateShort(selectedFromList)}
                    </span>
                  </div>

                  <div className="eh-preview-actions">
                    <button className="btn btn-ghost" onClick={() => setEmailIdInUrl(null)}>
                      Fermer
                    </button>
                  </div>
                </div>

                <div className="eh-preview-body">
                  {selected?.bodyText ? (
                    <pre className="email-body">{selected.bodyText}</pre>
                  ) : (
                    <div className="muted">Aucun contenu disponible.</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
