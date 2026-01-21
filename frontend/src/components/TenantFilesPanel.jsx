import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshCw,
  Eye,
  Download,
  Link2,
  FolderOpen,
  FileText,
  Trash2,
} from "lucide-react";

// Mapping des codes internes -> libellés lisibles
const DOC_LABELS = {
  payslip: "Fiche de paie",
  id: "Pièce d'identité",
  tax: "Avis d'impôt",
};

function getDocLabel(code) {
  return DOC_LABELS[code] || code;
}

function getFileId(f) {
  // Supporte les deux formats backend: {id: 59, ...} OU {file_id: 59, ...}
  return f?.id ?? f?.file_id ?? null;
}

function normalizeFile(f) {
  if (!f) return null;
  const fid = getFileId(f);
  if (fid === null || fid === undefined) return null;
  return {
    ...f,
    id: Number(fid),
    // Harmonise le type de document pour l'UI
    file_type: f.file_type ?? f.doc_type ?? "Document",
    filename: f.filename ?? f.file_name ?? `document_${fid}`,
  };
}

function uniqById(arr) {
  const map = new Map();
  (Array.isArray(arr) ? arr : []).forEach((x) => {
    const nx = normalizeFile(x);
    if (!nx) return;
    map.set(String(nx.id), nx);
  });
  return Array.from(map.values());
}

function normalizeIds(ids) {
  if (!ids) return [];
  if (Array.isArray(ids)) return ids.map((x) => String(x));

  if (typeof ids === "string") {
    try {
      const parsed = JSON.parse(ids);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch (e) {
      // pas grave, on tente un split simple
      return ids
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export default function TenantFilesPanel({ authFetch }) {
  const [tenants, setTenants] = useState([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);

  const [selectedTenantId, setSelectedTenantId] = useState(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantDetail, setTenantDetail] = useState(null);

  const [filesHistory, setFilesHistory] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // ✅ Source de vérité UI pour "Pièces du dossier"
  const [tenantDocuments, setTenantDocuments] = useState([]);

  const [selectedFileIdToAttach, setSelectedFileIdToAttach] = useState("");
  const [attachLoading, setAttachLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [deleteTenantLoading, setDeleteTenantLoading] = useState(false);

  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState({
    open: false,
    mode: null, // "unlink" | "delete"
    fileId: null,
  });

  const [confirmTenantDelete, setConfirmTenantDelete] = useState({
    open: false,
    tenantId: null,
  });

  const [newTenantEmail, setNewTenantEmail] = useState("");
  const [creatingTenant, setCreatingTenant] = useState(false);

  const authFetchOk = typeof authFetch === "function";

  // 🔒 Dernière version de filesHistory (évite stale closures)
  const filesHistoryRef = useRef([]);
  useEffect(() => {
    filesHistoryRef.current = Array.isArray(filesHistory) ? filesHistory : [];
  }, [filesHistory]);

  const fetchTenants = async () => {
    if (!authFetchOk) return;
    setError("");
    setTenantsLoading(true);
    try {
      const res = await authFetch("/tenant-files");
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Impossible de charger les dossiers");
      }
      const data = await res.json().catch(() => []);
      const list = Array.isArray(data) ? data : [];
      setTenants(list);

      if (!selectedTenantId && list.length) setSelectedTenantId(list[0].id);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur chargement dossiers");
    } finally {
      setTenantsLoading(false);
    }
  };

  const handleCreateTenant = async () => {
    if (!authFetchOk) return;
    setError("");
    setCreatingTenant(true);
    try {
      const payload = {};
      if (newTenantEmail.trim()) payload.candidate_email = newTenantEmail.trim();

      const res = await authFetch("/tenant-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Impossible de créer le dossier locataire");
      }

      const data = await res.json().catch(() => null);

      await fetchTenants();
      if (data?.id) {
        setSelectedTenantId(data.id);
        await fetchTenantDetail(data.id);
      }

      setNewTenantEmail("");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur création dossier locataire");
    } finally {
      setCreatingTenant(false);
    }
  };

  const openConfirmDeleteTenant = () => {
    if (!selectedTenantId) return;
    setConfirmTenantDelete({
      open: true,
      tenantId: selectedTenantId,
    });
  };

  const handleDeleteTenant = async () => {
    const tenantId = confirmTenantDelete.tenantId ?? selectedTenantId;
    if (!authFetchOk || !tenantId) return;

    setError("");
    setDeleteTenantLoading(true);
    try {
      const res = await authFetch(`/tenant-files/${tenantId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Impossible de supprimer le dossier locataire");
      }

      // On enlève le dossier de la liste locale
      setTenants((prev) =>
        Array.isArray(prev)
          ? prev.filter((t) => String(t.id) !== String(tenantId))
          : []
      );

      // On reset la sélection & le détail si on était dessus
      setSelectedTenantId((prev) =>
        String(prev) === String(tenantId) ? null : prev
      );
      setTenantDetail((prev) =>
        prev && String(prev.id) === String(tenantId) ? null : prev
      );
      setTenantDocuments([]);

      setConfirmTenantDelete({ open: false, tenantId: null });
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors de la suppression du dossier.");
    } finally {
      setDeleteTenantLoading(false);
    }
  };

  const fetchTenantDetail = async (tenantId) => {
    if (!authFetchOk || !tenantId) return;
    setError("");
    setTenantLoading(true);
    try {
      const res = await authFetch(`/tenant-files/${tenantId}`);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Impossible de charger le détail du dossier");
      }
      const data = await res.json().catch(() => null);
      if (!data) throw new Error("Format de réponse invalide pour le détail du dossier");

      setTenantDetail(data);

      const currentFiles = uniqById(filesHistoryRef.current);
      const fromIds = normalizeIds(data.file_ids).map((idStr) => {
        const existing = currentFiles.find((f) => String(f.id) === String(idStr));
        if (existing) return existing;
        return normalizeFile({ id: Number(idStr) });
      });

      setTenantDocuments(uniqById(fromIds));
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur chargement détail dossier");
    } finally {
      setTenantLoading(false);
    }
  };

  const fetchFilesHistory = async () => {
    if (!authFetchOk) return;
    setError("");
    setFilesLoading(true);
    try {
      const res = await authFetch("/api/files/history");
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Impossible de charger l'historique des fichiers");
      }
      const data = await res.json().catch(() => []);
      const files = Array.isArray(data) ? data.map(normalizeFile).filter(Boolean) : [];
      setFilesHistory(files);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur chargement historique fichiers");
    } finally {
      setFilesLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
    fetchFilesHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedTenantId) {
      fetchTenantDetail(selectedTenantId);
    } else {
      setTenantDetail(null);
      setTenantDocuments([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenantId]);

  const handleSelectTenant = (id) => {
    setSelectedTenantId(id);
  };

  const handleRefreshTenants = async () => {
    await fetchTenants();
    if (selectedTenantId) {
      await fetchTenantDetail(selectedTenantId);
    }
  };

  const handleRefreshFiles = async () => {
    await fetchFilesHistory();
    if (selectedTenantId) {
      await fetchTenantDetail(selectedTenantId);
    }
  };

  const attachOptions = useMemo(() => {
    const usedIds = new Set(
      (tenantDocuments || []).map((doc) => String(doc.id))
    );

    return (filesHistory || []).filter((file) => !usedIds.has(String(file.id)));
  }, [filesHistory, tenantDocuments]);

  const handleAttachFile = async () => {
    if (!authFetchOk || !selectedTenantId || !selectedFileIdToAttach) return;

    setError("");
    setAttachLoading(true);
    try {
      const body = { file_id: Number(selectedFileIdToAttach) };
      const res = await authFetch(`/tenant-files/${selectedTenantId}/attach-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Impossible d'attacher le document");
      }

      const data = await res.json().catch(() => null);
      if (data?.file_id) {
        const found = (filesHistory || []).find(
          (f) => String(getFileId(f)) === String(data.file_id)
        );
        const normalized = normalizeFile(found || { id: data.file_id });
        if (normalized) {
          setTenantDocuments((prev) => uniqById([...(prev || []), normalized]));
        }
      } else {
        await fetchTenantDetail(selectedTenantId);
      }

      setSelectedFileIdToAttach("");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors de l'attachement du document");
    } finally {
      setAttachLoading(false);
    }
  };

  const handleUploadDocument = async (e) => {
    if (!authFetchOk || !selectedTenantId) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await authFetch(`/tenant-files/${selectedTenantId}/upload-document`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Erreur lors de l'upload du document");
      }

      const data = await res.json().catch(() => null);
      if (data && typeof data === "object" && data.file_id) {
        const fid = data.file_id;
        const normalizedUploaded = normalizeFile({
          id: fid,
          filename: data.filename,
          doc_type: data.doc_type,
        });

        setFilesHistory((prev) =>
          uniqById([...(prev || []), normalizedUploaded].filter(Boolean))
        );

        const tenantDoc = normalizeFile({
          id: fid,
          filename: data.filename,
          doc_type: data.doc_type,
        });
        if (tenantDoc) {
          setTenantDocuments((prev) => uniqById([...(prev || []), tenantDoc]));
        }

        if (data.checklist) {
          setTenantDetail((prev) =>
            prev && String(prev.id) === String(selectedTenantId)
              ? {
                  ...prev,
                  checklist_json: JSON.stringify(data.checklist),
                }
              : prev
          );
        }
      } else {
        await Promise.all([fetchFilesHistory(), fetchTenantDetail(selectedTenantId)]);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Erreur lors de l'upload du document");
    } finally {
      setUploadLoading(false);
      e.target.value = "";
    }
  };

  const handleViewFile = (file) => {
    const fileId = getFileId(file);
    if (!fileId) return;
    window.open(`/api/files/${fileId}/view`, "_blank", "noopener,noreferrer");
  };

  const handleDownloadFile = (file) => {
    const fileId = getFileId(file);
    if (!fileId) return;
    window.open(`/api/files/${fileId}/download`, "_blank", "noopener,noreferrer");
  };

  const handleUnlinkFile = (file) => {
    const fileId = getFileId(file);
    if (!fileId || !selectedTenantId) return;

    setConfirmState({
      open: true,
      mode: "unlink",
      fileId,
    });
  };

  const handleDeleteFile = (file) => {
    const fileId = getFileId(file);
    if (!fileId) return;
    setConfirmState({
      open: true,
      mode: "delete",
      fileId,
    });
  };

  const handleConfirmCancel = () => {
    setConfirmState({
      open: false,
      mode: null,
      fileId: null,
    });
  };

  const handleConfirmValidate = async () => {
    if (!authFetchOk) return;
    const { mode, fileId } = confirmState;
    if (!mode || !fileId) return;

    setError("");
    try {
      if (mode === "unlink") {
        if (!selectedTenantId) {
          throw new Error("Aucun dossier sélectionné pour retirer ce document.");
        }

        const res = await authFetch(
          `/tenant-files/${selectedTenantId}/unlink-document/${fileId}`,
          {
            method: "DELETE",
          }
        );

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || "Impossible de retirer le document du dossier");
        }

        setTenantDocuments((prev) =>
          (prev || []).filter((doc) => String(doc.id) !== String(fileId))
        );

        await fetchTenantDetail(selectedTenantId);
      } else if (mode === "delete") {
        const res = await authFetch(`/api/files/${fileId}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || "Impossible de supprimer définitivement le document");
        }

        setTenantDocuments((prev) =>
          (prev || []).filter((doc) => String(doc.id) !== String(fileId))
        );
        setFilesHistory((prev) =>
          (prev || []).filter((doc) => String(doc.id) !== String(fileId))
        );

        if (selectedTenantId) {
          await fetchTenantDetail(selectedTenantId);
        }
      }
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors de l'opération sur le document");
    } finally {
      setConfirmState({
        open: false,
        mode: null,
        fileId: null,
      });
    }
  };

  const currentChecklist =
    tenantDetail?.checklist_json && typeof tenantDetail.checklist_json === "string"
      ? (() => {
          try {
            return JSON.parse(tenantDetail.checklist_json);
          } catch {
            return null;
          }
        })()
      : tenantDetail?.checklist_json || null;

  const checklistMissing = currentChecklist?.missing || [];
  const checklistReceived = currentChecklist?.received || [];

  return (
    <div className="tenant-files-panel">
      <div className="tf-header-row">
        <div>
          <h1>Dossiers locataires</h1>
          <p>Centralise les fichiers et rattache les documents aux locataires.</p>
        </div>
        <div className="tf-header-actions">
          <button
            type="button"
            className="tf-btn tf-btn-secondary"
            onClick={handleRefreshTenants}
            disabled={tenantsLoading}
          >
            <RefreshCw size={16} />
            Rafraîchir locataires
          </button>

          <button
            type="button"
            className="tf-btn tf-btn-primary"
            onClick={handleRefreshFiles}
            disabled={filesLoading}
          >
            <RefreshCw size={16} />
            Rafraîchir fichiers
          </button>
        </div>
      </div>

      {error && <div className="tf-alert tf-alert-error">{error}</div>}

      <div className="tf-layout">
        <div className="tf-left">
          <div className="tf-card tf-card-tenants">
            <div className="tf-card-title">Locataires</div>

            <div className="tf-new-tenant">
              <input
                type="email"
                placeholder="Email candidat (optionnel)"
                value={newTenantEmail}
                onChange={(e) => setNewTenantEmail(e.target.value)}
              />
              <button
                type="button"
                className="tf-btn tf-btn-primary"
                onClick={handleCreateTenant}
                disabled={creatingTenant}
              >
                {creatingTenant ? "Création..." : "Nouveau dossier"}
              </button>
            </div>

            {tenantsLoading ? (
              <div className="tf-muted">Chargement des dossiers...</div>
            ) : !tenants.length ? (
              <div className="tf-muted">
                Aucun dossier locataire pour le moment. Crée un nouveau dossier pour commencer.
              </div>
            ) : (
              <div className="tf-tenant-list">
                {tenants.map((t) => {
                  const isSelected = String(t.id) === String(selectedTenantId);
                  const statusLabel =
                    t.status === "validated"
                      ? "VALIDÉ"
                      : t.status === "to_validate"
                      ? "À VALIDER"
                      : t.status === "incomplete"
                      ? "INCOMPLET"
                      : "NEW";

                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`tf-tenant-item ${isSelected ? "tf-tenant-item-active" : ""}`}
                      onClick={() => handleSelectTenant(t.id)}
                    >
                      <div className="tf-tenant-main">
                        <div className="tf-tenant-email">{t.candidate_email || "—"}</div>
                        <div className={`tf-badge tf-badge-${t.status || "new"}`}>
                          {statusLabel}
                        </div>
                      </div>
                      <div className="tf-tenant-sub">
                        <span>
                          {t.documents_count != null
                            ? `${t.documents_count} document${
                                t.documents_count > 1 ? "s" : ""
                              }`
                            : "0 document"}
                        </span>
                        {t.risk_level && (
                          <span className={`tf-risk tf-risk-${t.risk_level}`}>
                            Risque {t.risk_level}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="tf-right">
          <div className="tf-card">
            <div className="tf-card-title tf-row">
              <span className="tf-row-left">Détails</span>

              {tenantDetail && (
                <button
                  type="button"
                  className="tf-btn tf-btn-danger"
                  onClick={openConfirmDeleteTenant}
                  disabled={deleteTenantLoading}
                >
                  <Trash2 size={16} />{" "}
                  {deleteTenantLoading ? "Suppression..." : "Supprimer le dossier"}
                </button>
              )}
            </div>

            {tenantLoading ? (
              <div className="tf-muted">Chargement...</div>
            ) : !tenantDetail ? (
              <div className="tf-muted">Sélectionne un locataire à gauche.</div>
            ) : (
              <>
                <div className="tf-kv">
                  <span className="tf-k">Email candidat</span>
                  <span className="tf-v">{tenantDetail.candidate_email || "—"}</span>
                </div>

                <div className="tf-kv">
                  <span className="tf-k">Statut</span>
                  <span className="tf-v">
                    <span className={`tf-badge tf-badge-${tenantDetail.status || "new"}`}>
                      {tenantDetail.status === "validated"
                        ? "VALIDÉ"
                        : tenantDetail.status === "to_validate"
                        ? "À VALIDER"
                        : tenantDetail.status === "incomplete"
                        ? "INCOMPLET"
                        : "NOUVEAU"}
                    </span>
                  </span>
                </div>

                <div className="tf-kv">
                  <span className="tf-k">Documents liés</span>
                  <span className="tf-v">{(tenantDetail.file_ids || []).length}</span>
                </div>

                <div className="tf-checklist-block">
                  <div className="tf-checklist-header">
                    <span>Checklist du dossier</span>
                    {currentChecklist && (
                      <span className="tf-badge tf-badge-pill">
                        {currentChecklist.missing?.length || 0} manquante
                        {currentChecklist.missing?.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {!currentChecklist ? (
                    <div className="tf-muted">
                      Aucune checklist disponible pour ce dossier pour le moment.
                    </div>
                  ) : (
                    <div className="tf-checklist-grid">
                      <div>
                        <div className="tf-checklist-title tf-checklist-title-ok">Reçues</div>
                        {!checklistReceived.length ? (
                          <div className="tf-pill tf-pill-muted">Aucune pièce reçue.</div>
                        ) : (
                          checklistReceived.map((item) => (
                            <span key={item} className="tf-pill tf-pill-ok">
                              {getDocLabel(item)}
                            </span>
                          ))
                        )}
                      </div>
                      <div>
                        <div className="tf-checklist-title tf-checklist-title-missing">
                          Manquantes
                        </div>
                        {!checklistMissing.length ? (
                          <div className="tf-pill tf-pill-ok">Aucune pièce manquante.</div>
                        ) : (
                          checklistMissing.map((item) => (
                            <span key={item} className="tf-pill tf-pill-missing">
                              {getDocLabel(item)}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="tf-upload-section">
                  <div className="tf-upload-row">
                    <label className="tf-btn tf-btn-secondary tf-btn-upload">
                      <FolderOpen size={16} />
                      <span>Téléverser un fichier</span>
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        onChange={handleUploadDocument}
                        disabled={uploadLoading}
                      />
                    </label>
                    {uploadLoading && (
                      <span className="tf-upload-status">Upload en cours...</span>
                    )}
                  </div>

                  <div className="tf-attach-row">
                    <select
                      value={selectedFileIdToAttach}
                      onChange={(e) => setSelectedFileIdToAttach(e.target.value)}
                      disabled={attachLoading}
                    >
                      <option value="">Attacher un document existant...</option>
                      {attachOptions.map((file) => (
                        <option key={file.id} value={file.id}>
                          #{file.id} — {file.filename}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="tf-btn tf-btn-primary"
                      onClick={handleAttachFile}
                      disabled={attachLoading || !selectedFileIdToAttach}
                    >
                      <Link2 size={16} />
                      Attacher
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="tf-card tf-card-documents">
            <div className="tf-card-title tf-row">
              <span className="tf-row-left">
                <FileText size={16} />
                <span>Pièces du dossier</span>
                {tenantDetail?.file_ids?.length ? (
                  <span className="tf-badge tf-badge-pill">
                    {tenantDetail.file_ids.length} document
                    {tenantDetail.file_ids.length > 1 ? "s" : ""}
                  </span>
                ) : null}
              </span>
            </div>

            {!tenantDetail ? (
              <div className="tf-muted">Sélectionne un dossier pour voir ses pièces.</div>
            ) : tenantDocuments.length === 0 ? (
              <div className="tf-alert tf-alert-warning">
                Le dossier a des file_ids mais aucun document n'est encore chargé côté UI.
                (Normalement corrigé maintenant)
              </div>
            ) : (
              <div className="tf-doc-list">
                {tenantDocuments.map((file) => (
                  <div key={file.id} className="tf-doc-row">
                    <div className="tf-doc-main">
                      <div className="tf-doc-title">
                        <span className="tf-doc-id">#{file.id}</span>
                        <span className="tf-doc-name">{file.filename}</span>
                      </div>
                      <div className="tf-doc-meta">
                        <span className="tf-pill tf-pill-type">
                          {getDocLabel(file.file_type || file.doc_type || "Document")}
                        </span>
                        {file.amount && (
                          <span className="tf-doc-amount">
                            Montant : <strong>{file.amount} €</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="tf-doc-actions">
                      <button
                        type="button"
                        className="tf-icon-btn"
                        title="Voir le document"
                        onClick={() => handleViewFile(file)}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        className="tf-icon-btn"
                        title="Télécharger"
                        onClick={() => handleDownloadFile(file)}
                      >
                        <Download size={16} />
                      </button>
                      <button
                        type="button"
                        className="tf-icon-btn tf-icon-btn-warning"
                        title="Retirer du dossier"
                        onClick={() => handleUnlinkFile(file)}
                      >
                        <Link2 size={16} />
                      </button>
                      <button
                        type="button"
                        className="tf-icon-btn tf-icon-btn-danger"
                        title="Supprimer définitivement"
                        onClick={() => handleDeleteFile(file)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmState.open && (
        <div className="tf-modal-backdrop">
          <div
            className={`tf-modal ${
              confirmState.mode === "delete" ? "tf-modal-danger" : "tf-modal-warning"
            }`}
          >
            <div className="tf-modal-header">
              {confirmState.mode === "delete"
                ? "Supprimer définitivement le document ?"
                : "Retirer le document du dossier ?"}
            </div>

            <div className="tf-modal-body">
              {confirmState.mode === "delete" ? (
                <>
                  Ce document sera <strong>supprimé définitivement</strong> (irréversible).
                </>
              ) : (
                <>
                  Le document sera <strong>retiré de ce dossier</strong> mais restera dans
                  l'historique.
                </>
              )}
            </div>

            <div className="tf-modal-actions">
              <button
                type="button"
                className="tf-btn tf-btn-ghost"
                onClick={handleConfirmCancel}
              >
                Annuler
              </button>

              <button
                type="button"
                className={
                  confirmState.mode === "delete"
                    ? "tf-btn tf-btn-danger"
                    : "tf-btn tf-btn-primary"
                }
                onClick={handleConfirmValidate}
              >
                {confirmState.mode === "delete"
                  ? "Supprimer définitivement"
                  : "Retirer du dossier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmTenantDelete.open && (
        <div className="tf-modal-backdrop">
          <div className="tf-modal tf-modal-danger">
            <div className="tf-modal-header">
              Supprimer définitivement ce dossier locataire ?
            </div>

            <div className="tf-modal-body">
              <p>
                Le dossier sera <strong>supprimé</strong> ainsi que les{" "}
                <strong>liens</strong> avec ses documents et emails.
              </p>
              <p>Les documents resteront disponibles dans l'historique global.</p>
            </div>

            <div className="tf-modal-actions">
              <button
                type="button"
                className="tf-btn tf-btn-ghost"
                onClick={() =>
                  setConfirmTenantDelete({ open: false, tenantId: null })
                }
                disabled={deleteTenantLoading}
              >
                Annuler
              </button>

              <button
                type="button"
                className="tf-btn tf-btn-danger"
                onClick={handleDeleteTenant}
                disabled={deleteTenantLoading}
              >
                {deleteTenantLoading ? "Suppression..." : "Supprimer le dossier"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
