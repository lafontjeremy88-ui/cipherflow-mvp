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
  return {
    id: e.id || e.email_id || e.emailId || "",
    subject: e.subject || e.title || "(Sans sujet)",
    from: e.from || e.sender || e.email_from || e.emailFrom || "",
    category: e.category || "Autre",
    urgency: e.urgency || e.priority || "FAIBLE",
    createdAt: e.created_at || e.received_at || e.date || e.createdAt || "",
    body: e.body || e.text || e.content || "",
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
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${txt}`);
      }

      const payload = await safeJson(res);
      const arr = pickArray(payload).map(normalizeEmail);
      setItems(arr);

      // Deep-link open
      if (deepLinkEmailId) {
        const found = arr.find((x) => String(x.id) === String(deepLinkEmailId));
        if (found) {
          setSelected(found);
          setOpen(true);
        }
      }
    } catch (e) {
      setError(e?.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si l’URL change (emailId=...), on ouvre le mail si on le trouve déjà en liste
  useEffect(() => {
    if (!deepLinkEmailId) return;
    const found = items.find((x) => String(x.id) === String(deepLinkEmailId));
    if (found) {
      setSelected(found);
      setOpen(true);
    }
  }, [deepLinkEmailId, items]);

  const filtered = useMemo(() => {
    let arr = [...items];

    // filter
    if (filter !== "Tout") {
      arr = arr.filter((x) => (x.category || "Autre") === filter);
    }

    // search
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(
        (x) =>
          String(x.subject).toLowerCase().includes(q) ||
          String(x.from).toLowerCase().includes(q) ||
          String(x.category).toLowerCase().includes(q)
      );
    }

    // sort
    if (sort === "recent") {
      arr.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    } else if (sort === "old") {
      arr.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    }

    return arr;
  }, [items, filter, search, sort]);

  const categories = useMemo(() => {
    const set = new Set(items.map((x) => x.category || "Autre"));
    return ["Tout", ...Array.from(set)];
  }, [items]);

  const openEmail = (email) => {
    setSelected(email);
    setOpen(true);
    // On push le deep-link dans l’URL
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("emailId", email.id);
      return p;
    });
  };

  const closeModal = () => {
    setOpen(false);
    setSelected(null);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete("emailId");
      return p;
    });
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Historique des Activités</h1>
      </div>

      {error && (
        <div className="alert error">
          <strong>Erreur:</strong> {error}
        </div>
      )}

      <div className="toolbar">
        <input
          className="input"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)}>
          {categories.map((c) => (
            <option key={c} value={c}>
              Filtre: {c}
            </option>
          ))}
        </select>

        <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Plus récents (Défaut)</option>
          <option value="old">Plus anciens</option>
        </select>

        <button className="btn" onClick={loadHistory} disabled={loading}>
          Rafraîchir
        </button>
      </div>

      <div className="list">
        {loading ? (
          <div className="muted">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="muted">Aucun email trouvé.</div>
        ) : (
          filtered.map((m) => (
            <div key={m.id} className="list-row">
              <div className={urgencyBadge(m.urgency)}>{String(m.urgency || "FAIBLE").toUpperCase()}</div>

              <div className="list-main">
                <div className="list-subject">{m.subject}</div>
                <div className="list-meta">
                  <span className="meta-from">{m.from}</span>
                  {m.createdAt ? <span className="meta-date"> • {String(m.createdAt).slice(0, 16)}</span> : null}
                  <span className="meta-cat"> • {m.category}</span>
                </div>
              </div>

              <div className="list-actions">
                <button className="icon-btn" onClick={() => openEmail(m)} title="Voir">
                  👁️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {open && selected && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{selected.subject}</div>
                <div className="modal-subtitle">
                  {selected.from} • {selected.category} • {String(selected.createdAt).slice(0, 16)}
                </div>
              </div>
              <button className="icon-btn" onClick={closeModal} title="Fermer">
                ✖
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
