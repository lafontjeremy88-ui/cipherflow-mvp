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
  work_contract: "Contrat de travail",
  address_proof: "Justificatif de domicile",
  bank: "RIB",
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
    } catch {
      return ids
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
  }
  return [];
}

// ✅ Statut UI dérivé de la checklist (ne dépend pas du backend)
function deriveStatusFromChecklist(checklist) {
  const received = Array.isArray(checklist?.received) ? checklist.received : [];
  const missing = Array.isArray(checklist?.missing) ? checklist.missing : [];

  if (missing.length === 0 && received.length > 0) return "complete";
  if (received.length > 0 && missing.length > 0) return "incomplete";
  // si pas de reçues mais des manquantes => plutôt "new"
  if (received.length === 0 && missing.length > 0) return "new";
  return null;
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
  const [analysingWorker, setAnalysingWorker] = useState(false); // ✅ worker RQ en cours
  const [deleteTenantLoading, setDeleteTenantLoading] = useState(false);

  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState({
    open: false,
    mode: null, // "unlink" | "delete"
    fileId: null,
  });

  // ✅ Nouveau : état pour la modal de suppression de dossier
  const [confirmTenantDelete, setConfirmTenantDelete] = useState({
    open: false,
    tenantId: null,
  });

  const [newTenantEmail, setNewTenantEmail] = useState("");
  const [creatingTenant, setCreatingTenant] = useState(false);

  // Édition / renommage du dossier
  const [editingEmail, setEditingEmail] = useState("");
  const [editingName, setEditingName] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

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

  // ✅ Ouvre la mini-modal de suppression de dossier
  const openConfirmDeleteTenant = () => {
    if (!selectedTenantId) return;
    setConfirmTenantDelete({ open: true, tenantId: selectedTenantId });
  };

  // ✅ Suppression effective du dossier (appelée par le bouton de la modal)
  const handleDeleteTenant = async () => {
    if (!authFetchOk) return;

    const tenantId = confirmTenantDelete.tenantId ?? selectedTenantId;
    if (!tenantId) return;

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

      // Reset sélection & détail si besoin
      setSelectedTenantId((prev) =>
        String(prev) === String(tenantId) ? null : prev
      );
      setTenantDetail((prev) =>
        prev && String(prev.id) === String(tenantId) ? null : prev
      );
      setTenantDocuments([]);

      // Ferme la modal
      setConfirmTenantDelete({ open: false, tenantId: null });
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors de la suppression du dossier.");
    } finally {
      setDeleteTenantLoading(false);
    }
  };

  // Sauvegarde des infos du dossier (email + nom)
  const handleSaveTenantMeta = async () => {
    if (!authFetchOk || !selectedTenantId) return;

    setError("");
    setSavingMeta(true);
    try {
      const payload = {
        candidate_email: editingEmail.trim() || null,
        candidate_name: editingName.trim() || null,
      };

      const res = await authFetch(`/tenant-files/${selectedTenantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(
          txt ||
            "Impossible de mettre à jour les informations du dossier locataire."
        );
      }

      const data = await res.json().catch(() => null);
      if (data) setTenantDetail(data);

      // On rafraîchit la liste de gauche pour voir le nouveau nom/email
      await fetchTenants();
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors de la mise à jour du dossier.");
    } finally {
      setSavingMeta(false);
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

      const ids = normalizeIds(data?.file_ids);

      // ✅ Sync robuste des docs du dossier :
      // - si backend renvoie data.documents => on prend ça
      // - sinon on reconstruit via file_ids en gardant nos docs déjà connus + ceux de l'historique
      if (Array.isArray(data?.documents)) {
        setTenantDocuments(uniqById(data.documents));
      } else {
        setTenantDocuments((prev) => {
          const prevArr = Array.isArray(prev) ? prev : [];
          const keptPrev = prevArr
            .map(normalizeFile)
            .filter(Boolean)
            .filter((d) => ids.includes(String(d.id)));

          const fromHistory = (filesHistoryRef.current || [])
            .map(normalizeFile)
            .filter(Boolean)
            .filter((d) => ids.includes(String(d.id)));

          return uniqById([...keptPrev, ...fromHistory]);
        });
      }
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur chargement dossier");
      setTenantDetail(null);
      setTenantDocuments([]);
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
        throw new Error(txt || "Impossible de charger l'historique des documents");
      }
      const data = await res.json().catch(() => []);
      const arrRaw = Array.isArray(data) ? data : [];
      const arr = arrRaw.map(normalizeFile).filter(Boolean);

      setFilesHistory(arr);

      // ✅ Si un dossier est sélectionné, resynchronise tenantDocuments depuis file_ids
      if (tenantDetail?.file_ids) {
        const ids = normalizeIds(tenantDetail.file_ids);
        setTenantDocuments((prev) => {
          const prevArr = Array.isArray(prev) ? prev : [];
          const keptPrev = prevArr
            .map(normalizeFile)
            .filter(Boolean)
            .filter((d) => ids.includes(String(d.id)));

          const fromHistory = arr.filter((d) => ids.includes(String(d.id)));
          return uniqById([...keptPrev, ...fromHistory]);
        });
      }
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

      await Promise.all([
        fetchTenantDetail(selectedTenantId),
        fetchFilesHistory(),
      ]);
      setSelectedFileIdToAttach("");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur : impossible d'attacher le document.");
    } finally {
      setAttachLoading(false);
    }
  };

  // ✅ Upload direct + lien au dossier via endpoint atomic
  // ✅ Fix polling : après upload, on attend que le worker RQ finisse l'analyse Gemini
  //    avant de mettre à jour la checklist (le worker prend ~15-25s)
  const handleUploadForTenant = async (event) => {
    if (!authFetchOk) return;

    const file = event.target.files?.[0];
    if (!file || !selectedTenantId) return;

    try {
      setError("");
      setUploadLoading(true);

      const formData = new FormData();
      formData.append("file", file);

      const res = await authFetch(
        `/tenant-files/${selectedTenantId}/upload-document`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("upload-document error:", txt);
        throw new Error(
          txt || "Erreur lors de l'upload du fichier pour ce dossier locataire."
        );
      }

      const payload = await res.json().catch(() => null);

      const fileId = payload?.file_id;
      if (!fileId) {
        console.warn("upload-document: réponse sans file_id, refresh complet.");
        await Promise.all([
          fetchTenantDetail(selectedTenantId),
          fetchFilesHistory(),
          fetchTenants(),
        ]);
        return;
      }

      const newFileIdStr = String(fileId);
      const docType = payload?.doc_type || "Document";
      const filename = payload?.filename || file.name || `document_${fileId}`;
      const checklistPayload = payload?.checklist || null;

      const nowIso = new Date().toISOString();
      const newFile = normalizeFile({
        id: Number(fileId),
        filename,
        file_type: docType,
        created_at: nowIso,
        sender: "Upload manuel",
        summary: "",
      });

      // 1) UI immédiate — le fichier apparaît tout de suite dans la liste
      setTenantDocuments((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        const exists = arr.some((f) => String(getFileId(f)) === newFileIdStr);
        return exists ? arr : [newFile, ...arr];
      });

      // 2) Historique global UI
      setFilesHistory((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        const exists = arr.some((f) => String(getFileId(f)) === newFileIdStr);
        return exists ? arr : [newFile, ...arr];
      });

      // 3) Met à jour le détail du dossier avec la checklist reçue du backend
      setTenantDetail((prev) => {
        const base = { ...(prev || {}) };
        const prevIds = normalizeIds(base.file_ids);
        const nextIds = prevIds.includes(newFileIdStr)
          ? prevIds
          : [newFileIdStr, ...prevIds];

        const checklistJson =
          checklistPayload && typeof checklistPayload === "object"
            ? JSON.stringify(checklistPayload)
            : checklistPayload;

        return {
          ...base,
          file_ids: nextIds,
          checklist: checklistPayload ?? base.checklist,
          checklist_json: checklistJson ?? base.checklist_json,
        };
      });

      // 4) Premier refresh immédiat
      await Promise.all([
        fetchTenantDetail(selectedTenantId),
        fetchFilesHistory(),
        fetchTenants(),
      ]);

      // 5) Polling post-worker : le worker RQ analyse le fichier en ~15-25s
      //    On re-poll toutes les 4s (max 45s) jusqu'à ce que la checklist se mette à jour
      //    (i.e. au moins un doc est "received" OU le type du fichier n'est plus "Document")
      const tenantIdSnapshot = selectedTenantId;
      const POLL_INTERVAL_MS = 4_000;
      const POLL_MAX_MS = 45_000;
      const pollStart = Date.now();
      setAnalysingWorker(true); // ✅ indicateur visuel

      const poll = async () => {
        if (Date.now() - pollStart > POLL_MAX_MS) {
          setAnalysingWorker(false); // timeout
          return;
        }

        try {
          const r = await authFetch(`/tenant-files/${tenantIdSnapshot}`);
          if (!r.ok) return;
          const data = await r.json().catch(() => null);
          if (!data) return;

          // Checklist à jour = au moins 1 doc reçu OU le fichier n'est plus classé "Document"
          const raw = data?.checklist_json ?? data?.checklist ?? null;
          let cl = null;
          if (raw) {
            try { cl = typeof raw === "object" ? raw : JSON.parse(raw); } catch {}
          }

          const received = Array.isArray(cl?.received) ? cl.received : [];
          const filesList = Array.isArray(data?.documents)
            ? data.documents
            : [];
          const uploadedFile = filesList.find(
            (f) => String(f?.id ?? f?.file_id) === newFileIdStr
          );
          const workerDone =
            received.length > 0 ||
            (uploadedFile && uploadedFile.file_type && uploadedFile.file_type !== "Document");

          if (workerDone) {
            // Worker fini → refresh complet final
            setTenantDetail(data);
            if (Array.isArray(data?.documents)) {
              setTenantDocuments(uniqById(data.documents));
            }
            await Promise.all([fetchFilesHistory(), fetchTenants()]);
            setAnalysingWorker(false); // ✅ analyse terminée
          } else {
            // Pas encore prêt → on replanifie
            setTimeout(poll, POLL_INTERVAL_MS);
          }
        } catch {
          // silencieux — on réessaiera au prochain tick
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      // Démarre le polling après un délai initial (le worker ne démarrera pas avant ~5s)
      setTimeout(poll, 5_000);

    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors de l'upload du document pour ce dossier.");
    } finally {
      setUploadLoading(false);
      if (event?.target) event.target.value = "";
    }
  };

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
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors de l'ouverture du document.");
    }
  };

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

  const handleDeleteFile = async (fileId) => {
    if (!authFetchOk || !fileId) return;

    setError("");
    try {
      const res = await authFetch(`/api/files/${fileId}`, { method: "DELETE" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Impossible de supprimer le document");
      }

      // Optimiste
      setFilesHistory((prev) =>
        Array.isArray(prev)
          ? prev.filter((f) => String(getFileId(f)) !== String(fileId))
          : []
      );
      setTenantDocuments((prev) =>
        Array.isArray(prev)
          ? prev.filter((f) => String(getFileId(f)) !== String(fileId))
          : []
      );

      await fetchFilesHistory();
      if (selectedTenantId) await fetchTenantDetail(selectedTenantId);
      await fetchTenants();
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors de la suppression du document.");
    }
  };

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

      // Optimiste
      setTenantDocuments((prev) =>
        Array.isArray(prev)
          ? prev.filter((f) => String(getFileId(f)) !== String(fileId))
          : []
      );
      setTenantDetail((prev) => {
        if (!prev) return prev;
        const ids = normalizeIds(prev.file_ids).filter(
          (id) => id !== String(fileId)
        );
        return { ...prev, file_ids: ids };
      });

      await Promise.all([fetchTenantDetail(selectedTenantId), fetchTenants()]);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors du retrait du document du dossier.");
    }
  };

  const openConfirmUnlink = (fileId) => {
    setConfirmState({ open: true, mode: "unlink", fileId });
  };

  const openConfirmDelete = (fileId) => {
    setConfirmState({ open: true, mode: "delete", fileId });
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

  useEffect(() => {
    fetchTenants();
    fetchFilesHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authFetchOk]);

  useEffect(() => {
    if (selectedTenantId) fetchTenantDetail(selectedTenantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenantId]);

  // Quand on change de dossier ou qu'on recharge son détail,
  // on met à jour les champs d'édition (email + nom de dossier)
  useEffect(() => {
    if (tenantDetail) {
      setEditingEmail(tenantDetail.candidate_email || "");
      setEditingName(tenantDetail.candidate_name || "");
    } else {
      setEditingEmail("");
      setEditingName("");
    }
  }, [tenantDetail]);

  const linkedFileIds = useMemo(() => {
    return normalizeIds(tenantDetail?.file_ids);
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
  const missingDocs = Array.isArray(checklist?.missing) ? checklist.missing : [];

  // ✅ Statut UI calculé pour le dossier sélectionné
  const uiTenantStatus = useMemo(() => {
    const derived = deriveStatusFromChecklist(checklist);
    return derived || tenantDetail?.status || null;
  }, [checklist, tenantDetail?.status]);

  const linkedFiles = tenantDocuments;

  const unlinkedFiles = useMemo(() => {
    const set = new Set(linkedFileIds);
    return (Array.isArray(filesHistory) ? filesHistory : []).filter(
      (f) => !set.has(String(getFileId(f)))
    );
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
        <div className="tf-warn" style={{ borderColor: "rgba(239,68,68,.45)" }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Erreur</div>
          <div style={{ opacity: 0.95 }}>{error}</div>
        </div>
      )}

      <div className="tf-grid">
        <div className="tf-card">
          <div className="tf-card-title">Locataires</div>

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

                // ✅ si c’est le dossier sélectionné, on affiche le statut UI calculé
                const statusToShow = active ? uiTenantStatus || t.status : t.status;

                return (
                  <button
                    key={t.id}
                    className={`tf-item ${active ? "is-active" : ""}`}
                    onClick={() => setSelectedTenantId(t.id)}
                    type="button"
                  >
                    <div className="tf-item-title">
                      {t.candidate_name || `Dossier #${t.id}`}
                    </div>
                    <div className="tf-item-sub">
                      <span>{t.candidate_email || "-"}</span>
                      {statusToShow && (
                        <span
                          className={`tf-status ${
                            statusToShow === "complete"
                              ? "complete"
                              : statusToShow === "new"
                              ? "new"
                              : "incomplete"
                          }`}
                        >
                          {statusToShow}
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
            <div className="tf-card-title tf-row">
              <span className="tf-row-left">Détails</span>

              {tenantDetail && (
                <button
                  type="button"
                  className="tf-btn tf-btn-danger"
                  onClick={openConfirmDeleteTenant}
                  disabled={deleteTenantLoading}
                >
                  <Trash2 size={16} />
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
                  <div>
                    <div className="tf-k">Email candidat</div>
                    <div className="tf-v">
                      <input
                        type="email"
                        className="tf-input"
                        placeholder="Email candidat (optionnel)"
                        value={editingEmail}
                        onChange={(e) => setEditingEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="tf-k">Statut</div>
                    <div className="tf-v">
                      {uiTenantStatus ? (
                        <span
                          className={`tf-status ${
                            uiTenantStatus === "complete"
                              ? "complete"
                              : uiTenantStatus === "new"
                              ? "new"
                              : "incomplete"
                          }`}
                          title={
                            uiTenantStatus !== tenantDetail.status
                              ? "Statut calculé depuis la checklist (UI)"
                              : "Statut backend"
                          }
                        >
                          {uiTenantStatus}
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

                <div className="tf-kv">
                  <div>
                    <div className="tf-k">Nom du dossier</div>
                    <div className="tf-v">
                      <input
                        type="text"
                        className="tf-input"
                        placeholder="Nom / alias du dossier (optionnel)"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="tf-k">&nbsp;</div>
                    <div className="tf-v">
                      <button
                        type="button"
                        className="tf-btn tf-btn-primary"
                        onClick={handleSaveTenantMeta}
                        disabled={savingMeta}
                      >
                        {savingMeta ? "Enregistrement..." : "Enregistrer"}
                      </button>
                    </div>
                  </div>

                  <div />
                </div>

                {checklist && (
                  <div className="tf-checklist">
                    <div className="tf-checklist-head">
                      <div className="tf-checklist-header">
                        <span>Checklist du dossier</span>{" "}
                        {missingDocs.length > 0 && (
                          <span className="tf-missing-badge">
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
                          <div className="tf-muted">Aucune pièce reçue.</div>
                        ) : (
                          <div className="tf-badges">
                            {receivedDocs.map((d) => (
                              <span className="tf-pill tf-pill-success" key={`rec-${d}`}>
                                ✅ {getDocLabel(d)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="tf-checklist-col">
                        <div className="tf-checklist-col-title">Manquantes</div>
                        {missingDocs.length === 0 ? (
                          <div className="tf-muted">Aucune pièce manquante.</div>
                        ) : (
                          <div className="tf-badges">
                            {missingDocs.map((d) => (
                              <span className="tf-pill tf-pill-danger" key={`mis-${d}`}>
                                ❌ {getDocLabel(d)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
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

                  <label htmlFor="tenant-upload-input" className="tf-btn tf-btn-secondary">
                    {uploadLoading ? "Téléversement..." : "Téléverser un fichier"}
                  </label>

                  <span className="tf-muted">PDF, PNG, JPG – taille max 10 Mo</span>

                  {/* ✅ Badge affiché pendant que le worker RQ analyse le document */}
                  {analysingWorker && (
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 12px",
                      borderRadius: 999,
                      background: "rgba(109,94,248,0.15)",
                      border: "1px solid rgba(109,94,248,0.4)",
                      color: "rgba(167,139,250,1)",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      animation: "pulse 1.6s ease-in-out infinite",
                    }}>
                      ✦ Analyse IA en cours…
                    </span>
                  )}
                </div>

                {unlinkedFiles.length > 0 && (
                  <div className="tf-attach-row" style={{ marginTop: 12 }}>
                    <select
                      className="tf-input"
                      value={selectedFileIdToAttach}
                      onChange={(e) => setSelectedFileIdToAttach(e.target.value)}
                      disabled={!selectedTenantId || filesLoading}
                    >
                      <option value="">Attacher un document existant…</option>
                      {unlinkedFiles.slice(0, 200).map((f) => (
                        <option key={f.id} value={f.id}>
                          #{f.id} — {f.file_type || "Doc"} — {f.filename}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      className="tf-btn tf-btn-primary"
                      onClick={handleAttach}
                      disabled={!selectedFileIdToAttach || attachLoading}
                    >
                      {attachLoading ? "Attachement..." : "Attacher"}
                    </button>
                  </div>
                )}
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
              <div className="tf-muted">Sélectionne un locataire pour voir ses pièces.</div>
            ) : linkedFileIds.length === 0 ? (
              <div className="tf-muted">Aucun document attaché.</div>
            ) : linkedFiles.length === 0 ? (
              <div className="tf-muted">Chargement des documents du dossier...</div>
            ) : (
              // ✅ plus de scroll interne : on ajoute une classe
              <div className="tf-files tf-files-no-scroll">
                {linkedFiles.map((f) => (
                  <div className="tf-file" key={f.id}>
                    <div className="tf-file-main">
                      <div className="tf-file-title">
                        #{f.id} — {f.file_type || "Doc"} — {f.filename}
                      </div>
                      <div className="tf-file-sub">
                        {f.created_at ? new Date(f.created_at).toLocaleString() : ""}
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

      {/* Modal de confirmation pour les fichiers */}
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

      {/* ✅ Nouvelle modal de confirmation pour la suppression de dossier */}
      {confirmTenantDelete.open && (
        <div className="tf-modal-backdrop">
          <div className="tf-modal tf-modal-danger">
            <div className="tf-modal-header">
              Supprimer définitivement ce dossier locataire ?
            </div>

            <div className="tf-modal-body">
              <p>
                Le dossier sera <strong>supprimé</strong> ainsi que ses{" "}
                <strong>liens</strong> avec les documents et emails.
              </p>
              <p>
                Les documents resteront disponibles dans l&apos;historique global des
                fichiers.
              </p>
            </div>

            <div className="tf-modal-actions">
              <button
                type="button"
                className="tf-btn tf-btn-ghost"
                onClick={() => setConfirmTenantDelete({ open: false, tenantId: null })}
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