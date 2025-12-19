import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../services/api";
import { Mail, ArrowLeft, X, Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * EmailHistory
 * - Liste l’historique
 * - Affiche le détail d’un email
 * - Affiche la "réponse IA" si elle existe
 * - Bouton "Envoyer" si pas encore envoyé
 */
const EmailHistory = ({ initialId }) => {
  const [history, setHistory] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loading, setLoading] = useState(true);

  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState(null); // {type:"success"|"error", text:"..."}

  // ---- Helpers pour être compatible avec différents noms de champs backend ----
  const getReplyText = (email) => {
    if (!email) return "";
    return (
      email.reply ||
      email.ai_reply ||
      email.generated_reply ||
      email.response ||
      email.draft_reply ||
      ""
    );
  };

  const getSendStatus = (email) => {
    if (!email) return "unknown";
    // On accepte plusieurs formes : "sent", true/false, etc.
    if (email.send_status) return String(email.send_status);
    if (typeof email.sent === "boolean") return email.sent ? "sent" : "not_sent";
    if (typeof email.is_sent === "boolean") return email.is_sent ? "sent" : "not_sent";
    return "not_sent"; // par défaut : pas envoyé
  };

  const isSent = (email) => getSendStatus(email).toLowerCase() === "sent";

  // On évite d'envoyer si on n'a pas de reply
  const canSend = useMemo(() => {
    if (!selectedEmail) return false;
    if (isSent(selectedEmail)) return false;
    const reply = getReplyText(selectedEmail);
    if (!reply || reply.trim().length === 0) return false;
    // On a besoin d'une adresse destination : on prend from_email par défaut
    const to = selectedEmail.from_email || "";
    if (!to.trim()) return false;
    return true;
  }, [selectedEmail]);

  // ---- Chargement de l'historique ----
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await apiFetch("/email/history");
        if (res?.ok) {
          const data = await res.json();
          setHistory(data || []);

          if (initialId) {
            const found = (data || []).find((item) => item.id === initialId);
            if (found) setSelectedEmail(found);
          }
        } else {
          console.error("Erreur /email/history", res?.status);
        }
      } catch (e) {
        console.error("Erreur history", e);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [initialId]);

  // ---- Envoi de la réponse depuis l'historique ----
  const handleSend = async () => {
    if (!selectedEmail) return;

    setSending(true);
    setSendMessage(null);

    try {
      const to_email = selectedEmail.from_email;
      const subjectBase = selectedEmail.subject || "";
      const subject = subjectBase.toLowerCase().startsWith("re:")
        ? subjectBase
        : `Re: ${subjectBase}`.trim();
      const body = getReplyText(selectedEmail);

      // IMPORTANT : on utilise /email/send (endpoint existant dans ton backend)
      const res = await apiFetch("/email/send", {
        method: "POST",
        body: JSON.stringify({
          to_email,
          subject,
          body,
        }),
      });

      if (!res || !res.ok) {
        const text = res ? await res.text() : "";
        throw new Error(text || "Erreur lors de l’envoi");
      }

      // ✅ OK : on met à jour l'UI localement
      setSendMessage({ type: "success", text: "✅ Email envoyé !" });

      // Marque comme "sent" côté front (même si le backend ne renvoie rien)
      const updated = { ...selectedEmail, send_status: "sent", sent: true, is_sent: true };
      setSelectedEmail(updated);

      setHistory((prev) =>
        prev.map((h) => (h.id === updated.id ? { ...h, ...updated } : h))
      );
    } catch (e) {
      console.error(e);
      setSendMessage({ type: "error", text: e.message || "Erreur inconnue" });
    } finally {
      setSending(false);
    }
  };

  // ---- UI ----
  if (loading) return <div style={{ padding: 20 }}>Chargement...</div>;

  const cardStyle = {
    background: "#111827",
    padding: 16,
    borderRadius: 12,
  };

  const listButtonStyle = {
    background: "#1f2937",
    color: "white",
    border: "none",
    padding: 12,
    borderRadius: 10,
    cursor: "pointer",
    textAlign: "left",
  };

  const badgeStyle = (sent) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    background: sent ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
    color: sent ? "#34d399" : "#fbbf24",
    border: sent ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(245,158,11,0.25)",
  });

  return (
    <div style={{ padding: 20, color: "white" }}>
      <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <Mail size={20} />
        Historique Emails
      </h2>

      {!selectedEmail ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {history.length === 0 && (
            <div style={{ opacity: 0.8 }}>Aucun email dans l’historique.</div>
          )}

          {history.map((item) => {
            const sent = isSent(item);
            return (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedEmail(item);
                  setSendMessage(null);
                }}
                style={listButtonStyle}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 800, flex: 1 }}>
                    {item.subject || "Sans sujet"}
                  </div>
                  <div style={badgeStyle(sent)}>
                    {sent ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {sent ? "Envoyé" : "À envoyer"}
                  </div>
                </div>

                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                  {item.from_email || ""}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {item.created_at || ""}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div style={cardStyle}>
          <button
            onClick={() => {
              setSelectedEmail(null);
              setSendMessage(null);
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "white",
              cursor: "pointer",
              marginBottom: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ArrowLeft size={18} /> Retour
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>
                {selectedEmail.subject || "Sans sujet"}
              </h3>
              <div style={{ opacity: 0.8, marginTop: 6 }}>
                {selectedEmail.from_email || ""}
              </div>
            </div>

            <div style={badgeStyle(isSent(selectedEmail))}>
              {isSent(selectedEmail) ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {isSent(selectedEmail) ? "Envoyé" : "À envoyer"}
            </div>
          </div>

          {/* Corps email */}
          <div style={{ marginTop: 14, whiteSpace: "pre-wrap", opacity: 0.9 }}>
            {selectedEmail.body || selectedEmail.snippet || ""}
          </div>

          {/* Réponse IA proposée */}
          <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: "#0b1220", border: "1px solid rgba(148,163,184,0.15)" }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Réponse proposée (IA)</div>

            {getReplyText(selectedEmail) ? (
              <div style={{ whiteSpace: "pre-wrap", opacity: 0.95 }}>
                {getReplyText(selectedEmail)}
              </div>
            ) : (
              <div style={{ opacity: 0.8 }}>
                Aucune réponse IA enregistrée pour cet email.
              </div>
            )}

            {/* Bouton Envoyer (uniquement si pas envoyé) */}
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button
                onClick={handleSend}
                disabled={!canSend || sending}
                style={{
                  background: !canSend || sending ? "#374151" : "#10b981",
                  border: "none",
                  color: "white",
                  padding: "10px 14px",
                  borderRadius: 10,
                  cursor: !canSend || sending ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                {sending ? "Envoi..." : "Envoyer"}
              </button>

              {!canSend && !isSent(selectedEmail) && (
                <div style={{ opacity: 0.75, fontSize: 12, alignSelf: "center" }}>
                  (Il faut une réponse IA + une adresse destinataire)
                </div>
              )}
            </div>

            {sendMessage && (
              <div style={{ marginTop: 10, color: sendMessage.type === "success" ? "#34d399" : "#fca5a5" }}>
                {sendMessage.text}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setSelectedEmail(null);
              setSendMessage(null);
            }}
            style={{
              marginTop: 14,
              background: "#ef4444",
              border: "none",
              color: "white",
              padding: "10px 14px",
              borderRadius: 10,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <X size={16} />
            Fermer
          </button>
        </div>
      )}
    </div>
  );
};

export default EmailHistory;
