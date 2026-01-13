import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

function safeJson(res) {
  return res.json().catch(() => ({}));
}

function pickArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.emails)) return payload.emails;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeEmail(e) {
  // ✅ IMPORTANT : le backend renvoie le contenu dans raw_email_text
  const body =
    e.raw_email_text ||
    e.body ||
    e.text ||
    e.content ||
    e.raw ||
    "";

  return {
    id: e.id || e.email_id || e.emailId || "",
    subject: e.subject || e.title || "(Sans sujet)",
    from: e.sender_email || e.from || e.sender || e.email_from || e.emailFrom || "",
    category: e.category || "Autre",
    urgency: e.urgency || e.priority || "FAIBLE",
    createdAt: e.created_at || e.received_at || e.date || e.createdAt || "",
    summary: e.summary || "",
    body,
    raw: e,
  };
}

function urgencyBadge(u) {
  const x = String(u || "").toUpperCase();
  if (x.includes("HAUT") || x.includes("HIGH")) return "badge badge-high";
  if (x.includes("MOY") || x.includes("MED")) return "badge badge-med";
  return "badge badge-low";
}

export default function EmailHistory({ authFetch }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkEmailId = searchParams.get("emailId") || "";
  const deepLinkFilter = searchParams.get("filter") || "";

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Tout");
  const [sort, setSort] = useState("recent");

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  async function loadHistory() {
    setLoading(true);
    setError("");

    try {
      const qs = new URLSearchParams();
      qs.set("limit", "50");
      const url = `/email/history?${qs.toString()}`;

      const res = await authFetch(url);
      const payload = await safeJson(res);

      if (!res.ok) {
        setError(payload?.detail || "Impossible de charger l'historique.");
        setItems([]);
        setLoading(false);
        return;
      }

      const normalized = pickArray(payload).map(normalizeEmail);
      setItems(normalized);
    } catch (e) {
      setError("Erreur réseau lors du chargement.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function openEmail(email) {
    if (!email) return;
    setSelected(email);
    setOpen(true);

    // ✅ on met l’emailId dans l’URL pour que Dashboard -> EmailHistory ouvre le bon email
    const next = new URLSearchParams(searchParams);
    next.set("emailId", String(email.id));
    setSearchParams(next);
  }

  function closeModal() {
    setOpen(false);
    setSelected(null);

    // ✅ on nettoie l’URL (sinon ça ré-ouvre à chaque refresh)
    const next = new URLSearchParams(searchParams);
    next.delete("emailId");
    setSearchParams(next);
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ applique un filtre venant du Dashboard (ex: ?filter=high_urgency)
  useEffect(() => {
    if (!deepLinkFilter) return;
    if (deepLinkFilter === "high_urgency") setFilter("Urgence haute");
  }, [deepLinkFilter]);

  // ✅ deep-link : si on arrive avec ?emailId=xx, on ouvre le mail automatiquement
  useEffect(() => {
    if (!deepLinkEmailId) return;
    const found = items.find((x) => String(x.id) === String(deepLinkEmailId));
    if (found) openEmail(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkEmailId, items]);

  const filtered = useMemo(() => {
    let list = [...items];

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((e) => {
        return (
          String(e.subject || "").toLowerCase().includes(q) ||
          String(e.from || "").toLowerCase().includes(q) ||
          String(e.category || "").toLowerCase().includes(q) ||
          String(e.urgency || "").toLowerCase().includes(q)
        );
      });
    }

    if (filter === "Urgence haute") {
      list = list.filter((e) => String(e.urgency || "").toUpperCase().includes("HAUT"));
    } else if (filter !== "Tout") {
      list = list.filter((e) => String(e.category || "") === filter);
    }

    if (sort === "recent") {
      list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    } else if (sort === "old") {
      list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    }

    return list;
  }, [items, search, filter, sort]);

  const categories = useMemo(() => {
    const set = new Set(items.map((x) => x.category).filter(Boolean));
    return ["Tout", ...Array.from(set)];
  }, [items]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Historique des Activités</h1>
      </div>

      <div className="controls">
        <input
          className="input"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="row">
          <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="Tout">Tout</option>
            <option value="Urgence haute">Urgence haute</option>
            {categories
              .filter((c) => c !== "Tout")
              .map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
          </select>

          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Plus récents (Défaut)</option>
            <option value="old">Plus anciens</option>
          </select>

          <button className="btn" onClick={loadHistory}>
            Rafraîchir
          </button>

          {filter === "Urgence haute" && (
            <button className="btn btn-light" onClick={() => setFilter("Tout")}>
              Retirer le filtre
            </button>
          )}
        </div>
      </div>

      {loading && <div className="muted">Chargement…</div>}
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <div className="list">
          {filtered.map((e) => (
            // ✅ Toute la ligne est cliquable
            <button
              key={e.id}
              type="button"
              className="email-row"
              onClick={() => openEmail(e)}
              title="Ouvrir l'email"
            >
              <div className={urgencyBadge(e.urgency)}>{String(e.urgency || "FAIBLE").toUpperCase()}</div>

              <div className="email-main">
                <div className="email-subject">{e.subject}</div>
                <div className="email-meta">
                  <span>{e.from || "-"}</span>
                  <span className="dot">•</span>
                  <span>{e.createdAt || "-"}</span>
                  <span className="dot">•</span>
                  <span>{e.category || "Autre"}</span>
                </div>

                {e.summary ? <div className="email-summary">{e.summary}</div> : null}
              </div>
            </button>
          ))}

          {filtered.length === 0 && <div className="muted">Aucun email.</div>}
        </div>
      )}

      {/* ✅ Modal email */}
      {open && selected && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{selected.subject}</div>
                <div className="modal-sub">
                  • {selected.category || "Autre"} • {selected.createdAt || "-"}
                </div>
              </div>
              <button className="modal-close" onClick={closeModal} aria-label="Fermer">
                ×
              </button>
            </div>

            <div className="modal-body">
              {selected.body ? (
                <pre className="email-body">{selected.body}</pre>
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
