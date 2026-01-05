import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../App";

function safePickArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.emails)) return data.emails;
  if (Array.isArray(data?.history)) return data.history;
  return [];
}

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

function formatDateFR(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function EmailHistory() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const query = useQuery();

  const deepEmailId = query.get("emailId") || "";
  const filter = query.get("filter") || "all";

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(deepEmailId);
  const [searchText, setSearchText] = useState("");

  // charge l'historique
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const res = await authFetch("/email/history");
        const data = res.ok ? await res.json() : null;
        const arr = safePickArray(data);

        if (!alive) return;

        setItems(arr);

        // deep-link prioritaire
        if (deepEmailId) {
          const found = arr.find((x) => String(x?.id || x?._id || x?.email_id || x?.emailId) === String(deepEmailId));
          if (found) setSelectedId(String(deepEmailId));
        } else if (arr.length && !selectedId) {
          const firstId = arr[0]?.id || arr[0]?._id || arr[0]?.email_id || arr[0]?.emailId;
          if (firstId) setSelectedId(String(firstId));
        }
      } catch (e) {
        if (!alive) return;
        setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authFetch]);

  // si on arrive via dashboard /history?emailId=...
  useEffect(() => {
    if (!deepEmailId) return;
    setSelectedId(deepEmailId);
  }, [deepEmailId]);

  const filtered = useMemo(() => {
    const s = searchText.trim().toLowerCase();

    return items.filter((e) => {
      const cat = (e?.category || e?.type || "autre").toString().toLowerCase();

      if (filter === "urgent") {
        const urgent = Boolean(e?.urgent || e?.is_urgent || e?.priority === "high" || e?.urgency === "high");
        if (!urgent) return false;
      }

      if (filter === "invoices") {
        // à adapter si tu as un champ spécial quittance
        const isInvoice = cat.includes("quittance") || cat.includes("loyer") || Boolean(e?.invoice_generated);
        if (!isInvoice) return false;
      }

      if (!s) return true;

      const subject = (e?.subject || e?.title || "").toString().toLowerCase();
      const from = (e?.from || e?.sender || e?.expediteur || "").toString().toLowerCase();
      const body = (e?.body || e?.content || e?.snippet || "").toString().toLowerCase();

      return subject.includes(s) || from.includes(s) || body.includes(s) || cat.includes(s);
    });
  }, [items, searchText, filter]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return (
      items.find((x) => String(x?.id || x?._id || x?.email_id || x?.emailId) === String(selectedId)) || null
    );
  }, [items, selectedId]);

  function openEmail(id) {
    if (!id) return;
    const strId = String(id);
    setSelectedId(strId);
    navigate(`/history?emailId=${encodeURIComponent(strId)}`, { replace: true });
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 36 }}>Historique</h1>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, width: 520, maxWidth: "50vw" }}>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Rechercher..."
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 18 }}>
        {/* LISTE */}
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 10, opacity: 0.9 }}>
            {loading ? "Chargement…" : `${filtered.length} email(s)`}
          </div>

          <div style={{ display: "grid", gap: 10, maxHeight: "70vh", overflow: "auto", paddingRight: 6 }}>
            {filtered.map((e) => {
              const id = e?.id || e?._id || e?.email_id || e?.emailId;
              const subject = e?.subject || e?.title || "(Sans sujet)";
              const from = e?.from || e?.sender || e?.expediteur || "";
              const cat = e?.category || e?.type || "Autre";
              const dt = formatDateFR(e?.created_at || e?.date || e?.received_at);

              const active = String(id) === String(selectedId);

              return (
                <button
                  key={String(id)}
                  onClick={() => openEmail(id)}
                  className="card"
                  style={{
                    cursor: "pointer",
                    textAlign: "left",
                    padding: 12,
                    border: active ? "1px solid rgba(255,255,255,0.28)" : "1px solid rgba(255,255,255,0.10)",
                    background: active ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {subject}
                  </div>
                  <div style={{ opacity: 0.75, fontSize: 13, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {from}
                  </div>
                  <div style={{ opacity: 0.65, fontSize: 12, marginTop: 2 }}>
                    {cat} • {dt}
                  </div>
                </button>
              );
            })}

            {!loading && filtered.length === 0 ? (
              <div style={{ opacity: 0.75 }}>Aucun email ne correspond à vos critères.</div>
            ) : null}
          </div>
        </div>

        {/* DÉTAIL */}
        <div className="card" style={{ padding: 16, minHeight: 520 }}>
          {!selected ? (
            <div style={{ opacity: 0.75 }}>Sélectionne un email à gauche.</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 18, fontWeight: 900, flex: 1 }}>
                  {selected.subject || selected.title || "(Sans sujet)"}
                </div>
              </div>

              <div style={{ opacity: 0.75, marginTop: 8, fontSize: 13 }}>
                <div><b>De :</b> {selected.from || selected.sender || selected.expediteur || "-"}</div>
                <div><b>Catégorie :</b> {selected.category || selected.type || "Autre"}</div>
                <div><b>Date :</b> {formatDateFR(selected.created_at || selected.date || selected.received_at)}</div>
                <div><b>ID :</b> {String(selected.id || selected._id || selected.email_id || selected.emailId)}</div>
              </div>

              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Contenu</div>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, opacity: 0.92 }}>
                  {selected.body || selected.content || selected.text || selected.snippet || "—"}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
