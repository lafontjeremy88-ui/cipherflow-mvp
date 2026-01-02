import React, { useEffect, useMemo, useState } from "react";
import FileAnalyzer from "./FileAnalyzer";

/**
 * TenantFilesPanel
 * - Garde l'analyse de documents (FileAnalyzer)
 * - Ajoute la gestion des "dossiers locataires" (tenant-files)
 *
 * Requiert :
 * - authFetch(url, options) -> fetch avec Authorization Bearer déjà géré
 * - apiBase (optionnel) -> base URL backend, ex: https://cipherflow-mvp-production.up.railway.app
 *
 * Endpoints utilisés :
 * - GET    /tenant-files
 * - GET    /tenant-files/{tenant_id}
 * - POST   /tenant-files/from-email/{email_id}
 */
export default function TenantFilesPanel({ authFetch, apiBase = "" }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);

  const [loadingList, setLoadingList] = useState(false);
  const [loadingOne, setLoadingOne] = useState(false);
  const [creating, setCreating] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [emailId, setEmailId] = useState("");

  const base = useMemo(() => (apiBase || "").replace(/\/+$/, ""), [apiBase]);

  const safeUrl = (path) => {
    if (!path.startsWith("/")) path = "/" + path;
    return `${base}${path}`;
  };

  const resetMessages = () => {
    setError("");
    setInfo("");
  };

  const fetchList = async () => {
    resetMessages();
    setLoadingList(true);
    try {
      const res = await authFetch(safeUrl("/tenant-files"));
      if (!res.ok) {
        const t = await safeReadText(res);
        throw new Error(t || `Erreur ${res.status} lors du chargement des dossiers`);
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || "Impossible de charger les dossiers.");
    } finally {
      setLoadingList(false);
    }
  };

  const fetchOne = async (tenantId) => {
    resetMessages();
    setLoadingOne(true);
    try {
      const res = await authFetch(safeUrl(`/tenant-files/${tenantId}`));
      if (!res.ok) {
        const t = await safeReadText(res);
        throw new Error(t || `Dossier introuvable (HTTP ${res.status})`);
      }
      const data = await res.json();
      setSelected(data);
    } catch (e) {
      setError(e?.message || "Impossible d’ouvrir ce dossier.");
      setSelected(null);
    } finally {
      setLoadingOne(false);
    }
  };

  const createFromEmail = async () => {
    resetMessages();

    const parsed = Number(emailId);
    if (!emailId || Number.isNaN(parsed) || parsed <= 0) {
      setError("Entre un email_id valide (ex: 7) pour créer/lier un dossier.");
      return;
    }

    setCreating(true);
    try {
      const res = await authFetch(safeUrl(`/tenant-files/from-email/${parsed}`), {
        method: "POST",
      });

      if (!res.ok) {
        const t = await safeReadText(res);
        throw new Error(t || `Erreur ${res.status} lors de la création du dossier`);
      }

      const created = await res.json();
      setInfo("Dossier créé / lié à l’email ✅");
      setEmailId("");

      // refresh list + open created dossier
      await fetchList();
      if (created?.id) {
        await fetchOne(created.id);
      }
    } catch (e) {
      setError(e?.message || "Impossible de créer le dossier depuis cet email.");
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* ✅ 1) Analyse de documents (on garde) */}
      <div>
        <FileAnalyzer authFetch={authFetch} />
      </div>

      {/* ✅ 2) Dossiers locataires */}
      <div
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, color: "white", fontSize: "1.05rem" }}>📁 Dossiers locataires</h2>
            <div style={{ color: "#94a3b8", fontSize: "0.9rem", marginTop: 4 }}>
              Liste des dossiers créés automatiquement à partir des emails.
            </div>
          </div>

          <button
            onClick={fetchList}
            disabled={loadingList}
            style={btnStyle("secondary")}
            title="Rafraîchir la liste"
          >
            {loadingList ? "Chargement..." : "Rafraîchir"}
          </button>
        </div>

        {/* Messages */}
        {(error || info) && (
          <div style={{ marginTop: 12 }}>
            {error && (
              <div style={msgStyle("error")}>
                {error}
              </div>
            )}
            {info && (
              <div style={msgStyle("success")}>
                {info}
              </div>
            )}
          </div>
        )}

        {/* Create from email */}
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "1px dashed #334155",
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ color: "white", fontWeight: 600 }}>Créer / lier un dossier depuis un email_id :</div>

          <input
            value={emailId}
            onChange={(e) => setEmailId(e.target.value)}
            placeholder="ex: 7"
            style={{
              height: 38,
              borderRadius: 10,
              border: "1px solid #334155",
              background: "#0b1220",
              color: "white",
              padding: "0 12px",
              width: 140,
              outline: "none",
            }}
          />

          <button
            onClick={createFromEmail}
            disabled={creating}
            style={btnStyle("primary")}
          >
            {creating ? "Création..." : "Créer/Lier"}
          </button>

          <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
            Astuce : récupère un id depuis <code style={codeStyle}>/email/history</code> dans Swagger.
          </div>
        </div>

        {/* List + details */}
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}>
          {/* left list */}
          <div
            style={{
              border: "1px solid #334155",
              borderRadius: 14,
              padding: 12,
              background: "rgba(15,23,42,0.35)",
              minHeight: 220,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ color: "white", fontWeight: 700 }}>Liste</div>
              <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{items.length} dossier(s)</div>
            </div>

            {loadingList ? (
              <div style={{ color: "#94a3b8" }}>Chargement...</div>
            ) : items.length === 0 ? (
              <div style={{ color: "#94a3b8" }}>
                Aucun dossier pour l’instant. <br />
                Crée-en un via <b>email_id</b> ci-dessus.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {items.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => fetchOne(it.id)}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #334155",
                      background: selected?.id === it.id ? "rgba(99,102,241,0.18)" : "rgba(2,6,23,0.35)",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>
                      #{it.id} — {it.candidate_email || "email inconnu"}
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginTop: 2 }}>
                      Statut: {it.status || "?"} • MAJ: {formatDate(it.updated_at)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* right details */}
          <div
            style={{
              border: "1px solid #334155",
              borderRadius: 14,
              padding: 12,
              background: "rgba(15,23,42,0.35)",
              minHeight: 220,
            }}
          >
            <div style={{ color: "white", fontWeight: 700, marginBottom: 10 }}>Détail</div>

            {loadingOne ? (
              <div style={{ color: "#94a3b8" }}>Ouverture du dossier...</div>
            ) : !selected ? (
              <div style={{ color: "#94a3b8" }}>
                Sélectionne un dossier à gauche pour voir le détail.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={kvRow()}>
                  <div style={kStyle}>ID</div>
                  <div style={vStyle}>{selected.id}</div>
                </div>

                <div style={kvRow()}>
                  <div style={kStyle}>Email</div>
                  <div style={vStyle}>{selected.candidate_email || "—"}</div>
                </div>

                <div style={kvRow()}>
                  <div style={kStyle}>Nom</div>
                  <div style={vStyle}>{selected.candidate_name || "—"}</div>
                </div>

                <div style={kvRow()}>
                  <div style={kStyle}>Statut</div>
                  <div style={vStyle}>{selected.status || "—"}</div>
                </div>

                <div style={kvRow()}>
                  <div style={kStyle}>Emails liés</div>
                  <div style={vStyle}>
                    {Array.isArray(selected.email_ids) && selected.email_ids.length > 0
                      ? selected.email_ids.join(", ")
                      : "—"}
                  </div>
                </div>

                <div style={kvRow()}>
                  <div style={kStyle}>Fichiers liés</div>
                  <div style={vStyle}>
                    {Array.isArray(selected.file_ids) && selected.file_ids.length > 0
                      ? selected.file_ids.join(", ")
                      : "—"}
                  </div>
                </div>

                <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginTop: 8 }}>
                  Créé: {formatDate(selected.created_at)} • MAJ: {formatDate(selected.updated_at)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

async function safeReadText(res) {
  try {
    const txt = await res.text();
    return txt;
  } catch {
    return "";
  }
}

function formatDate(value) {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  } catch {
    return String(value);
  }
}

function btnStyle(variant) {
  const base = {
    height: 38,
    padding: "0 14px",
    borderRadius: 10,
    border: "1px solid #334155",
    cursor: "pointer",
    fontWeight: 700,
  };

  if (variant === "primary") {
    return {
      ...base,
      background: "#6366f1",
      color: "white",
      borderColor: "rgba(99,102,241,0.6)",
    };
  }

  return {
    ...base,
    background: "rgba(99,102,241,0.12)",
    color: "#c7d2fe",
  };
}

function msgStyle(type) {
  if (type === "success") {
    return {
      background: "rgba(16,185,129,0.16)",
      border: "1px solid rgba(16,185,129,0.35)",
      color: "#34d399",
      padding: "10px 12px",
      borderRadius: 10,
      marginBottom: 10,
    };
  }
  return {
    background: "rgba(239,68,68,0.16)",
    border: "1px solid rgba(239,68,68,0.35)",
    color: "#f87171",
    padding: "10px 12px",
    borderRadius: 10,
    marginBottom: 10,
  };
}

const kStyle = { color: "#94a3b8", width: 110, flex: "0 0 110px" };
const vStyle = { color: "white", fontWeight: 600 };
const codeStyle = { background: "rgba(2,6,23,0.45)", padding: "2px 6px", borderRadius: 6 };
const kvRow = () => ({ display: "flex", gap: 10, alignItems: "baseline" });
