import React, { useEffect, useMemo, useState } from "react";

export default function TenantFilesPanel({ authFetch, apiBase }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);

  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");

  const selectedItem = useMemo(() => {
    return items.find((x) => x.id === selectedId) || null;
  }, [items, selectedId]);

  async function fetchJson(url, options) {
    const res = await authFetch(url, options);
    if (!res.ok) {
      let msg = `Erreur ${res.status}`;
      try {
        const data = await res.json();
        msg = data?.detail || msg;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  }

  async function loadList() {
    setError("");
    setLoadingList(true);
    try {
      const data = await fetchJson(`${apiBase}/tenant-files`);
      setItems(Array.isArray(data) ? data : []);
      // si aucun dossier sélectionné, on sélectionne le 1er
      if (!selectedId && Array.isArray(data) && data.length > 0) {
        setSelectedId(data[0].id);
      }
    } catch (e) {
      setError(e.message || "Impossible de charger les dossiers.");
    } finally {
      setLoadingList(false);
    }
  }

  async function loadDetail(id) {
    if (!id) return;
    setError("");
    setLoadingDetail(true);
    try {
      const data = await fetchJson(`${apiBase}/tenant-files/${id}`);
      setSelected(data);
    } catch (e) {
      setError(e.message || "Impossible de charger le dossier.");
      setSelected(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 16 }}>
      {/* LISTE */}
      <div className="card" style={{ height: "fit-content" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Dossiers</h2>
          <button className="btn btn-primary" onClick={loadList} disabled={loadingList}>
            {loadingList ? "..." : "Rafraîchir"}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 12, color: "#f87171" }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {loadingList && <p>Chargement…</p>}

          {!loadingList && items.length === 0 && (
            <p style={{ opacity: 0.8 }}>Aucun dossier pour le moment.</p>
          )}

          {!loadingList &&
            items.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                style={{
                  cursor: "pointer",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background:
                    t.id === selectedId ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.04)",
                }}
                title="Ouvrir le dossier"
              >
                <div style={{ fontWeight: 800 }}>
                  {t.candidate_email || "Email inconnu"}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span style={{ opacity: 0.8, fontSize: 13 }}>Statut : {t.status}</span>
                  <span style={{ opacity: 0.6, fontSize: 12 }}>
                    {t.created_at ? new Date(t.created_at).toLocaleString() : ""}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* DETAIL */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>
            {selectedId ? `Dossier #${selectedId}` : "Dossier"}
          </h2>

          <button
            className="btn btn-success"
            disabled={!selectedId || loadingDetail}
            onClick={() => selectedId && loadDetail(selectedId)}
            title="Recharger le détail"
          >
            {loadingDetail ? "..." : "Recharger"}
          </button>
        </div>

        {!selectedId && (
          <p style={{ opacity: 0.8, marginTop: 12 }}>
            Sélectionne un dossier dans la liste.
          </p>
        )}

        {selectedId && loadingDetail && <p style={{ marginTop: 12 }}>Chargement…</p>}

        {selectedId && !loadingDetail && selected && (
          <div style={{ marginTop: 12 }}>
            <p><b>Email candidat :</b> {selected.candidate_email || "—"}</p>
            <p><b>Nom candidat :</b> {selected.candidate_name || "—"}</p>
            <p><b>Statut :</b> {selected.status}</p>

            <hr style={{ opacity: 0.2 }} />

            <p><b>Emails liés :</b> {selected.email_ids?.length ? selected.email_ids.join(", ") : "Aucun"}</p>
            <p><b>Fichiers liés :</b> {selected.file_ids?.length ? selected.file_ids.join(", ") : "Aucun"}</p>

            <hr style={{ opacity: 0.2 }} />

            <p><b>Checklist :</b></p>
            <pre style={{ whiteSpace: "pre-wrap", opacity: 0.9 }}>
              {selected.checklist_json ? JSON.stringify(selected.checklist_json, null, 2) : "—"}
            </pre>

            <p><b>Risque :</b> {selected.risk_level || "—"}</p>
          </div>
        )}

        {selectedId && !loadingDetail && !selected && (
          <p style={{ marginTop: 12, opacity: 0.8 }}>
            Aucun détail chargé.
          </p>
        )}

        {selectedItem && (
          <div style={{ marginTop: 12, opacity: 0.55, fontSize: 12 }}>
            (Info liste: id={selectedItem.id})
          </div>
        )}
      </div>
    </div>
  );
}
