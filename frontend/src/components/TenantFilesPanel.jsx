import React, { useEffect, useMemo, useState } from "react";

/**
 * TenantFilesPanel
 * - Liste des dossiers locataires (tenant-files)
 * - Création / liaison d'un dossier à partir d'un email_id (POST /tenant-files/from-email/{email_id})
 * - Affichage du détail du dossier sélectionné
 *
 * Props:
 * - authFetch: (url, options) => fetch avec Authorization Bearer + gestion 401
 * - apiBase: string (ex: https://cipherflow-mvp-production.up.railway.app)
 */
export default function TenantFilesPanel({ authFetch, apiBase }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [tenantFiles, setTenantFiles] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState(null);
  const selectedTenant = useMemo(
    () => tenantFiles.find((t) => t.id === selectedTenantId) || null,
    [tenantFiles, selectedTenantId]
  );

  // Emails (pour créer/lier un dossier)
  const [emails, setEmails] = useState([]);
  const [emailLoading, setEmailLoading] = useState(false);
  const [selectedEmailId, setSelectedEmailId] = useState("");

  // Détail d’un dossier (plus fiable que la liste si tu veux des champs complets)
  const [tenantDetail, setTenantDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const safeApiBase = apiBase?.replace(/\/$/, "");

  const fetchTenantFiles = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await authFetch(`${safeApiBase}/tenant-files`, { method: "GET" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Erreur API tenant-files (${res.status}) ${txt}`);
      }
      const data = await res.json();
      setTenantFiles(Array.isArray(data) ? data : []);
      // auto-select le 1er si rien sélectionné
      if (!selectedTenantId && Array.isArray(data) && data.length > 0) {
        setSelectedTenantId(data[0].id);
      }
    } catch (e) {
      setError(e?.message || "Erreur lors du chargement des dossiers.");
    } finally {
      setLoading(false);
    }
  };

  const fetchEmails = async () => {
    setEmailLoading(true);
    try {
      // Endpoint vu dans ton swagger: GET /email/history
      const res = await authFetch(`${safeApiBase}/email/history`, { method: "GET" });
      if (!res.ok) {
        // Si ton backend a un autre endpoint, tu verras l’erreur ici
        const txt = await res.text().catch(() => "");
        throw new Error(`Erreur API email/history (${res.status}) ${txt}`);
      }
      const data = await res.json();
      setEmails(Array.isArray(data) ? data : []);
      if (!selectedEmailId && Array.isArray(data) && data.length > 0) {
        setSelectedEmailId(String(data[0].id));
      }
    } catch (e) {
      // On ne bloque pas l’écran si email/history n’est pas dispo
      console.error(e);
      setEmails([]);
    } finally {
      setEmailLoading(false);
    }
  };

  const fetchTenantDetail = async (tenantId) => {
    if (!tenantId) return;
    setDetailLoading(true);
    setTenantDetail(null);
    setError("");
    try {
      const res = await authFetch(`${safeApiBase}/tenant-files/${tenantId}`, { method: "GET" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Erreur API tenant-files/${tenantId} (${res.status}) ${txt}`);
      }
      const data = await res.json();
      setTenantDetail(data);
    } catch (e) {
      setError(e?.message || "Erreur lors du chargement du dossier.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreateFromEmail = async () => {
    setError("");
    const emailIdNum = Number(selectedEmailId);
    if (!emailIdNum || Number.isNaN(emailIdNum)) {
      setError("Choisis un email valide (email_id).");
      return;
    }

    setLoading(true);
    try {
      // Endpoint vu dans ton swagger: POST /tenant-files/from-email/{email_id}
      const res = await authFetch(`${safeApiBase}/tenant-files/from-email/${emailIdNum}`, {
        method: "POST",
        body: JSON.stringify({}), // body vide côté backend OK (mais on garde JSON pour certains middlewares)
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Création dossier échouée (${res.status}) ${txt}`);
      }

      const created = await res.json(); // devrait renvoyer {id, candidate_email, email_ids, ...}
      // Refresh liste + sélection
      await fetchTenantFiles();
      if (created?.id) {
        setSelectedTenantId(created.id);
        await fetchTenantDetail(created.id);
      }
    } catch (e) {
      setError(e?.message || "Erreur lors de la création du dossier.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!safeApiBase) return;
    fetchTenantFiles();
    fetchEmails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeApiBase]);

  useEffect(() => {
    if (selectedTenantId) {
      fetchTenantDetail(selectedTenantId);
    } else {
      setTenantDetail(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenantId]);

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: "16px" }}>
      {/* Colonne gauche: Liste + création */}
      <div className="card" style={{ height: "fit-content" }}>
        <h2 style={{ marginBottom: "10px" }}>📁 Dossiers locataires</h2>

        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <button
            className="btn btn-primary"
            onClick={fetchTenantFiles}
            disabled={loading}
            style={{ width: "100%" }}
          >
            {loading ? "Chargement..." : "Rafraîchir"}
          </button>
        </div>

        <div style={{ borderTop: "1px solid rgba(148,163,184,0.15)", paddingTop: "12px" }}>
          <h3 style={{ margin: "0 0 8px 0" }}>Créer / lier depuis un email</h3>

          <label style={{ display: "block", fontSize: "0.9rem", color: "#94a3b8" }}>
            email_id (depuis l’historique)
          </label>

          <select
            value={selectedEmailId}
            onChange={(e) => setSelectedEmailId(e.target.value)}
            style={{ width: "100%", marginTop: "6px", padding: "10px", borderRadius: "8px" }}
            disabled={emailLoading || emails.length === 0}
          >
            {emails.length === 0 ? (
              <option value="">(Aucun email trouvé)</option>
            ) : (
              emails.slice(0, 50).map((em) => (
                <option key={em.id} value={String(em.id)}>
                  #{em.id} — {em.sender_email || "?"} — {em.subject || "(sans sujet)"}
                </option>
              ))
            )}
          </select>

          <button
            className="btn btn-success"
            onClick={handleCreateFromEmail}
            disabled={loading || !selectedEmailId}
            style={{ width: "100%", marginTop: "10px" }}
          >
            Créer / Lier le dossier
          </button>

          <p style={{ marginTop: "10px", color: "#94a3b8", fontSize: "0.85rem" }}>
            Ça appelle: <code>/tenant-files/from-email/{`{email_id}`}</code>
          </p>
        </div>

        <div style={{ marginTop: "14px" }}>
          <h3 style={{ marginBottom: "8px" }}>Liste</h3>

          {loading && tenantFiles.length === 0 ? (
            <div style={{ color: "#94a3b8" }}>Chargement...</div>
          ) : tenantFiles.length === 0 ? (
            <div style={{ color: "#94a3b8" }}>Aucun dossier pour l’instant.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {tenantFiles.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTenantId(t.id)}
                  style={{
                    textAlign: "left",
                    borderRadius: "10px",
                    padding: "10px",
                    cursor: "pointer",
                    border:
                      selectedTenantId === t.id
                        ? "1px solid rgba(99,102,241,0.7)"
                        : "1px solid rgba(148,163,184,0.15)",
                    background:
                      selectedTenantId === t.id
                        ? "rgba(99,102,241,0.08)"
                        : "rgba(15,23,42,0.3)",
                    color: "white",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    Dossier #{t.id} — {t.status || "?"}
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "#94a3b8" }}>
                    {t.candidate_email || "(email inconnu)"}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                    {formatDate(t.created_at)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div
            style={{
              marginTop: "12px",
              background: "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.35)",
              padding: "10px",
              borderRadius: "10px",
              color: "#f87171",
              fontSize: "0.95rem",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Colonne droite: Détail */}
      <div className="card">
        <h2 style={{ marginBottom: "10px" }}>🧾 Détail du dossier</h2>

        {!selectedTenant && !tenantDetail ? (
          <div style={{ color: "#94a3b8" }}>Sélectionne un dossier à gauche.</div>
        ) : detailLoading ? (
          <div style={{ color: "#94a3b8" }}>Chargement du dossier...</div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "10px" }}>
              <div style={{ color: "#94a3b8" }}>ID</div>
              <div style={{ fontWeight: 700 }}>#{tenantDetail?.id ?? selectedTenant?.id}</div>

              <div style={{ color: "#94a3b8" }}>Statut</div>
              <div>{tenantDetail?.status ?? selectedTenant?.status ?? "-"}</div>

              <div style={{ color: "#94a3b8" }}>Email candidat</div>
              <div>{tenantDetail?.candidate_email ?? selectedTenant?.candidate_email ?? "-"}</div>

              <div style={{ color: "#94a3b8" }}>Nom candidat</div>
              <div>{tenantDetail?.candidate_name ?? "-"}</div>

              <div style={{ color: "#94a3b8" }}>Créé le</div>
              <div>{formatDate(tenantDetail?.created_at ?? selectedTenant?.created_at)}</div>

              <div style={{ color: "#94a3b8" }}>Emails liés</div>
              <div>
                {Array.isArray(tenantDetail?.email_ids) && tenantDetail.email_ids.length > 0
                  ? tenantDetail.email_ids.join(", ")
                  : "(aucun)"}
              </div>

              <div style={{ color: "#94a3b8" }}>Fichiers liés</div>
              <div>
                {Array.isArray(tenantDetail?.file_ids) && tenantDetail.file_ids.length > 0
                  ? tenantDetail.file_ids.join(", ")
                  : "(aucun)"}
              </div>
            </div>

            <div style={{ marginTop: "12px", color: "#94a3b8", fontSize: "0.9rem" }}>
              Ensuite (prochaine étape), on ajoutera l’upload de pièces justificatives vers ce dossier.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
