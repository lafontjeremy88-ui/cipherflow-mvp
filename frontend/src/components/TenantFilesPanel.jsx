import React, { useEffect, useMemo, useState } from "react";

export default function TenantFilesPanel({ authFetch }) {
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState(null);

  const [files, setFiles] = useState([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // ✅ anti-écran blanc si la prop est mal passée
  const authFetchOk = typeof authFetch === "function";

  const selectedTenant = useMemo(
    () => tenants.find((t) => t.id === selectedTenantId) || null,
    [tenants, selectedTenantId]
  );

  async function loadTenants() {
    if (!authFetchOk) return;

    setError("");
    setInfo("");
    setLoadingTenants(true);
    try {
      // ⚠️ adapte si ton backend utilise un autre endpoint
      const res = await authFetch("/tenants");
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Erreur chargement locataires");
      }
      const data = await res.json();
      setTenants(Array.isArray(data) ? data : data?.items || []);
      // auto-select premier locataire si rien
      const first = (Array.isArray(data) ? data : data?.items || [])[0];
      if (first?.id && !selectedTenantId) setSelectedTenantId(first.id);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoadingTenants(false);
    }
  }

  async function loadFiles(tenantId) {
    if (!authFetchOk || !tenantId) return;

    setError("");
    setInfo("");
    setLoadingFiles(true);
    try {
      // ⚠️ adapte si ton backend utilise un autre endpoint
      const res = await authFetch(`/tenants/${tenantId}/files`);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Erreur chargement fichiers");
      }
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : data?.items || []);
    } catch (e) {
      setError(String(e?.message || e));
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }

  useEffect(() => {
    loadTenants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authFetchOk]);

  useEffect(() => {
    if (selectedTenantId) loadFiles(selectedTenantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenantId]);

  if (!authFetchOk) {
    return (
      <div className="tf-page">
        <div className="tf-warn">
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Erreur de configuration</div>
          <div>
            <code>authFetch</code> n’a pas été passé à <code>&lt;TenantFilesPanel /&gt;</code>.
            <br />
            Résultat : React partait en écran blanc.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tf-page">
      <div className="tf-head">
        <div>
          <h2 className="tf-title">Dossiers locataires</h2>
          <div className="tf-sub">Centralise les fichiers et rattache les documents aux locataires.</div>
        </div>

        <div className="tf-actions">
          <button className="tf-btn tf-btn-ghost" onClick={loadTenants} disabled={loadingTenants}>
            {loadingTenants ? "Chargement..." : "Rafraîchir locataires"}
          </button>

          <button
            className="tf-btn tf-btn-primary"
            onClick={() => selectedTenantId && loadFiles(selectedTenantId)}
            disabled={loadingFiles || !selectedTenantId}
          >
            {loadingFiles ? "Chargement..." : "Rafraîchir fichiers"}
          </button>
        </div>
      </div>

      {(error || info) && (
        <div className="tf-warn" style={{ marginBottom: 14, borderColor: error ? "rgba(239,68,68,.45)" : undefined }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>{error ? "Erreur" : "Info"}</div>
          <div style={{ opacity: 0.95 }}>{error || info}</div>
        </div>
      )}

      <div className="tf-grid">
        {/* Colonne gauche : locataires */}
        <div className="tf-card">
          <div className="tf-card-title">Locataires</div>

          {loadingTenants && tenants.length === 0 ? (
            <div className="tf-muted">Chargement...</div>
          ) : tenants.length === 0 ? (
            <div className="tf-muted">Aucun locataire.</div>
          ) : (
            <div className="tf-list">
              {tenants.map((t) => (
                <button
                  key={t.id}
                  className={`tf-item ${t.id === selectedTenantId ? "is-active" : ""}`}
                  onClick={() => setSelectedTenantId(t.id)}
                  type="button"
                >
                  <div className="tf-item-title">{t.full_name || t.name || `Locataire #${t.id}`}</div>
                  <div className="tf-item-sub">
                    {t.email ? t.email : "—"} {t.phone ? ` • ${t.phone}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Colonne droite : détails + fichiers */}
        <div className="tf-right">
          <div className="tf-card">
            <div className="tf-row">
              <div className="tf-row-left">
                <div className="tf-card-title" style={{ marginBottom: 0 }}>
                  Détails
                </div>
                {selectedTenantId && <span className="tf-chip">ID {selectedTenantId}</span>}
              </div>
            </div>

            {!selectedTenant ? (
              <div className="tf-muted" style={{ marginTop: 10 }}>
                Sélectionne un locataire à gauche.
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <div className="tf-kv">
                  <div>
                    <div className="tf-k">Nom</div>
                    <div className="tf-v">{selectedTenant.full_name || selectedTenant.name || "—"}</div>
                  </div>
                  <div>
                    <div className="tf-k">Email</div>
                    <div className="tf-v">{selectedTenant.email || "—"}</div>
                  </div>
                  <div>
                    <div className="tf-k">Téléphone</div>
                    <div className="tf-v">{selectedTenant.phone || "—"}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="tf-card">
            <div className="tf-card-title">Fichiers</div>

            {!selectedTenantId ? (
              <div className="tf-muted">Choisis un locataire pour voir ses fichiers.</div>
            ) : loadingFiles && files.length === 0 ? (
              <div className="tf-muted">Chargement...</div>
            ) : files.length === 0 ? (
              <div className="tf-muted">Aucun fichier pour ce locataire.</div>
            ) : (
              <div className="tf-files">
                {files.map((f) => (
                  <div className="tf-file" key={f.id || `${f.filename}-${f.created_at}`}>
                    <div>
                      <div className="tf-file-title">{f.filename || f.name || "Document"}</div>
                      <div className="tf-file-sub">
                        {f.category ? `${f.category}` : "—"}
                        {f.created_at ? ` • ${String(f.created_at).slice(0, 19).replace("T", " ")}` : ""}
                      </div>
                    </div>

                    <div className="tf-file-actions">
                      {f.url && (
                        <a className="tf-btn tf-btn-ghost" href={f.url} target="_blank" rel="noreferrer">
                          Ouvrir
                        </a>
                      )}
                      <button
                        className="tf-btn"
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(f.url || "").catch(() => {})}
                        disabled={!f.url}
                      >
                        Copier lien
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
