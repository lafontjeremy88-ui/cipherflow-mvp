import React, { useEffect, useState } from "react";
import { Mail, ArrowLeft, X, Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { apiFetch } from "../services/api";

const EmailHistory = ({ initialId }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState(null);

  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState(null); // {type:'success'|'error', text:''}

  const getReplyText = (email) => {
    if (!email) return "";
    return (
      email.suggested_response_text ||
      email.reply ||
      email.ai_reply ||
      email.generated_reply ||
      ""
    );
  };

  const getSendStatus = (email) => {
    if (!email) return "not_sent";
    return (email.send_status || "not_sent").toLowerCase();
  };

  const isSent = (email) => getSendStatus(email) === "sent";

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await apiFetch("/email/history");
        if (!res.ok) throw new Error("Erreur chargement historique");
        const data = await res.json();
        setHistory(Array.isArray(data) ? data : []);

        if (initialId) {
          const found = (data || []).find((x) => x.id === initialId);
          if (found) setSelectedEmail(found);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [initialId]);

  const handleSend = async () => {
    if (!selectedEmail) return;
    setSending(true);
    setSendMsg(null);

    try {
      const to_email = selectedEmail.sender_email || selectedEmail.from_email;
      const subjectBase = selectedEmail.subject || "";
      const subject = subjectBase.toLowerCase().startsWith("re:")
        ? subjectBase
        : `Re: ${subjectBase}`.trim();
      const body = getReplyText(selectedEmail);

      if (!to_email) throw new Error("Adresse destinataire manquante");
      if (!body || !body.trim()) throw new Error("Réponse IA manquante");

      const res = await apiFetch("/email/send", {
        method: "POST",
        body: JSON.stringify({
        to_email,
        subject,
        body,
        email_id: selectedEmail.id ?? selectedEmail.email_id ?? null,// ✅ IMPORTANT
      }),
    });



      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Erreur envoi");
      }

      // ✅ Mise à jour UI (optimiste)
      const updated = { ...selectedEmail, send_status: "sent" };
      setSelectedEmail(updated);
      setHistory((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));

      setSendMsg({ type: "success", text: "✅ Email envoyé !" });
    } catch (e) {
      console.error(e);
      setSendMsg({ type: "error", text: e.message || "Erreur inconnue" });
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}>Chargement...</div>;

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
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem", color: "white" }}>
      <h2 style={{ fontSize: "2rem", fontWeight: 900, marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: 10 }}>
        <Mail size={28} />
        Historique Emails
      </h2>

      {!selectedEmail ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {history.length === 0 && <div style={{ opacity: 0.8 }}>Aucun email.</div>}

          {history.map((email) => {
            const sent = isSent(email);
            return (
              <div
                key={email.id}
                onClick={() => {
                  setSelectedEmail(email);
                  setSendMsg(null);
                }}
                style={{
                  background: "#1f2937",
                  padding: "1rem",
                  borderRadius: "12px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 900 }}>
                      {email.subject || "Sans sujet"}
                    </div>
                    <div style={{ opacity: 0.8, marginTop: 4 }}>
                      {email.sender_email || email.from_email || ""}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {email.created_at || ""}
                    </div>
                  </div>

                  <div style={badgeStyle(sent)}>
                    {sent ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {sent ? "Envoyé" : "À envoyer"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background: "#1f2937", padding: "2rem", borderRadius: "16px" }}>
          <button
            onClick={() => {
              setSelectedEmail(null);
              setSendMsg(null);
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "white",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: "1rem",
            }}
          >
            <ArrowLeft size={20} /> Retour
          </button>

          <h3 style={{ fontSize: "1.5rem", fontWeight: 900 }}>{selectedEmail.subject}</h3>
          <p style={{ opacity: 0.8 }}>
            {selectedEmail.sender_email || selectedEmail.from_email || ""}
          </p>

          <div style={{ marginTop: 16, whiteSpace: "pre-wrap", opacity: 0.9 }}>
            {selectedEmail.raw_email_text || selectedEmail.content || selectedEmail.body || ""}
          </div>

          <div style={{ marginTop: 20, padding: 14, borderRadius: 12, background: "#0b1220", border: "1px solid rgba(148,163,184,0.15)" }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Réponse IA</div>
            <div style={{ whiteSpace: "pre-wrap", opacity: 0.95 }}>
              {getReplyText(selectedEmail) || "Aucune réponse IA enregistrée."}
            </div>

            {!isSent(selectedEmail) && getReplyText(selectedEmail) ? (
              <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  style={{
                    background: sending ? "#374151" : "#10b981",
                    border: "none",
                    color: "white",
                    padding: "10px 14px",
                    borderRadius: 10,
                    cursor: sending ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {sending ? <Loader2 size={16} /> : <Send size={16} />}
                  {sending ? "Envoi..." : "Envoyer"}
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 14, opacity: 0.8 }}>
                {isSent(selectedEmail) ? "✅ Déjà envoyé." : "⚠️ Pas de réponse IA à envoyer."}
              </div>
            )}

            {sendMsg && (
              <div style={{ marginTop: 10, color: sendMsg.type === "success" ? "#34d399" : "#fca5a5" }}>
                {sendMsg.text}
              </div>
            )}
          </div>

          <button
            onClick={() => setSelectedEmail(null)}
            style={{
              marginTop: "1.5rem",
              background: "#ef4444",
              border: "none",
              color: "white",
              padding: "0.75rem 1.5rem",
              borderRadius: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <X size={18} />
            Fermer
          </button>
        </div>
      )}
    </div>
  );
};

export default EmailHistory;
