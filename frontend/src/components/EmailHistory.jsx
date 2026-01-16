import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { authFetch } from "../services/api";

/**
 * EmailHistory.jsx
 * ----------------
 * - GET /email/history?limit=50
 * - filtres / recherche / tri
 * - preview via /emails/history?emailId=25
 * - GET /email/{email_id}
 * - parsing MIME -> text/plain ou text/html
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
    `Content-Type:\\s*${wantedType.replace(
      "/",
      "\\/"
    )}[^\\n]*\\n([\\s\\S]*?)(\\n--|\\nContent-Type:|$)`,
    "i"
  );

  const m = raw.match(ctRegex);
  if (!m) return null;

  let chunk = m[1] || "";

  const encodingMatch = chunk.match(
    /Content-Transfer-Encoding:\s*([^\n\r]+)/i
  );
  const encoding = encodingMatch ? encodingMatch[1].trim().toLowerCase() : "";

  // enlever les headers du chunk
  chunk = chunk.replace(/^[\s\S]*?\r?\n\r?\n/, "");

  if (encoding.includes("quoted-printable"))
    return decodeQuotedPrintable(chunk).trim();
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

/* ==========================
   Couleurs de catégorie (alignées sur le Dashboard)
   ========================== */

const CATEGORY_COLORS = {
  Autre: "#6D5EF8", // violet (catégorie générique)
  Administratif: "#44C2A8", // vert/teal
  Candidature: "#F4B04F", // jaune/amber
  Incident: "#E46C6C", // rouge
};

function getCategoryColor(name) {
  if (!name) return "#64748b"; // gris par défaut
  return CATEGORY_COLORS[name] || "#64748b";
}

/* ==========================
   Component
   ========================== */

export default function EmailHistory() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [filter, setFilter] = useState("all"); // all | high_urgency
  const [sort, setSort] = useState("recent"); // recent | oldest
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const [selectedId, setSelectedId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  const urlEmailId = searchParams.get("emailId");
  const urlFilter = searchParams.get("filter");
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

            const raw = data?.raw_email_text || data?.raw || "";
      const plain = extractMimePart(raw, "text/plain");
      const html = extractMimePart(raw, "text/html");

      let bodyText = "";

      if (plain && plain.trim()) {
        // Cas classique MIME text/plain
        bodyText = plain.trim();
      } else if (html && html.trim()) {
        // Cas MIME HTML -> on le convertit en texte
        bodyText = htmlToText(html.trim());
      } else if (raw && raw.trim()) {
        // ✅ Cas comme ton JSON actuel : raw_email_text déjà "lisible"
        bodyText = raw.trim();
      } else {
        // Dernier fallback sur d'autres champs possibles
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
  }

  // premier chargement
  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL → filtre d'urgence
  useEffect(() => {
    if (urlFilter) setFilter(urlFilter);
  }, [urlFilter]);

  // URL → catégorie (depuis le donut / la légende)
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

    // filtre urgence
    if (filter === "high_urgency") {
      arr = arr.filter((e) =>
        String(e.urgency || "")
          .toLowerCase()
          .includes("high") ||
        String(e.urgency || "")
          .toLowerCase()
          .includes("haute")
      );
    }

    // filtre par catégorie (depuis le donut)
    if (category !== "all") {
      const c = category.toLowerCase();
      arr = arr.filter(
        (e) => String(e.category || "").toLowerCase() === c
      );
    }

    // recherche texte
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter((e) => {
        const subject = (e.subject || "").toLowerCase();
        const from = (e.from || e.from_email || "").toLowerCase();
        const cat = (e.category || "").toLowerCase();
        return subject.includes(q) || from.includes(q) || cat.includes(q);
      });
    }

    // tri chronologique
    arr.sort((a, b) => {
      const da = new Date(
        a.received_at || a.date || a.created_at || 0
      ).getTime();
      const db = new Date(
        b.received_at || b.date || b.created_at || 0
      ).getTime();
      return sort === "oldest" ? da - db : db - da;
    });

    return arr;
  }, [items, filter, category, sort, query]);

  const selectedFromList = useMemo(() => {
    if (!selectedId) return null;
    return (
      filtered.find(
        (x) => String(x.id) === String(selectedId)
      ) || null
    );
  }, [filtered, selectedId]);

  return (
    <div className="page email-history">
      <div className="page-header">
        <div>
          <h1>Historique des emails</h1>
          <p className="muted">
            Recherche, filtre et ouvre un email pour afficher le contenu.
          </p>
        </div>

        <div className="toolbar">
          <input
            className="input"
            placeholder="Rechercher… (objet, expéditeur, catégorie)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <select
            className="select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Filtre : Tout</option>
            <option value="high_urgency">Urgence haute</option>
          </select>

          <select
            className="select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">Tri : plus récents</option>
            <option value="oldest">Tri : plus anciens</option>
          </select>

          <button
            className="btn"
            onClick={loadHistory}
            disabled={loading}
          >
            {loading ? "Chargement…" : "Rafraîchir"}
          </button>

          {searchParams.get("category") && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("category");
                setSearchParams(next, { replace: true });
              }}
            >
              Retirer la catégorie
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
          {/* LISTE */}
          <div className="card eh-panel">
            <div className="card-header">
              <h2 className="card-title">Liste</h2>
              <span className="badge">{filtered.length}</span>
            </div>

            <div className="eh-list">
              {filtered.map((e) => {
                const active =
                  String(e.id) === String(selectedId);
                const urg = (e.urgency || "")
                  .toString()
                  .toLowerCase();

                const pill =
                  urg.includes("high") || urg.includes("haute")
                    ? "eh-pill eh-pill-high"
                    : urg.includes("medium") ||
                      urg.includes("moy")
                    ? "eh-pill eh-pill-medium"
                    : "eh-pill eh-pill-none";

                return (
                  <button
                    key={e.id}
                    type="button"
                    className={`eh-item ${
                      active ? "is-active" : ""
                    }`}
                    onClick={() => onClickItem(e.id)}
                    title="Ouvrir"
                  >
                    <div className="eh-item-top">
                      <span className={pill}>
                        {(e.urgency || "")
                          .toString()
                          .toUpperCase() || "—"}
                      </span>
                      <span className="eh-date">
                        {formatDateShort(e)}
                      </span>
                    </div>

                    <div className="eh-subject">
                      {e.subject || "(Sans sujet)"}
                    </div>

                    <div className="eh-meta">
                      <span className="eh-from">
                        {e.from ||
                          e.from_email ||
                          "—"}
                      </span>
                      <span className="eh-dot">•</span>
                      <span className="eh-cat">
                        <span
                          className="eh-cat-dot"
                          style={{
                            backgroundColor: getCategoryColor(
                              e.category
                            ),
                          }}
                        />
                        {e.category || "—"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PREVIEW */}
          <div className="card eh-panel">
            <div className="card-header">
              <h2 className="card-title">Prévisualisation</h2>

              {!!selectedId && (
                <button
                  className="btn btn-ghost"
                  onClick={() => setEmailIdInUrl(null)}
                >
                  Fermer
                </button>
              )}
            </div>

            {!selectedId ? (
              <div className="eh-empty">
                <div className="eh-empty-title">
                  Sélectionne un email
                </div>
                <div className="muted">
                  Clique à gauche pour afficher le
                  contenu ici.
                </div>
              </div>
            ) : detailLoading ? (
              <div className="eh-empty">
                <div className="muted">
                  Chargement de l’email…
                </div>
              </div>
            ) : (
              <>
                <div className="eh-preview-header">
                  <div className="eh-preview-title">
                    {selected?.subject ||
                      selectedFromList?.subject ||
                      "Email"}
                  </div>

                  <div className="eh-preview-sub muted">
                    <span>
                      {selected?.from ||
                        selectedFromList?.from ||
                        selectedFromList?.from_email ||
                        ""}
                    </span>
                    <span className="eh-dot">•</span>
                    <span className="eh-cat">
                      <span
                        className="eh-cat-dot"
                        style={{
                          backgroundColor: getCategoryColor(
                            selected?.category ||
                              selectedFromList?.category
                          ),
                        }}
                      />
                      {selected?.category ||
                        selectedFromList?.category ||
                        "—"}
                    </span>
                    <span className="eh-dot">•</span>
                    <span>
                      {selected?.received_at
                        ? String(selected.received_at)
                        : formatDateShort(selectedFromList)}
                    </span>
                  </div>
                </div>

                <div className="eh-preview-body">
                  {selected?.bodyText ? (
                    <pre className="email-body">
                      {selected.bodyText}
                    </pre>
                  ) : (
                    <div className="muted">
                      Aucun contenu disponible.
                    </div>
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
