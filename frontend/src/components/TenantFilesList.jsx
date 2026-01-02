import React, { useEffect, useState } from "react";

/**
 * Liste des dossiers locataires (tenant-files)
 *
 * Props:
 * - authFetch: (url, options) => fetch avec Authorization déjà géré
 * - apiBase: string ex: https://cipherflow-mvp-production.up.railway.app
 * - selectedId: number|null
 * - onSelect: (id:number) => void
 * - onLoaded: (items:Array) => void (optionnel)
 */
export default function TenantFilesList({
  authFetch,
  apiBase,
  selectedId,
  onSelect,
  onLoaded,
}) {
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState("");

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
      const list = Array.isArray(data) ? data : [];
      setItems(list);

      if (typeof onLoaded === "function") onLoaded(list);

      // auto-select le premier si rien n'est sélectionné
      if ((!selectedId || selectedId === null) && list.length > 0) {
        onSelect?.(list[0].id);
      }
    } catch (e) {
      setError(e?.message || "Impossible de charger les dossiers.");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card" style={{ height: "fit-content" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Dossiers</h2>
        <button className="btn btn-primary" onClick={loadList} disabled={loadingList}>
          {loadingList ? "..." : "Rafraîchir"}
        </button>
      </div>

      {error && <div style={{ marginTop: 12, color: "#f87171" }}>{error}</div>}

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        {loadingList && <p>Chargement…</p>}

        {!loadingList && items.length === 0 && (
          <p style={{ opacity: 0.8 }}>Aucun dossier pour le moment.</p>
        )}

        {!loadingList &&
          items.map((t) => (
            <div
              key={t.id}
              onClick={() => onSelect?.(t.id)}
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
              <div style={{ fontWeight: 800 }}>{t.candidate_email || "Email inconnu"}</div>

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
  );
}
