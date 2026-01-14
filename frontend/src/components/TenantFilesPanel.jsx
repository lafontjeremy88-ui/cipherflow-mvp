import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Eye, Download, Link2, FolderOpen, FileText } from "lucide-react";

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

export default function TenantFilesPanel({ authFetch }) {
  // --- TENANTS ---
  const [tenants, setTenants] = useState([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);

  const [selectedTenantId, setSelectedTenantId] = useState(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantDetail, setTenantDetail] = useState(null);

  // --- FILES ---
  const [filesHistory, setFilesHistory] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // attach file to tenant
  const [selectedFileIdToAttach, setSelectedFileIdToAttach] = useState("");
  const [attachLoading, setAttachLoading] = useState(false);

  // ---------------------------
  // API calls
  // ---------------------------
  const fetchTenants = async () => {
    setTenantsLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/tenants`);
      if (!res.ok) throw new Error("Impossible de charger les dossiers locataires");
      const data = await res.json();
      setTenants(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      alert("Erreur : chargement des dossiers impossible.");
    } finally {
      setTenantsLoading(false);
    }
  };

  const fetchTenantDetail = async (tenantId) => {
    setTenantLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/tenants/${tenantId}`);
      if (!res.ok) throw new Error("Impossible de charger le détail du dossier");
      const data = await res.json();
      setTenantDetail(data || null);
    } catch (e) {
      console.error(e);
      alert("Erreur : chargement du dossier impossible.");
    } finally {
      setTenantLoading(false);
    }
  };

  const fetchFilesHistory = async () => {
    setFilesLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/files/history`);
      if (!res.ok) throw new Error("Impossible de charger l'historique des documents");
      const data = await res.json();
      setFilesHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setFilesLoading(false);
    }
  };

  // ---------------------------
  // First load
  // ---------------------------
  useEffect(() => {
    fetchTenants();
    fetchFilesHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authFetch]);

  // when selecting a tenant
  useEffect(() => {
    if (selectedTenantId) fetchTenantDetail(selectedTenantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenantId]);

  // ---------------------------
  // Derived data
  // ---------------------------
  const linkedFileIds = useMemo(() => {
    const ids = tenantDetail?.file_ids;
    if (!ids) return [];
    if (Array.isArray(ids)) return ids.map(String);
    if (typeof ids === "string") {
      try {
        const parsed = JSON.parse(ids);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        return ids
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      }
    }
    return [];
  }, [tenantDetail]);

  const linkedFiles = useMemo(() => {
    if (!linkedFileIds.length) return [];
    const set = new Set(linkedFileIds);
    return filesHistory.filter((f) => set.has(String(f.id)));
  }, [filesHistory, linkedFileIds]);

  const unlinkedFiles = useMemo(() => {
    const set = new Set(linkedFileIds);
    return filesHistory.filter((f) => !set.has(String(f.id)));
  }, [filesHistory, linkedFileIds]);

  // ---------------------------
  // Handlers
  // ---------------------------
  const handleAttach = async () => {
    if (!selectedTenantId || !selectedFileIdToAttach) return;
    setAttachLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/tenants/${selectedTenantId}/attach-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: Number(selectedFileIdToAttach) }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || "Erreur attach-file");
      }

      await fetchTenantDetail(selectedTenantId);
      setSelectedFileIdToAttach("");
    } catch (e) {
      console.error(e);
      alert("Erreur : impossible d'attacher le document.");
    } finally {
      setAttachLoading(false);
    }
  };

  return (
    <div className="tf-page">
      <div className="tf-head">
        <div>
          <h2 className="tf-title">Dossiers locataires</h2>
          <div className="tf-sub">Associer des documents à un dossier et consulter les pièces jointes</div>
        </div>

        <div className="tf-actions">
          <button className="tf-btn tf-btn-ghost" onClick={fetchTenants} disabled={tenantsLoading}>
            <RefreshCw size={16} /> {tenantsLoading ? "Chargement..." : "Dossiers"}
          </button>
          <button className="tf-btn tf-btn-ghost" onClick={fetchFilesHistory} disabled={filesLoading}>
            <FolderOpen size={16} /> {filesLoading ? "Chargement..." : "Docs"}
          </button>
        </div>
      </div>

      <div className="tf-grid">
        {/* LEFT: tenants list */}
        <div className="tf-card">
          <div className="tf-card-title">📁 Dossiers</div>

          {tenantsLoading ? (
            <div className="tf-muted">Chargement...</div>
          ) : tenants.length === 0 ? (
            <div className="tf-muted">Aucun dossier.</div>
          ) : (
            <div className="tf-list">
              {tenants.map((t) => {
                const active = String(selectedTenantId) === String(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTenantId(t.id)}
                    className={`tf-item ${active ? "is-active" : ""}`}
                  >
                    <div className="tf-item-title">
                      Dossier #{t.id} — {t.status || "?"}
                    </div>
                    <div className="tf-item-sub">{t.candidate_email || "-"}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: tenant detail + linked files */}
        <div className="tf-right">
          {/* Tenant detail */}
          <div className="tf-card">
            <div className="tf-card-title">🧾 Détail du dossier</div>

            {tenantLoading ? (
              <div className="tf-muted">Chargement...</div>
            ) : !tenantDetail ? (
              <div className="tf-muted">Sélectionne un dossier à gauche.</div>
            ) : (
              <>
                <div className="tf-kv">
                  <div>
                    <div className="tf-k">Email candidat</div>
                    <div className="tf-v">{tenantDetail.candidate_email || "-"}</div>
                  </div>
                  <div>
                    <div className="tf-k">Statut</div>
                    <div className="tf-v">{tenantDetail.status || "-"}</div>
                  </div>
                  <div>
                    <div className="tf-k">Documents liés</div>
                    <div className="tf-v">{linkedFileIds.length}</div>
                  </div>
                </div>

                <div className="tf-attach">
                  <div className="tf-k">Attacher un document existant</div>
                  <div className="tf-attach-row">
                    <select
                      className="tf-select"
                      value={selectedFileIdToAttach}
                      onChange={(e) => setSelectedFileIdToAttach(e.target.value)}
                    >
                      <option value="">— Choisir un document (non attaché) —</option>
                      {unlinkedFiles.map((f) => (
                        <option key={f.id} value={String(f.id)}>
                          #{f.id} — {f.file_type || "Doc"} — {f.filename}
                        </option>
                      ))}
                    </select>

                    <button
                      className="tf-btn tf-btn-primary"
                      onClick={handleAttach}
                      disabled={attachLoading || !selectedFileIdToAttach}
                    >
                      <Link2 size={16} /> {attachLoading ? "Attache..." : "Attacher"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Linked files list */}
          <div className="tf-card">
            <div className="tf-card-title tf-row">
              <span className="tf-row-left">
                <FileText size={18} /> Pièces du dossier (documents attachés)
              </span>
              <span className="tf-chip">{linkedFiles.length}</span>
            </div>

            {!tenantDetail ? (
              <div className="tf-muted">Sélectionne un dossier pour voir ses pièces.</div>
            ) : linkedFileIds.length === 0 ? (
              <div className="tf-muted">Aucun document attaché.</div>
            ) : linkedFiles.length === 0 ? (
              <div className="tf-warn">
                ⚠️ Le dossier a des <code>file_ids</code> mais je ne retrouve pas leurs détails dans{" "}
                <code>/api/files/history</code>. Clique “Docs” pour rafraîchir.
              </div>
            ) : (
              <div className="tf-files">
                {linkedFiles.map((f) => (
                  <div className="tf-file" key={f.id}>
                    <div className="tf-file-main">
                      <div className="tf-file-title">
                        #{f.id} — {f.file_type || "Doc"} — {f.filename}
                      </div>
                      <div className="tf-file-sub">
                        {f.created_at ? new Date(f.created_at).toLocaleString() : ""}{" "}
                        {f.tenant_id ? `• Tenant: ${f.tenant_id}` : ""}
                      </div>
                    </div>

                    <div className="tf-file-actions">
                      <a className="tf-btn tf-btn-ghost" href={`/docs/${f.id}`} title="Voir">
                        <Eye size={16} /> Voir
                      </a>

                      {!!f.download_url && (
                        <a className="tf-btn tf-btn-ghost" href={f.download_url} target="_blank" rel="noreferrer">
                          <Download size={16} /> Download
                        </a>
                      )}
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
