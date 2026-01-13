import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authFetch } from "../services/api";

/**
 * EmailHistory.jsx
 * ----------------
 * Page "Historique des Activités" :
 * - Charge la liste des emails (GET /email/history?limit=50)
 * - Permet filtre / recherche
 * - Permet d'ouvrir un email en modal via URL : /emails/history?emailId=25
 * - Va chercher le détail email côté backend : GET /email/{email_id}
 * - Transforme raw_email_text (MIME) en contenu lisible (text/plain ou text/html)
 */

function stripHtmlToText(html) {
  try {
    const div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent || div.innerText || "").trim();
  } catch {
    return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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

export default function EmailHistory() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [filter, setFilter] = useState("all"); // all | high_urgency | ...
  const [sort, setSort] = useState("recent"); // recent | oldest
  const [query, setQuery] = useState("");

  // Modal state
  const [open, setOpen] = useState(false);
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

  async function openEmailById(emailId) {
    if (!emailId) return;
    setOpen(true);
    setDetailLoading(true);

    try {
      const res = await authFetch(`/email/${emailId}`);
      if (!res.ok) throw new Error("Erreur chargement détail email");
      const detail = await res.json();

      const raw = detail?.raw_email_text || detail?.raw || "";
      const readable = buildReadableBodyFromRaw(raw);

      // On garde aussi un fallback sur ce qu'on a déjà
      const fallbackBody =
        readable ||
        detail?.summary ||
        detail?.suggested_response ||
        "";

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
      openEmailById(emailIdFromUrl);
    } else {
      setOpen(false);
      setSelected(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailIdFromUrl]);

  function closeModal() {
    setOpen(false);
    setSelected(null);
    // on retire emailId de l'URL
    const next = new URLSearchParams(searchParams);
    next.delete("emailId");
    setSearchParams(next, { replace: true });
  }

  function onClickItem(id) {
    // on met emailId dans l'URL (ça ouvre la modal via useEffect)
    const next = new URLSearchParams(searchParams);
    next.set("emailId", String(id));
    setSearchParams(next, { replace: false });
  }

  // --------- Filtering / sorting ----------
  const filtered = useMemo(() => {
    let arr = [...items];

    // filtre (ex: depuis dashboard tu passes filter=high_urgency)
    const filterFromUrl = searchParams.get("filter");
    const effectiveFilter = filterFromUrl || filter;

    if (effectiveFilter && effectiveFilter !== "all") {
      arr = arr.filter((x) => String(x.filter || x.urgency || "").toLowerCase() !== ""); // safe
      // Si ton backend met l'urgency en texte : "Haute"/"Moyenne"/"Faible"
      if (effectiveFilter === "high_urgency") {
        arr = arr.filter((x) => String(x.urgency || "").toLowerCase().includes("haute"));
      }
    }

    // recherche
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter(
        (x) =>
          String(x.subject || "").toLowerCase().includes(q) ||
          String(x.from || x.from_email || "").toLowerCase().includes(q) ||
          String(x.category || "").toLowerCase().includes(q)
      );
    }

    // tri
    if (sort === "oldest") arr.reverse();

    return arr;
  }, [items, query, sort, filter, searchParams]);

  return (
    <div className="page">
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
        <div className="email-list">
          {filtered.map((e) => (
            <button
              key={e.id}
              type="button"
              className="email-row"
              onClick={() => onClickItem(e.id)}
              title="Ouvrir"
            >
              <div className="email-row-left">
                <div className={`pill pill-${String(e.urgency || "").toLowerCase()}`}>
                  {(e.urgency || "").toString().toUpperCase() || "—"}
                </div>

                <div className="email-row-main">
                  <div className="email-subject">{e.subject || "(Sans sujet)"}</div>
                  <div className="email-meta">
                    <span className="muted">{e.date || e.received_at || ""}</span>
                    {" • "}
                    <span className="muted">{e.category || "—"}</span>
                  </div>
                </div>
              </div>

              <div className="email-row-right">
                <span className="muted">{e.from || e.from_email || ""}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* MODAL */}
      {open && (
        <div className="modal-overlay" onMouseDown={closeModal}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">
                  {selected?.subject || "Email"}
                </div>
                <div className="modal-subtitle">
                  {selected?.from ? `• ${selected.from}` : ""}{" "}
                  {selected?.category ? `• ${selected.category}` : ""}{" "}
                  {selected?.received_at ? `• ${selected.received_at}` : ""}
                </div>
              </div>

              <button className="modal-close" onClick={closeModal} aria-label="Fermer">
                ✕
              </button>
            </div>

            <div className="modal-body">
              {detailLoading ? (
                <div className="muted">Chargement de l’email…</div>
              ) : selected?.bodyText ? (
                <pre className="email-body">{selected.bodyText}</pre>
              ) : (
                <div className="muted">Aucun contenu disponible.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
