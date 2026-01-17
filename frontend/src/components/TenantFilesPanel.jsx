import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Users,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  FileText,
  Link2,
  Eye,
  Download,
  Trash2,
} from "lucide-react";
import { authFetch, useAuthFetchStatus } from "../services/api";

function TenantFilesPanel() {
  const [tenants, setTenants] = useState([]);
  const [linkedFiles, setLinkedFiles] = useState([]);
  const [unlinkedFiles, setUnlinkedFiles] = useState([]);
  const [tenantFiles, setTenantFiles] = useState([]);

  const [selectedTenantId, setSelectedTenantId] = useState(null);
  const [selectedFileIdToAttach, setSelectedFileIdToAttach] = useState("");

  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [attachLoading, setAttachLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [error, setError] = useState("");

  // Nouveaux états pour la confirmation de suppression
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const { ok: authFetchOk } = useAuthFetchStatus();

  const selectedTenant = useMemo(
    () => tenants.find((t) => t.id === selectedTenantId) || null,
    [tenants, selectedTenantId]
  );

  const linkedFileIds = useMemo(
    () => new Set(tenantFiles.map((f) => String(f.file_id))),
    [tenantFiles]
  );

  const allFiles = useMemo(
    () => [...linkedFiles, ...unlinkedFiles],
    [linkedFiles, unlinkedFiles]
  );

  const availableFilesForSelect = useMemo(
    () => allFiles.filter((f) => !linkedFileIds.has(String(f.id))),
    [allFiles, linkedFileIds]
  );

  const loadTenants = useCallback(async () => {
    if (!authFetchOk) return;
    setTenantsLoading(true);
    setError("");

    try {
      const res = await authFetch("/tenants/files-overview");
      if (!res.ok) {
        throw new Error("Impossible de charger les dossiers locataires.");
      }
      const data = await res.json();
      setTenants(data.tenants || []);

      // si aucun tenant sélectionné, on prend le premier
      if (!selectedTenantId && data.tenants && data.tenants.length > 0) {
        setSelectedTenantId(data.tenants[0].id);
      }
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors du chargement des locataires.");
    } finally {
      setTenantsLoading(false);
    }
  }, [authFetchOk, selectedTenantId]);

  const loadFiles = useCallback(async () => {
    if (!authFetchOk) return;
    setFilesLoading(true);
    setError("");

    try {
      const res = await authFetch("/files/history");
      if (!res.ok) {
        throw new Error("Impossible de charger l’historique des fichiers.");
      }
      const data = await res.json();

      setLinkedFiles(data.linked_files || []);
      setUnlinkedFiles(data.unlinked_files || []);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors du chargement des fichiers.");
    } finally {
      setFilesLoading(false);
    }
  }, [authFetchOk]);

  const reloadTenantFiles = useCallback(
    async (tenantId) => {
      if (!authFetchOk || !tenantId) return;
      setRefreshLoading(true);
      setError("");

      try {
        const res = await authFetch(`/tenants/${tenantId}/files`);
        if (!res.ok) {
          throw new Error("Impossible de charger les fichiers du dossier.");
        }
        const data = await res.json();
        setTenantFiles(data.files || []);
      } catch (e) {
        console.error(e);
        setError(
          e?.message || "Erreur lors du chargement des fichiers du dossier."
        );
      } finally {
        setRefreshLoading(false);
      }
    },
    [authFetchOk]
  );

  const handleTenantClick = async (tenantId) => {
    setSelectedTenantId(tenantId);
    setSelectedFileIdToAttach("");
    await reloadTenantFiles(tenantId);
  };

  const handleAttachFile = async () => {
    if (!selectedTenantId || !selectedFileIdToAttach || !authFetchOk) return;

    setAttachLoading(true);
    setError("");

    try {
      const res = await authFetch("/tenant-files/attach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant_id: selectedTenantId,
          file_id: selectedFileIdToAttach,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(
          txt || "Impossible d’attacher le document au dossier."
        );
      }

      await reloadTenantFiles(selectedTenantId);
      await loadFiles();
      setSelectedFileIdToAttach("");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors de l’attachement du fichier.");
    } finally {
      setAttachLoading(false);
    }
  };

  // 🔥 Nouvelle fonction : suppression du fichier
  const handleDeleteFile = async (fileId) => {
    if (!fileId || !authFetchOk) return;

    setActionLoading(true);
    setError("");

    try {
      const res = await authFetch(`/files/${fileId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(
          txt || "Impossible de supprimer définitivement ce document."
        );
      }

      // On recharge la liste globale + les fichiers du dossier
      await loadFiles();
      if (selectedTenantId) {
        await reloadTenantFiles(selectedTenantId);
      }
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors de la suppression du document.");
    } finally {
      setActionLoading(false);
    }
  };

  // Appelée par le bouton "Supprimer" dans la modal
  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    setConfirmOpen(false);
    await handleDeleteFile(pendingDeleteId);
    setPendingDeleteId(null);
  };

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (selectedTenantId) {
      reloadTenantFiles(selectedTenantId);
    }
  }, [selectedTenantId, reloadTenantFiles]);

  const loading = tenantsLoading || filesLoading;

  return (
    <div className="tf-page-root">
      <div className="tf-page-header">
        <div>
          <h1 className="tf-page-title">Dossiers locataires</h1>
          <p className="tf-page-subtitle">
            Centralisez les fichiers et rattachez les documents aux locataires.
          </p>
        </div>

        <div className="tf-page-header-actions">
          <button
            className="tf-btn tf-btn-ghost"
            type="button"
            onClick={() => {
              loadTenants();
              loadFiles();
              if (selectedTenantId) {
                reloadTenantFiles(selectedTenantId);
              }
            }}
            disabled={loading || refreshLoading}
          >
            <RefreshCw size={16} className={refreshLoading ? "tf-spin" : ""} />
            Rafraîchir locataires
          </button>
        </div>
      </div>

      {error && (
        <div className="tf-alert tf-alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="tf-layout-grid">
        {/* Colonne gauche : liste des locataires */}
        <div className="tf-card tf-card-left">
          <div className="tf-card-header">
            <div className="tf-card-title">
              <Users size={18} />
              <span>Locataires</span>
            </div>
          </div>

          <div className="tf-tenants-list">
            {loading && <div className="tf-empty">Chargement...</div>}

            {!loading && tenants.length === 0 && (
              <div className="tf-empty">
                <p>Aucun dossier locataire pour le moment.</p>
              </div>
            )}

            {!loading &&
              tenants.map((tenant) => {
                const isSelected = tenant.id === selectedTenantId;
                return (
                  <button
                    key={tenant.id}
                    type="button"
                    className={`tf-tenant-item ${
                      isSelected ? "tf-tenant-item-selected" : ""
                    }`}
                    onClick={() => handleTenantClick(tenant.id)}
                  >
                    <div className="tf-tenant-main">
                      <div className="tf-tenant-badge">
                        {tenant.folder_name || `Dossier #${tenant.id}`}
                      </div>
                      <div className="tf-tenant-email">
                        {tenant.candidate_email}
                      </div>
                    </div>

                    <div className="tf-tenant-status">
                      {tenant.status === "complete" ? (
                        <span className="tf-tag tf-tag-success">
                          <CheckCircle size={14} />
                          COMPLET
                        </span>
                      ) : (
                        <span className="tf-tag tf-tag-warning">
                          <AlertCircle size={14} />
                          INCOMPLET
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Colonne droite : détails dossier + pièces */}
        <div className="tf-card tf-card-right">
          {!selectedTenant && (
            <div className="tf-empty tf-empty-large">
              <p>Sélectionnez un dossier pour voir les pièces associées.</p>
            </div>
          )}

          {selectedTenant && (
            <>
              <div className="tf-card-section">
                <div className="tf-section-header">
                  <div>
                    <div className="tf-section-label">Détails</div>
                    <div className="tf-section-title">
                      {selectedTenant.folder_name || `Dossier #${selectedTenant.id}`}
                    </div>
                  </div>
                  <div className="tf-section-status">
                    {selectedTenant.status === "complete" ? (
                      <span className="tf-tag tf-tag-success">
                        <CheckCircle size={14} />
                        COMPLET
                      </span>
                    ) : (
                      <span className="tf-tag tf-tag-warning">
                        <AlertCircle size={14} />
                        INCOMPLET
                      </span>
                    )}
                  </div>
                </div>

                <div className="tf-detail-grid">
                  <div className="tf-detail-item">
                    <div className="tf-detail-label">Email candidat</div>
                    <div className="tf-detail-value">
                      {selectedTenant.candidate_email}
                    </div>
                  </div>
                  <div className="tf-detail-item">
                    <div className="tf-detail-label">Documents liés</div>
                    <div className="tf-detail-value">
                      {tenantFiles.length} document(s)
                    </div>
                  </div>
                </div>
              </div>

              <div className="tf-card-section">
                <div className="tf-section-header">
                  <div>
                    <div className="tf-section-label">
                      Attacher un document existant
                    </div>
                    <div className="tf-section-subtitle">
                      Sélectionnez un document que vous avez déjà importé.
                    </div>
                  </div>
                </div>

                <div className="tf-attach-row">
                  <select
                    className="tf-select"
                    value={selectedFileIdToAttach}
                    onChange={(e) => setSelectedFileIdToAttach(e.target.value)}
                    disabled={attachLoading || availableFilesForSelect.length === 0}
                  >
                    <option value="">
                      — Choisir un document (non attaché) —
                    </option>
                    {availableFilesForSelect.map((f) => (
                      <option key={f.id} value={f.id}>
                        #{f.id} — {f.display_name || f.original_name || "Document"}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="tf-btn tf-btn-primary"
                    onClick={handleAttachFile}
                    disabled={
                      attachLoading ||
                      !selectedFileIdToAttach ||
                      availableFilesForSelect.length === 0
                    }
                  >
                    <Link2 size={16} />
                    Attacher
                  </button>
                </div>
              </div>

              <div className="tf-card-section">
                <div className="tf-section-header">
                  <div>
                    <div className="tf-section-label">Pièces du dossier</div>
                    <div className="tf-section-subtitle">
                      Documents liés à ce dossier locataire.
                    </div>
                  </div>
                </div>

                {tenantFiles.length === 0 && (
                  <div className="tf-empty">
                    <p>Aucun document attaché à ce dossier pour le moment.</p>
                  </div>
                )}

                {tenantFiles.length > 0 && (
                  <div className="tf-files-list">
                    {tenantFiles.map((f) => {
                      const fileMeta =
                        allFiles.find((af) => String(af.id) === String(f.file_id)) ||
                        null;

                      const fileLabel =
                        fileMeta?.display_name ||
                        fileMeta?.original_name ||
                        `Document #${f.file_id}`;

                      const previewUrl = fileMeta?.preview_url || fileMeta?.view_url;
                      const downloadUrl = fileMeta?.download_url;

                      return (
                        <div key={f.id} className="tf-file-row">
                          <div className="tf-file-main">
                            <div className="tf-file-icon">
                              <FileText size={16} />
                            </div>
                            <div>
                              <div className="tf-file-name">{fileLabel}</div>
                              <div className="tf-file-meta">
                                <span>#{f.file_id}</span>
                                {fileMeta?.original_name && (
                                  <>
                                    <span className="tf-dot" />
                                    <span>{fileMeta.original_name}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="tf-file-actions">
                            {previewUrl && (
                              <button
                                type="button"
                                className="tf-btn tf-btn-ghost"
                                onClick={() =>
                                  window.open(previewUrl, "_blank", "noopener,noreferrer")
                                }
                              >
                                <Eye size={14} />
                                Voir
                              </button>
                            )}

                            {downloadUrl && (
                              <a
                                href={downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="tf-btn tf-btn-ghost"
                              >
                                <Download size={14} />
                                Télécharger
                              </a>
                            )}

                            <button
                              type="button"
                              className="tf-btn tf-btn-danger"
                              disabled={actionLoading && pendingDeleteId === f.file_id}
                              onClick={() => {
                                setPendingDeleteId(f.file_id);
                                setConfirmOpen(true);
                              }}
                            >
                              <Trash2 size={14} />
                              Supprimer
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal de confirmation de suppression */}
      {confirmOpen && (
        <div className="tf-modal-overlay" role="dialog" aria-modal="true">
          <div className="tf-modal">
            <div className="tf-modal-title">Supprimer définitivement ?</div>
            <div className="tf-modal-text">
              Ce document sera retiré de l&apos;historique et des dossiers.
            </div>

            <div className="tf-modal-actions">
              <button
                type="button"
                className="tf-btn tf-btn-ghost"
                onClick={() => {
                  setConfirmOpen(false);
                  setPendingDeleteId(null);
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                className="tf-btn tf-btn-danger"
                disabled={actionLoading}
                onClick={confirmDelete}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TenantFilesPanel;
