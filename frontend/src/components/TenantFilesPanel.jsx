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
  const normalized = (code || "").toLowerCase();
  return DOC_LABELS[normalized] || normalized;
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
  const [exportLoading, setExportLoading] = useState(false);

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

  const handleExportZip = async () => {
    if (!authFetchOk || !selectedTenantId) return;
    setError("");
    setExportLoading(true);
    try {
      const res = await authFetch(`/tenant-files/${selectedTenantId}/export`);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Impossible de générer l'export");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const candidate = tenantDetail?.candidate_name || tenantDetail?.candidate_email || `dossier_${selectedTenantId}`;
      const safeName = candidate.replace(/[^a-zA-Z0-9_-]/g, "_");
      const a = document.createElement("a");
      a.href = url;
      a.download = `dossier_${safeName}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Erreur lors de l'export du dossier.");
    } finally {
      setExportLoading(false);
    }
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

  const btnGhost = "inline-flex items-center gap-2 px-3 py-2 bg-white border border-surface-border rounded-lg text-sm text-ink-secondary font-medium hover:bg-surface-muted transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
  const btnPrimary = "inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
  const btnSecondary = "inline-flex items-center gap-2 px-3 py-2 bg-white border border-surface-border rounded-lg text-sm font-medium text-ink-secondary hover:bg-surface-muted transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
  const btnDanger = "inline-flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
  const inputCls = "w-full px-3 py-2 bg-white border border-surface-border rounded-lg text-sm text-ink placeholder-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600 transition-all duration-200";

  if (!authFetchOk) {
    return (
      <div className="max-w-[1400px] mx-auto">
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
          <strong>Erreur de configuration :</strong> <code>authFetch</code> n’a pas été passé à <code>&lt;TenantFilesPanel /&gt;</code>.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-16">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <FolderOpen size={20} className="text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-ink">Dossiers locataires</h2>
          </div>
          <p className="text-sm text-ink-secondary ml-12">Centralise les fichiers et rattache les documents aux locataires.</p>
        </div>

        <div className="flex items-center gap-3">
          <button className={btnGhost} onClick={fetchTenants} disabled={tenantsLoading}>
            <RefreshCw size={15} />
            {tenantsLoading ? "Chargement..." : "Rafraîchir"}
          </button>
        </div>
      </div>

      {!!error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {/* Grid principal */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">

        {/* Colonne gauche — liste des locataires */}
        <div className="bg-white border border-surface-border rounded-xl shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-border text-sm font-semibold text-ink">
            Locataires
          </div>

          {/* Créer un dossier */}
          <div className="flex gap-2 p-4 border-b border-surface-border">
            <input
              type="email"
              className={inputCls}
              placeholder="Email candidat (optionnel)"
              value={newTenantEmail}
              onChange={(e) => setNewTenantEmail(e.target.value)}
            />
            <button type="button" className={btnPrimary} onClick={handleCreateTenant} disabled={creatingTenant}>
              {creatingTenant ? "..." : "+ Nouveau"}
            </button>
          </div>

          {/* Liste */}
          {tenantsLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-ink-tertiary">Chargement…</div>
          ) : tenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center p-4">
              <FolderOpen size={40} className="text-surface-border mb-3" />
              <p className="text-sm font-medium text-ink">Aucun dossier créé</p>
              <p className="text-xs text-ink-tertiary mt-1">Créez votre premier dossier ci-dessus</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {tenants.map((t) => {
                const active = String(selectedTenantId) === String(t.id);
                const statusToShow = active ? uiTenantStatus || t.status : t.status;
                const statusCls =
                  statusToShow === "complete"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : statusToShow === "new"
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200";

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTenantId(t.id)}
                    className={[
                      "w-full flex flex-col gap-1 px-4 py-3 text-left transition-colors duration-150",
                      active ? "bg-primary-50" : "hover:bg-surface-bg",
                    ].join(" ")}
                  >
                    <span className={`text-sm font-medium ${active ? "text-primary-700" : "text-ink"}`}>
                      {t.candidate_name || `Dossier #${t.id}`}
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-ink-tertiary truncate">{t.candidate_email || "—"}</span>
                      {statusToShow && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase flex-shrink-0 ${statusCls}`}>
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

        {/* Colonne droite */}
        <div className="space-y-4">

          {/* Card Détails */}
          <div className="bg-white border border-surface-border rounded-xl shadow-card">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
              <h3 className="text-sm font-semibold text-ink">Détails du dossier</h3>
              {tenantDetail && (
                <div className="flex items-center gap-2">
                  <button type="button" className={btnGhost} onClick={handleExportZip} disabled={exportLoading}>
                    <Download size={15} />
                    {exportLoading ? "Export..." : "Exporter"}
                  </button>
                  <button type="button" className={btnDanger} onClick={openConfirmDeleteTenant} disabled={deleteTenantLoading}>
                    <Trash2 size={15} />
                    {deleteTenantLoading ? "Suppression..." : "Supprimer"}
                  </button>
                </div>
              )}
            </div>

            {tenantLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-ink-tertiary">Chargement…</div>
            ) : !tenantDetail ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <FileText size={40} className="text-surface-border mb-3" />
                <p className="text-sm font-medium text-ink">Aucun dossier sélectionné</p>
                <p className="text-xs text-ink-tertiary mt-1">Sélectionne un locataire dans la liste</p>
              </div>
            ) : (
              <>
                {/* Champs d’édition */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-6 py-5">
                  <div>
                    <p className="text-xs text-ink-tertiary uppercase tracking-wide mb-1.5">Email candidat</p>
                    <input
                      type="email"
                      className={inputCls}
                      placeholder="Email candidat (optionnel)"
                      value={editingEmail}
                      onChange={(e) => setEditingEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <p className="text-xs text-ink-tertiary uppercase tracking-wide mb-1.5">Nom du dossier</p>
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="Nom / alias (optionnel)"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col justify-end">
                    <button type="button" className={btnPrimary} onClick={handleSaveTenantMeta} disabled={savingMeta}>
                      {savingMeta ? "Enregistrement..." : "Enregistrer"}
                    </button>
                  </div>
                </div>

                {/* Statut + docs liés */}
                <div className="flex items-center gap-6 px-6 pb-5 border-b border-surface-border">
                  <div>
                    <p className="text-xs text-ink-tertiary uppercase tracking-wide mb-1">Statut</p>
                    {uiTenantStatus ? (
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold uppercase ${
                        uiTenantStatus === "complete"
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : uiTenantStatus === "new"
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}>
                        {uiTenantStatus}
                      </span>
                    ) : <span className="text-sm text-ink-tertiary">—</span>}
                  </div>
                  <div>
                    <p className="text-xs text-ink-tertiary uppercase tracking-wide mb-1">Documents liés</p>
                    <span className="text-sm font-semibold text-ink">{linkedFileIds.length}</span>
                  </div>
                </div>

                {/* Checklist */}
                {checklist && (
                  <div className="px-6 py-5 border-b border-surface-border">
                    <div className="flex items-center gap-2 mb-4">
                      <p className="text-sm font-semibold text-ink">Checklist du dossier</p>
                      {missingDocs.length > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-50 text-red-600 border border-red-200">
                          {missingDocs.length} manquante{missingDocs.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-ink-tertiary uppercase tracking-wide mb-2">Reçues</p>
                        {receivedDocs.length === 0 ? (
                          <p className="text-xs text-ink-tertiary">Aucune pièce reçue.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {receivedDocs.map((d) => (
                              <span key={`rec-${d}`} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                {getDocLabel(d)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-ink-tertiary uppercase tracking-wide mb-2">Manquantes</p>
                        {missingDocs.length === 0 ? (
                          <p className="text-xs text-ink-tertiary">Aucune pièce manquante.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {missingDocs.map((d) => (
                              <span key={`mis-${d}`} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                                {getDocLabel(d)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Upload + attacher */}
                <div className="flex flex-wrap items-center gap-3 px-6 py-4">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleUploadForTenant}
                    disabled={!selectedTenantId || uploadLoading || !authFetchOk}
                    className="hidden"
                    id="tenant-upload-input"
                  />
                  <label htmlFor="tenant-upload-input" className={btnSecondary}>
                    {uploadLoading ? "Téléversement..." : "Téléverser un fichier"}
                  </label>
                  <span className="text-xs text-ink-tertiary">PDF, PNG, JPG – max 10 Mo</span>
                  {analysingWorker && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 animate-pulse">
                      Analyse IA en cours…
                    </span>
                  )}
                </div>

                {unlinkedFiles.length > 0 && (
                  <div className="flex items-center gap-2 px-6 pb-5">
                    <select
                      className={inputCls}
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
                    <button type="button" className={btnPrimary} onClick={handleAttach} disabled={!selectedFileIdToAttach || attachLoading}>
                      {attachLoading ? "..." : "Attacher"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Card Pièces du dossier */}
          <div className="bg-white border border-surface-border rounded-xl shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-ink-tertiary" />
                <h3 className="text-sm font-semibold text-ink">Pièces du dossier</h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-50 text-primary-600">
                {linkedFiles.length}
              </span>
            </div>

            {!tenantDetail ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <FileText size={36} className="text-surface-border mb-3" />
                <p className="text-sm text-ink-tertiary">Sélectionne un locataire pour voir ses pièces.</p>
              </div>
            ) : linkedFileIds.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <FileText size={36} className="text-surface-border mb-3" />
                <p className="text-sm font-medium text-ink">Aucun document attaché</p>
                <p className="text-xs text-ink-tertiary mt-1">Téléversez ou attachez un document ci-dessus</p>
              </div>
            ) : linkedFiles.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-sm text-ink-tertiary">Chargement des documents…</div>
            ) : (
              <div className="divide-y divide-surface-border">
                {linkedFiles.map((f) => (
                  <div key={f.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 hover:bg-surface-bg transition-colors duration-150">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">
                        {f.file_type || "Document"} — {f.filename}
                      </p>
                      <p className="text-xs text-ink-tertiary mt-0.5">
                        {f.created_at ? new Date(f.created_at).toLocaleString() : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                      <button type="button" className={btnGhost} onClick={() => handleViewFile(f.id)}>
                        <Eye size={14} /> Voir
                      </button>
                      <button type="button" className={btnGhost} onClick={() => handleDownloadFile(f)}>
                        <Download size={14} /> Télécharger
                      </button>
                      <button type="button" className={btnGhost} onClick={() => openConfirmUnlink(f.id)}>
                        <Link2 size={14} /> Retirer
                      </button>
                      <button type="button" className={btnDanger} onClick={() => openConfirmDelete(f.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal — fichiers */}
      {confirmState.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-base font-semibold text-ink mb-2">
              {confirmState.mode === "delete" ? "Supprimer définitivement le document ?" : "Retirer le document du dossier ?"}
            </h3>
            <p className="text-sm text-ink-secondary mb-6">
              {confirmState.mode === "delete" ? (
                <>Ce document sera <strong>supprimé définitivement</strong> (irréversible).</>
              ) : (
                <>Le document sera <strong>retiré de ce dossier</strong> mais restera dans l’historique.</>
              )}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button type="button" className={btnGhost} onClick={handleConfirmCancel}>Annuler</button>
              <button
                type="button"
                className={confirmState.mode === "delete" ? btnDanger : btnPrimary}
                onClick={handleConfirmValidate}
              >
                {confirmState.mode === "delete" ? "Supprimer définitivement" : "Retirer du dossier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — supprimer dossier */}
      {confirmTenantDelete.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-base font-semibold text-ink mb-2">Supprimer définitivement ce dossier locataire ?</h3>
            <div className="text-sm text-ink-secondary mb-6 space-y-2">
              <p>Le dossier sera <strong>supprimé</strong> ainsi que ses <strong>liens</strong> avec les documents et emails.</p>
              <p>Les documents resteront disponibles dans l’historique global des fichiers.</p>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                className={btnGhost}
                onClick={() => setConfirmTenantDelete({ open: false, tenantId: null })}
                disabled={deleteTenantLoading}
              >
                Annuler
              </button>
              <button type="button" className={btnDanger} onClick={handleDeleteTenant} disabled={deleteTenantLoading}>
                {deleteTenantLoading ? "Suppression..." : "Supprimer le dossier"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}