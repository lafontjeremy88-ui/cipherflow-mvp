import React, { useEffect, useMemo, useState, useRef } from "react";
import { RefreshCw, Eye, Download, Link2, FolderOpen, FileText, Trash2, Upload } from "lucide-react";

// Mapping des codes internes -> libellés lisibles
const DOC_LABELS = {
  payslip: "Fiche de paie",
  id: "Pièce d'identité",
  tax: "Avis d'impôt",
  // Tu pourras en rajouter ici au fur et à mesure :
  // rent_receipt: "Quittance de loyer",
  // guarantor_payslip: "Fiche de paie garant",
};



function getDocLabel(code) {
  return DOC_LABELS[code] || code;
}

export default function TenantFilesPanel({ authFetch }) {
  const [tenants, setTenants] = useState([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);

  const [selectedTenantId, setSelectedTenantId] = useState(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantDetail, setTenantDetail] = useState(null);

  const [filesHistory, setFilesHistory] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);

  const [selectedFileIdToAttach, setSelectedFileIdToAttach] = useState("");
  const [attachLoading, setAttachLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState({
    open: false,
    mode: null, // "unlink" | "delete"
    fileId: null,
  });

  const [newTenantEmail, setNewTenantEmail] = useState("");
  const [creatingTenant, setCreatingTenant] = useState(false);

  const authFetchOk = typeof authFetch === "function";

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
      if (newTenantEmail.trim()) {
        payload.candidate_email = newTenantEmail.trim();
      }

      const res = await authFetch("/tenant-files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Impossible de créer le dossier locataire");
      }

      const data = await res.json().catch(() => null);

      await fetchTenants(); // recharge la liste
      if (data?.id) {
        setSelectedTenantId(data.id); // auto-sélection
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
      setTenantDetail(data || null);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur chargement dossier");
      setTenantDetail(null);
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
        throw new Error(
          txt || "Impossible de charger l'historique des documents"
        );
      }
      const data = await res.json().catch(() => []);
      setFilesHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur chargement documents");
      setFilesHistory([]);
    } finally {
      setFilesLoading(false);
    }
  };

  const handleAttach = async () => {
    if (!authFetchOk || !selectedTenantId || !selectedFileIdToAttach) return;
    setError("");
    setAttachLoading(true);
    try {
      const res = await authFetch(
        `/tenant-files/${selectedTenantId}/attach-document/${selectedFileIdToAttach}`,
        { method: "POST" }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Erreur attach-document");
      }

      await fetchTenantDetail(selectedTenantId);
      setSelectedFileIdToAttach("");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur : impossible d'attacher le document.");
    } finally {
      setAttachLoading(false);
    }
  };

  const handleUploadForTenant = async (event) => {
  if (!authFetchOk) return;

  const file = event.target.files?.[0];
  if (!file || !selectedTenantId) return;

  try {
    setError("");
    setUploadLoading(true);

    // 1) Upload + analyse du fichier
    const formData = new FormData();
    formData.append("file", file);

    const analyzeRes = await authFetch("/api/analyze-file", {
      method: "POST",
      body: formData,
    });

    if (!analyzeRes.ok) {
      console.error("analyze-file error:", await analyzeRes.text());
      alert("Erreur upload/analyse.");
      return;
    }

    const analyzeData = await analyzeRes.json();
    const fileAnalysisId = analyzeData.file_analysis_id;

    if (!fileAnalysisId) {
      console.error("file_analysis_id manquant:", analyzeData);
      alert("Upload OK mais impossible de rattacher au dossier (ID manquant).");
      return;
    }

    // 2) Rattacher ce file_analysis au dossier locataire sélectionné
    const attachRes = await authFetch(
      `/tenant-files/${selectedTenantId}/attach-document`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_analysis_id: fileAnalysisId }),
      }
    );

    if (!attachRes.ok) {
      console.error("attach-document error:", await attachRes.text());
      alert("Upload OK mais rattachement au dossier échoué.");
      return;
    }

    // 3) Rafraîchir l’UI (locataires + détails + pièces + historique)
    await Promise.all([
      fetchTenantDetail(selectedTenantId),
      fetchTenantFiles(selectedTenantId),
      fetchTenants(),
      fetchFilesHistory(),
    ]);

    // reset de l’input file
    event.target.value = "";
  } catch (e) {
    console.error(e);
    alert("Erreur inattendue.");
  } finally {
    setUploadLoading(false);
  }
};



  // ✅ Voir (ouvre dans un nouvel onglet via Blob, compatible JWT)
  const handleViewFile = async (fileId) => {
    if (!authFetchOk || !fileId) return;
    setError("");
    try {
      const res = await authFetch(`/api/files/view/${fileId}`);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Impossible d'ouvrir le document");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      // Note: on ne revoke pas tout de suite sinon certains navigateurs ferment l'onglet/preview
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors de l'ouverture du document.");
    }
  };

  // ✅ Télécharger (force download)
  const handleDownloadFile = async (file) => {
    if (!authFetchOk || !file?.id) return;
    setError("");
    try {
      const res = await authFetch(`/api/files/download/${file.id}`);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Impossible de télécharger le document");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename || `document_${file.id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors du téléchargement du document.");
    }
  };

  // ✅ Supprimer définitivement le fichier (DB + disque côté API)
  const handleDeleteFile = async (fileId) => {
    if (!authFetchOk || !fileId) return;

    setError("");
    try {
      const res = await authFetch(`/api/files/${fileId}`, { method: "DELETE" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Impossible de supprimer le document");
      }

      // refresh: historique + dossier ouvert
      await fetchFilesHistory();
      if (selectedTenantId) await fetchTenantDetail(selectedTenantId);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors de la suppression du document.");
    }
  };

  // ✅ Retirer du dossier (unlink uniquement)
  const handleUnlinkFromTenant = async (fileId) => {
    if (!authFetchOk || !fileId || !selectedTenantId) return;

    setError("");
    try {
      const res = await authFetch(
        `/tenant-files/${selectedTenantId}/documents/${fileId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Impossible de retirer le document du dossier");
      }

      // refresh: uniquement le dossier (pas besoin de refresh l'historique)
      await fetchTenantDetail(selectedTenantId);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors du retrait du document du dossier.");
    }
  };

  // ===== Gestion de la modal de confirmation =====
  const openConfirmUnlink = (fileId) => {
    setConfirmState({
      open: true,
      mode: "unlink",
      fileId,
    });
  };

  const openConfirmDelete = (fileId) => {
    setConfirmState({
      open: true,
      mode: "delete",
      fileId,
    });
  };

  const handleConfirmCancel = () => {
    setConfirmState({ open: false, mode: null, fileId: null });
  };

  const handleConfirmValidate = async () => {
    const { mode, fileId } = confirmState;
    if (!fileId || !mode) {
      handleConfirmCancel();
      return;
    }

    if (mode === "unlink") {
      await handleUnlinkFromTenant(fileId);
    } else if (mode === "delete") {
      await handleDeleteFile(fileId);
    }

    handleConfirmCancel();
  };

  // first load
  useEffect(() => {
    fetchTenants();
    fetchFilesHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authFetchOk]);

  // tenant selection -> detail
  useEffect(() => {
    if (selectedTenantId) fetchTenantDetail(selectedTenantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenantId]);

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

  const checklist = useMemo(() => {
    const raw = tenantDetail?.checklist_json ?? tenantDetail?.checklist ?? null;
    if (!raw) return null;

    if (typeof raw === "object") return raw;

    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return null;
  }, [tenantDetail]);

  const receivedDocs = Array.isArray(checklist?.received)
    ? checklist.received
    : [];
  const missingDocs = Array.isArray(checklist?.missing)
    ? checklist.missing
    : [];

  const linkedFiles = useMemo(() => {
    const set = new Set(linkedFileIds);
    return filesHistory.filter((f) => set.has(String(f.id)));
  }, [filesHistory, linkedFileIds]);

  const unlinkedFiles = useMemo(() => {
    const set = new Set(linkedFileIds);
    return filesHistory.filter((f) => !set.has(String(f.id)));
  }, [filesHistory, linkedFileIds]);

  if (!authFetchOk) {
    return (
      <div className="tf-page">
        <div className="tf-warn">
          <div style={{ fontWeight: 900, marginBottom: 6 }}>
            Erreur de configuration
          </div>
          <div>
            <code>authFetch</code> n’a pas été passé à{" "}
            <code>&lt;TenantFilesPanel /&gt;</code>.
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
          <div className="tf-sub">
            Centralise les fichiers et rattache les documents aux locataires.
          </div>
        </div>

        <div className="tf-actions">
          <button
            className="tf-btn tf-btn-ghost"
            onClick={fetchTenants}
            disabled={tenantsLoading}
          >
            <RefreshCw size={16} />{" "}
            {tenantsLoading ? "Chargement..." : "Rafraîchir locataires"}
          </button>
          <button
            className="tf-btn tf-btn-primary"
            onClick={fetchFilesHistory}
            disabled={filesLoading}
          >
            <FolderOpen size={16} />{" "}
            {filesLoading ? "Chargement..." : "Rafraîchir fichiers"}
          </button>
        </div>
      </div>

      {!!error && (
        <div
          className="tf-warn"
          style={{ borderColor: "rgba(239,68,68,.45)" }}
        >
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Erreur</div>
          <div style={{ opacity: 0.95 }}>{error}</div>
        </div>
      )}

      <div className="tf-grid">
        <div className="tf-card">
          <div className="tf-card-title">Locataires</div>

          {/* Barre de création de nouveau dossier */}
          <div className="tf-new-tenant-row">
            <input
              type="email"
              className="tf-input"
              placeholder="Email candidat (optionnel)"
              value={newTenantEmail}
              onChange={(e) => setNewTenantEmail(e.target.value)}
            />
            <button
              type="button"
              className="tf-btn tf-btn-secondary"
              onClick={handleCreateTenant}
              disabled={creatingTenant}
            >
              {creatingTenant ? "Création..." : "Nouveau dossier"}
            </button>
          </div>

          {tenantsLoading ? (
            <div className="tf-muted">Chargement...</div>
          ) : tenants.length === 0 ? (
            <div className="tf-muted">Aucun locataire.</div>
          ) : (
            <div className="tf-list">
              {tenants.map((t) => {
                const active = String(selectedTenantId) === String(t.id);
                const checklist = t.checklist_json || {};
                const missingCount = Object.values(checklist).filter(
                  (v) => v === false
                ).length;

                return (
                  <button
                    key={t.id}
                    className={`tf-item ${active ? "is-active" : ""}`}
                    onClick={() => setSelectedTenantId(t.id)}
                    type="button"
                  >
                    <div className="tf-item-title">Dossier #{t.id}</div>
                    <div className="tf-item-sub">
                      <span>{t.candidate_email || "-"}</span>
                      {t.status && (
                        <span
                          className={`tf-status ${
                            t.status === "complete"
                              ? "complete"
                              : t.status === "new"
                              ? "new"
                              : "incomplete"
                          }`}
                        >
                          {t.status}
                        </span>
                      )}

                      {t.status === "incomplete" && missingCount > 0 && (
                        <span className="tf-missing-count">
                          {missingCount} pièce
                          {missingCount > 1 ? "s" : ""} manquante
                          {missingCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="tf-right">
          <div className="tf-card">
            <div className="tf-card-title">Détails</div>

            {tenantLoading ? (
              <div className="tf-muted">Chargement...</div>
            ) : !tenantDetail ? (
              <div className="tf-muted">
                Sélectionne un locataire à gauche.
              </div>
            ) : (
              <>
                <div className="tf-kv">
                  <div>
                    <div className="tf-k">Email candidat</div>
                    <div className="tf-v">
                      {tenantDetail.candidate_email || "-"}
                    </div>
                  </div>

                  <div>
                    <div className="tf-k">Statut</div>
                    <div className="tf-v">
                      {tenantDetail.status ? (
                        <span
                          className={`tf-status ${
                            tenantDetail.status === "complete"
                              ? "complete"
                              : tenantDetail.status === "new"
                              ? "new"
                              : "incomplete"
                          }`}
                        >
                          {tenantDetail.status}
                        </span>
                      ) : (
                        "-"
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="tf-k">Documents liés</div>
                    <div className="tf-v">{linkedFileIds.length}</div>
                  </div>
                </div>

                {checklist && (
                  <div className="tf-checklist">
                    <div className="tf-checklist-head">
                      <div className="tf-checklist-header">
                        <span>Checklist du dossier</span>{" "}

                        {/* ✅ Correction MICRO-BUG 1 : missingDocs.length au lieu de missingCount */}
                        {missingDocs.length > 0 && (
                          <span className="tf-missing-badge">
                            {missingDocs.length} manquante
                            {missingDocs.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="tf-checklist-meta">
                        {missingDocs.length === 0 ? (
                          <span className="tf-pill tf-pill-success">
                            Complet
                          </span>
                        ) : (
                          <span className="tf-pill tf-pill-warning">
                            {missingDocs.length} manquante
                            {missingDocs.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="tf-checklist-grid">
                      <div className="tf-checklist-col">
                        <div className="tf-checklist-col-title">Reçues</div>
                        {receivedDocs.length === 0 ? (
                          <div className="tf-muted">
                            Aucune pièce reçue.
                          </div>
                        ) : (
                          <div className="tf-badges">
                            {receivedDocs.map((d) => (
                              <span
                                className="tf-pill tf-pill-success"
                                key={`rec-${d}`}
                              >
                                ✅ {getDocLabel(d)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="tf-checklist-col">
                        <div className="tf-checklist-col-title">
                          Manquantes
                        </div>
                        {missingDocs.length === 0 ? (
                          <div className="tf-muted">
                            Aucune pièce manquante.
                          </div>
                        ) : (
                          <div className="tf-badges">
                            {missingDocs.map((d) => (
                              <span
                                className="tf-pill tf-pill-danger"
                                key={`mis-${d}`}
                              >
                                ❌ {getDocLabel(d)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ✅ Correction MICRO-BUG 2 :
                        hint déplacé EN DEHORS de tf-checklist-grid */}
                    {missingDocs.length > 0 && (
                      <div className="tf-checklist-hint">
                        Ajoute les pièces manquantes pour compléter le dossier.
                      </div>
                    )}
                  </div>
                )}

                 <div className="tf-attach-row">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleUploadForTenant}
                    disabled={!selectedTenantId || uploadLoading || !authFetchOk}
                    style={{ display: "none" }}
                    id="tenant-upload-input"
                  />

                  <label
                    htmlFor="tenant-upload-input"
                    className="tf-btn tf-btn-secondary"
                  >
                    {uploadLoading ? "Téléversement..." : "Téléverser un fichier"}
                  </label>

                  <span className="tf-muted">
                    PDF, PNG, JPG – taille max 10 Mo
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="tf-card">
            <div className="tf-card-title tf-row">
              <span className="tf-row-left">
                <FileText size={18} /> Pièces du dossier
              </span>
              <span className="tf-chip">{linkedFiles.length}</span>
            </div>

            {!tenantDetail ? (
              <div className="tf-muted">
                Sélectionne un locataire pour voir ses pièces.
              </div>
            ) : linkedFileIds.length === 0 ? (
              <div className="tf-muted">Aucun document attaché.</div>
            ) : linkedFiles.length === 0 ? (
              <div className="tf-warn">
                ⚠️ Le dossier a des <code>file_ids</code> mais je ne retrouve
                pas leurs détails dans <code>/api/files/history</code>. Clique
                “Rafraîchir fichiers”.
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
                        {f.created_at
                          ? new Date(f.created_at).toLocaleString()
                          : ""}
                      </div>
                    </div>

                    <div className="tf-file-actions">
                      <button
                        type="button"
                        className="tf-btn tf-btn-ghost"
                        onClick={() => handleViewFile(f.id)}
                      >
                        <Eye size={16} /> Voir
                      </button>

                      <button
                        type="button"
                        className="tf-btn tf-btn-ghost"
                        onClick={() => handleDownloadFile(f)}
                      >
                        <Download size={16} /> Télécharger
                      </button>

                      <button
                        type="button"
                        className="tf-btn tf-btn-ghost"
                        onClick={() => openConfirmUnlink(f.id)}
                      >
                        <Link2 size={16} /> Retirer du dossier
                      </button>

                      <button
                        type="button"
                        className="tf-btn tf-btn-danger"
                        onClick={() => openConfirmDelete(f.id)}
                      >
                        <Trash2 size={16} /> Supprimer définitivement
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de confirmation */}
      {confirmState.open && (
        <div className="tf-modal-backdrop">
          <div
            className={`tf-modal ${
              confirmState.mode === "delete"
                ? "tf-modal-danger"
                : "tf-modal-warning"
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
                  Ce document sera <strong>supprimé définitivement</strong> :
                  <ul>
                    <li>retiré du dossier locataire</li>
                    <li>retiré de l'historique</li>
                    <li>supprimé du stockage</li>
                  </ul>
                  Cette action est <strong>irréversible</strong>.
                </>
              ) : (
                <>
                  Le document sera <strong>retiré de ce dossier</strong>, mais :
                  <ul>
                    <li>restera visible dans l'historique</li>
                    <li>pourra être rattaché à un autre dossier</li>
                  </ul>
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
    </div>
  );
}



/*=====essai====*/