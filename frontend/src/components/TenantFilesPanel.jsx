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

  // --- UI ---
  const [attachLoading, setAttachLoading] = useState(false);
  const [selectedFileIdToAttach, setSelectedFileIdToAttach] = useState("");

  // ---------------------------
  // Fetch helpers
  // ---------------------------
  const fetchTenants = async () => {
    if (!authFetch) return;
    setTenantsLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/tenant-files`);
      if (!res.ok) throw new Error("Impossible de charger les dossiers");
      const data = await res.json();
      setTenants(data || []);
      // auto-select the first one if none selected
      if (!selectedTenantId && data?.length) setSelectedTenantId(data[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setTenantsLoading(false);
    }
  };

  const fetchTenantDetail = async (tenantId) => {
    if (!authFetch || !tenantId) return;
    setTenantLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/tenant-files/${tenantId}`);
      if (!res.ok) throw new Error("Impossible de charger le détail du dossier");
      const data = await res.json();
      setTenantDetail(data);
    } catch (e) {
      console.error(e);
      setTenantDetail(null);
    } finally {
      setTenantLoading(false);
    }
  };

  const fetchFilesHistory = async () => {
    if (!authFetch) return;
    setFilesLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/files/history`);
      if (!res.ok) throw new Error("Impossible de charger l'historique des documents");
      const data = await res.json();
      setFilesHistory(data || []);
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
    const ids = tenantDetail?.file_ids || [];
    return Array.isArray(ids) ? ids : [];
  }, [tenantDetail]);

  const linkedFiles = useMemo(() => {
    if (!linkedFileIds.length) return [];
    const setIds = new Set(linkedFileIds);
    return (filesHistory || []).filter((f) => setIds.has(f.id));
  }, [filesHistory, linkedFileIds]);

  const unlinkedFiles = useMemo(() => {
    const setIds = new Set(linkedFileIds);
    return (filesHistory || []).filter((f) => !setIds.has(f.id));
  }, [filesHistory, linkedFileIds]);

  // ---------------------------
  // Actions
  // ---------------------------
  const handleView = async (fileId) => {
    if (!authFetch) return;
    try {
      const res = await authFetch(`${API_BASE}/api/files/view/${fileId}`);
      if (!res.ok) {
        alert("Impossible de visualiser le fichier.");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e) {
      console.error(e);
      alert("Erreur lors de l'ouverture.");
    }
  };

  const handleAttach = async () => {
    if (!authFetch) return;
    if (!selectedTenantId) return alert("Choisis un dossier.");
    if (!selectedFileIdToAttach) return alert("Choisis un document à attacher.");

    setAttachLoading(true);
    try {
      const res = await authFetch(
        `${API_BASE}/tenant-files/${selectedTenantId}/attach-document/${selectedFileIdToAttach}`,
        { method: "POST" }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error(txt);
        alert("Erreur lors de l'attachement.");
        return;
      }

      // refresh tenant + history (history may already be up to date but keeps UI consistent)
      await fetchTenantDetail(selectedTenantId);
      await fetchFilesHistory();
      setSelectedFileIdToAttach("");
    } catch (e) {
      console.error(e);
      alert("Erreur réseau.");
    } finally {
      setAttachLoading(false);
    }
  };

  // ---------------------------
  // UI styles (simple)
  // ---------------------------
  const cardStyle = {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: "1.25rem",
  };

  const buttonGhost = {
    background: "transparent",
    border: "1px solid #334155",
    color: "#cbd5e1",
    padding: "8px 10px",
    borderRadius: 8,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };

  const buttonPrimary = {
    background: "#6366f1",
    border: "none",
    color: "white",
    padding: "10px 12px",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: "bold",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    opacity: attachLoading ? 0.7 : 1,
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: "3rem" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1.6rem", fontWeight: "bold", color: "white", display: "flex", alignItems: "center", gap: 10 }}>
          <FolderOpen size={26} color="#6366f1" /> Dossiers Locataires
        </h2>
        <p style={{ color: "#94a3b8" }}>
          Crée/lie un dossier depuis un email, puis attache des documents (bulletin de paie, avis d’impôt, etc.) et affiche-les ici.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: "1.25rem" }}>
        {/* LEFT: list tenants */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ color: "white", fontWeight: "bold" }}>📁 Dossiers</div>
            <button style={buttonGhost} onClick={fetchTenants} title="Rafraîchir">
              <RefreshCw size={16} /> {tenantsLoading ? "..." : "Rafraîchir"}
            </button>
          </div>

          <div style={{ marginBottom: 12, color: "#94a3b8", fontSize: 13 }}>
            Clique un dossier pour voir ses pièces attachées.
          </div>

          {tenantsLoading ? (
            <div style={{ color: "#94a3b8" }}>Chargement...</div>
          ) : tenants.length === 0 ? (
            <div style={{ color: "#94a3b8" }}>Aucun dossier pour l’instant.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {tenants.map((t) => {
                const active = t.id === selectedTenantId;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTenantId(t.id)}
                    style={{
                      textAlign: "left",
                      width: "100%",
                      background: active ? "rgba(99,102,241,0.15)" : "#0f172a",
                      border: active ? "1px solid rgba(99,102,241,0.6)" : "1px solid #334155",
                      color: "white",
                      padding: "10px 12px",
                      borderRadius: 10,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: "bold" }}>Dossier #{t.id} — {t.status || "?"}</div>
                    <div style={{ color: "#94a3b8", fontSize: 12 }}>{t.candidate_email || "-"}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: tenant detail + linked files */}
        <div style={{ display: "grid", gap: "1.25rem" }}>
          {/* Tenant detail */}
          <div style={cardStyle}>
            <div style={{ color: "white", fontWeight: "bold", marginBottom: 12 }}>🧾 Détail du dossier</div>

            {tenantLoading ? (
              <div style={{ color: "#94a3b8" }}>Chargement...</div>
            ) : !tenantDetail ? (
              <div style={{ color: "#94a3b8" }}>Sélectionne un dossier.</div>
            ) : (
              <div style={{ display: "grid", gap: 8, color: "#cbd5e1" }}>
                <div><b>ID :</b> #{tenantDetail.id}</div>
                <div><b>Statut :</b> {tenantDetail.status}</div>
                <div><b>Email candidat :</b> {tenantDetail.candidate_email || "-"}</div>
                <div><b>Nom candidat :</b> {tenantDetail.candidate_name || "-"}</div>
                <div><b>Emails liés :</b> {Array.isArray(tenantDetail.email_ids) ? tenantDetail.email_ids.length : 0}</div>
                <div><b>Fichiers liés :</b> {Array.isArray(tenantDetail.file_ids) ? tenantDetail.file_ids.length : 0}</div>
              </div>
            )}
          </div>

          {/* Attach file */}
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ color: "white", fontWeight: "bold" }}>🔗 Attacher un document au dossier</div>
              <button style={buttonGhost} onClick={fetchFilesHistory} title="Rafraîchir l’historique docs">
                <RefreshCw size={16} /> {filesLoading ? "..." : "Docs"}
              </button>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ color: "#94a3b8", fontSize: 13 }}>
                Tu choisis un document déjà analysé (donc présent dans <code>/api/files/history</code>), puis tu l’attaches au dossier courant.
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={selectedFileIdToAttach}
                  onChange={(e) => setSelectedFileIdToAttach(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 260,
                    background: "#0f172a",
                    border: "1px solid #334155",
                    color: "white",
                    padding: "10px 12px",
                    borderRadius: 8,
                  }}
                >
                  <option value="">— Choisir un document (non attaché) —</option>
                  {unlinkedFiles.map((f) => (
                    <option key={f.id} value={String(f.id)}>
                      #{f.id} — {f.file_type || "Doc"} — {f.filename}
                    </option>
                  ))}
                </select>

                <button style={buttonPrimary} onClick={handleAttach} disabled={attachLoading || !selectedFileIdToAttach}>
                  <Link2 size={16} /> {attachLoading ? "Attache..." : "Attacher"}
                </button>
              </div>
            </div>
          </div>

          {/* Linked files list */}
          <div style={cardStyle}>
            <div style={{ color: "white", fontWeight: "bold", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <FileText size={18} color="#94a3b8" /> Pièces du dossier (documents attachés)
            </div>

            {tenantDetail && linkedFileIds.length === 0 ? (
              <div style={{ color: "#94a3b8" }}>Aucune pièce attachée pour l’instant.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {linkedFiles.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 10,
                      padding: "10px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "white", fontWeight: "bold" }}>
                        #{f.id} — {f.file_type || "Document"}
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: 12, wordBreak: "break-word" }}>
                        {f.filename}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={buttonGhost} onClick={() => handleView(f.id)} title="Voir">
                        <Eye size={16} /> Voir
                      </button>

                      <a
                        href={`${API_BASE}/api/files/download/${f.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...buttonGhost, textDecoration: "none" }}
                        title="Télécharger"
                      >
                        <Download size={16} /> Download
                      </a>
                    </div>
                  </div>
                ))}

                {/* If file_ids exists but history not loaded yet or mismatch */}
                {tenantDetail && linkedFileIds.length > 0 && linkedFiles.length === 0 && (
                  <div style={{ color: "#fbbf24", fontSize: 13 }}>
                    ⚠️ Le dossier a des <code>file_ids</code> mais je ne retrouve pas leurs détails dans <code>/api/files/history</code>.
                    Clique “Docs” pour rafraîchir.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
