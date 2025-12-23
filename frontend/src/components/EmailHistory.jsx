import React, { useEffect, useState } from "react";
import { Mail, ArrowRight, X, Send, Trash2 } from "lucide-react";

// ✅ CORRECTION ICI : L'URL EST MAINTENANT PROPRE (plus de crochets)
const API_BASE = "[https://cipherflow-mvp-production.up.railway.app](https://cipherflow-mvp-production.up.railway.app)";

const EmailHistory = ({ token, initialId, authFetch }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchHistory();
  }, [authFetch]);

  useEffect(() => {
    if (initialId && history.length > 0) {
      const email = history.find(e => e.id === initialId);
      if (email) handleSelectEmail(email);
    }
  }, [initialId, history]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      if (!authFetch) return; // Sécurité si authFetch n'est pas prêt
      const res = await authFetch(`${API_BASE}/email/history`);
      
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      } else {
        console.error("Erreur serveur :", res.status);
      }
    } catch (err) {
      console.error("Erreur historique:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEmail = (email) => {
    setSelectedEmail(email);
    setReplySubject(`Re: ${email.subject}`);
    setReplyBody(email.suggested_response_text || "");
    setMessage(null);
  };

  const handleClose = () => {
    setSelectedEmail(null);
    setMessage(null);
  };

  const handleSendEmail = async () => {
    setIsSending(true);
    setMessage(null);
    try {
      const res = await authFetch(`${API_BASE}/email/send`, {
        method: "POST",
        body: JSON.stringify({
          to_email: selectedEmail.sender_email,
          subject: replySubject,
          body: replyBody,
          email_id: selectedEmail.id
        }),
      });
      if (res.ok) setMessage({ type: "success", text: "Email envoyé avec succès !" });
      else setMessage({ type: "error", text: "Erreur lors de l'envoi." });
    } catch (err) {
      setMessage({ type: "error", text: "Erreur réseau." });
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Voulez-vous vraiment supprimer cet email de l'historique ?")) return;

    try {
      const res = await authFetch(`${API_BASE}/email/history/${selectedEmail.id}`, {
        method: "DELETE"
      });

      if (res.ok) {
        setHistory(history.filter(h => h.id !== selectedEmail.id));
        handleClose();
      } else {
        alert("Erreur lors de la suppression.");
      }
    } catch (err) {
      console.error(err);
      alert("Erreur réseau.");
    }
  };

  if (loading) return <div style={{ color: "white", padding: "20px" }}>Chargement...</div>;

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", color: "white" }}>
      {!selectedEmail ? (
        <div style={{ display: "grid", gap: "15px" }}>
          {history.length === 0 && <div style={{ color: "#94a3b8" }}>Aucun historique disponible.</div>}
          {history.map((email) => (
            <div 
              key={email.id}
              onClick={() => handleSelectEmail(email)}
              style={{ background: "#1e293b", padding: "20px", borderRadius: "12px", border: "1px solid #334155", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "5px" }}>
                  <span style={{ background: email.urgency === "haute" ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)", color: email.urgency === "haute" ? "#ef4444" : "#10b981", padding: "2px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "bold", textTransform: "uppercase" }}>
                    {email.urgency}
                  </span>
                  <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{new Date(email.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ fontWeight: "bold", fontSize: "1.1rem", marginBottom: "5px" }}>{email.subject}</div>
                <div style={{ color: "#cbd5e1", fontSize: "0.9rem" }}>{email.sender_email}</div>
              </div>
              <ArrowRight size={20} color="#6366f1" />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: "#1e293b", borderRadius: "16px", border: "1px solid #334155", overflow: "hidden" }}>
          <div style={{ padding: "20px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f172a" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: "bold", display: "flex", alignItems: "center", gap: "10px" }}><Mail size={20} color="#6366f1" /> {selectedEmail.subject}</h2>
            <button onClick={handleClose} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}><X size={24} /></button>
          </div>
          <div style={{ padding: "24px" }}>
            <div style={{ marginBottom: "20px", padding: "15px", background: "rgba(255,255,255,0.03)", borderRadius: "8px" }}>
              <div style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "5px" }}>De : {selectedEmail.sender_email}</div>
              <div style={{ color: "#cbd5e1" }}>{selectedEmail.raw_email_text}</div>
            </div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: "bold", marginBottom: "15px", color: "#6366f1" }}>Réponse IA</h3>
            <div style={{ marginBottom: "15px" }}><label style={{ display: "block", color: "#94a3b8", marginBottom: "5px", fontSize: "0.9rem" }}>Objet</label><input value={replySubject} onChange={(e) => setReplySubject(e.target.value)} style={{ width: "100%", padding: "10px", background: "#0f172a", border: "1px solid #334155", borderRadius: "6px", color: "white" }} /></div>
            <div style={{ marginBottom: "20px" }}><label style={{ display: "block", color: "#94a3b8", marginBottom: "5px", fontSize: "0.9rem" }}>Message</label><textarea rows={10} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} style={{ width: "100%", padding: "10px", background: "#0f172a", border: "1px solid #334155", borderRadius: "6px", color: "white", lineHeight: "1.5" }} /></div>
            {message && <div style={{ padding: "10px", borderRadius: "6px", marginBottom: "20px", background: message.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)", color: message.type === "success" ? "#34d399" : "#ef4444" }}>{message.text}</div>}
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={handleSendEmail} disabled={isSending} style={{ background: "#10b981", color: "white", border: "none", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", opacity: isSending ? 0.7 : 1 }}><Send size={18} /> {isSending ? "Envoi..." : "Envoyer"}</button>
              <button onClick={handleDelete} style={{ background: "#ef4444", color: "white", border: "none", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}><Trash2 size={18} /> Supprimer</button>
              <button onClick={handleClose} style={{ background: "#334155", color: "white", border: "none", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", marginLeft: "auto" }}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailHistory;