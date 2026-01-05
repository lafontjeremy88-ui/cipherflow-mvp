import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authFetch } from "../services/api";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

function normalizeCategory(cat) {
  if (!cat) return "Autre";
  const c = String(cat).trim();
  return c ? c : "Autre";
}

function extractEmailsArray(payload) {
  // Backend peut renvoyer plusieurs formats selon versions
  if (Array.isArray(payload)) return payload;

  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.emails)) return payload.emails;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.results)) return payload.results;
  }
  return [];
}

export default function EmailHistory() {
  const navigate = useNavigate();
  const query = useQuery();

  const emailIdFromUrl = query.get("emailId");
  const categoryFromUrl = query.get("category");
  const urgencyFromUrl = query.get("urgency");
  const qFromUrl = query.get("q");

  const [emails, setEmails] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const listRef = useRef(null);
  const itemRefs = useRef({});

  async function loadHistory() {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await authFetch("/email/history");
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${t}`);
      }
      const data = await res.json();
      const arr = extractEmailsArray(data);

      // sécurité: on force un tableau d'objets
      setEmails(Array.isArray(arr) ? arr : []);
    } catch (e) {
      console.error("Erreur historique:", e);
      setEmails([]);
      setErrorMsg("Impossible de charger l'historique (API /email/history).");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tri récent -> ancien (sur base de created_at si dispo)
  const sortedEmails = useMemo(() => {
    const arr = [...emails];
    arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return arr;
  }, [emails]);

  /**
   * IMPORTANT :
   * Si on arrive avec emailId=..., on désactive les filtres (category/urgency/q)
   * pour éviter d’avoir une liste vide alors que l’email existe.
   */
  const filteredEmails = useMemo(() => {
    // deep-link prioritaire
    if (emailIdFromUrl) return sortedEmails;

    let arr = [...sortedEmails];

    if (categoryFromUrl) {
      arr = arr.filter((e) => normalizeCategory(e.category) === categoryFromUrl);
    }

    if (urgencyFromUrl) {
      const target = urgencyFromUrl.toLowerCase();
      arr = arr.filter((e) =>
        String(e.urgency || "").toLowerCase().includes(target)
      );
    }

    if (qFromUrl) {
      const q = qFromUrl.toLowerCase();
      arr = arr.filter((e) => {
        const s = `${e.subject || ""} ${e.sender_email || ""}`.toLowerCase();
        return s.includes(q);
      });
    }

    return arr;
  }, [sortedEmails, emailIdFromUrl, categoryFromUrl, urgencyFromUrl, qFromUrl]);

  // Sélection auto depuis URL emailId
  useEffect(() => {
    if (!emailIdFromUrl) return;

    const exists = sortedEmails.find((e) => String(e.id) === String(emailIdFromUrl));
    if (exists) {
      setSelectedId(exists.id);
      setTimeout(() => {
        const node = itemRefs.current[exists.id];
        if (node?.scrollIntoView) node.scrollIntoView({ block: "center" });
      }, 80);
    } else {
      // si l’emailId n’existe pas (ou pas encore chargé), on ne force pas
      // (ça se rejouera quand sortedEmails changera)
    }
  }, [emailIdFromUrl, sortedEmails]);

  // Auto-select du premier email quand rien n’est sélectionné
  useEffect(() => {
    if (loading) return;
    if (selectedId != null) return;
    if (emailIdFromUrl) return; // si deep-link, on attend l'effet au-dessus
    if (filteredEmails.length > 0) {
      setSelectedId(filteredEmails[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filteredEmails]);

  const selectedEmail = useMemo(() => {
    return sortedEmails.find((e) => String(e.id) === String(selectedId)) || null;
  }, [sortedEmails, selectedId]);

  function buildSearchWithEmailId(id) {
    // conserve les filtres existants, mais met/replace emailId
    const params = new URLSearchParams();
    if (categoryFromUrl) params.set("category", categoryFromUrl);
    if (urgencyFromUrl) params.set("urgency", urgencyFromUrl);
    if (qFromUrl) params.set("q", qFromUrl);
    params.set("emailId", String(id));
    return params.toString();
  }

  function onSelect(email) {
    setSelectedId(email.id);
    navigate(`/history?${buildSearchWithEmailId(email.id)}`);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Historique</h1>
        <p className="muted">Retrouve et ouvre rapidement tes emails analysés.</p>
      </div>

      <div className="history-grid">
        {/* LISTE */}
        <div className="card history-left" ref={listRef}>
          <div className="history-toolbar">
            <button className="btn" onClick={loadHistory} type="button">
              Rafraîchir
            </button>

            <div className="muted" style={{ marginLeft: "auto" }}>
              {loading ? "Chargement..." : `${filteredEmails.length} email(s)`}
            </div>
          </div>

          {errorMsg ? (
            <div className="muted" style={{ padding: 12 }}>
              {errorMsg}
            </div>
          ) : loading ? (
            <div className="muted" style={{ padding: 12 }}>
              Chargement...
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="muted" style={{ padding: 12 }}>
              Aucun email ne correspond à vos critères.
            </div>
          ) : (
            <div className="history-list">
              {filteredEmails.map((email) => (
                <button
                  key={email.id}
                  ref={(el) => (itemRefs.current[email.id] = el)}
                  className={`history-item ${
                    String(selectedId) === String(email.id) ? "active" : ""
                  }`}
                  onClick={() => onSelect(email)}
                  type="button"
                >
                  <div className="history-subject">
                    {email.subject || "(Sans sujet)"}
                  </div>
                  <div className="history-meta">
                    {normalizeCategory(email.category)} • {email.sender_email || ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* DETAIL */}
        <div className="card history-right">
          {!selectedEmail ? (
            <div className="muted" style={{ padding: 12 }}>
              Sélectionne un email dans la liste.
            </div>
          ) : (
            <div className="email-detail">
              <div className="email-detail-head">
                <div className="email-detail-title">
                  {selectedEmail.subject || "(Sans sujet)"}
                </div>
                <div className="email-detail-meta">
                  {selectedEmail.sender_email || ""} •{" "}
                  {normalizeCategory(selectedEmail.category)} •{" "}
                  {selectedEmail.urgency || ""}
                </div>
              </div>

              <div className="email-detail-body">
                <h4>Réponse suggérée</h4>
                <div className="email-detail-box">
                  {selectedEmail.suggested_response_text ||
                    "Aucune réponse suggérée."}
                </div>

                {/* (Optionnel) Bouton pratique : si tu as une page /emails pour traiter un email */}
                {/* <div style={{ marginTop: 12 }}>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => navigate(`/emails?emailId=${encodeURIComponent(selectedEmail.id)}`)}
                  >
                    Ouvrir dans Traitement Email
                  </button>
                </div> */}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
