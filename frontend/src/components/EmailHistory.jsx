import React, { useEffect, useState } from "react";
import { Mail, ArrowRight, X, Send, Trash2, Eye, Search, Filter } from "lucide-react";

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

const EmailHistory = ({ token, initialId, authFetch }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState(null);
  
  // États pour la réponse
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState(null);

  // États pour les filtres
  const [filterUrgency, setFilterUrgency] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

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
      if (!authFetch) return; 
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

  // --- LOGIQUE COULEURS ---
  const getUrgencyStyles = (urgency) => {
    const val = urgency?.toLowerCase() || "faible";
    switch (val) {
      case "haute":
        return { bg: "rgba(239, 68, 68, 0.2)", text: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)" }; // Rouge
      case "moyenne":
        return { bg: "rgba(249, 115, 22, 0.2)", text: "#f97316", border: "1px solid rgba(249, 115, 22, 0.3)" }; // Orange
      default:
        return { bg: "rgba(16, 185, 129, 0.2)", text: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)" }; // Vert
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

  // Suppression directe depuis la liste ou le détail
  const handleDelete = async (e, id) => {
    // Empêche le clic de se propager (pour ne pas ouvrir le mail quand on clique sur supprimer)
    if (e) e.stopPropagation(); 
    
    if (!window.confirm("Voulez-vous vraiment supprimer cet email de l'historique ?")) return;

    try {
      const res = await authFetch(`${API_BASE}/email/history/${id}`, {
        method: "DELETE"
      });

      if (res.ok) {
        setHistory(history.filter(h => h.id !== id));
        if (selectedEmail?.id === id) handleClose();
      } else {
        alert("Erreur lors de la suppression.");
      }
    } catch (err) {
      console.error(err);
      alert("Erreur réseau.");
    }
  };

  // --- FILTRAGE DES DONNÉES ---
  const filteredHistory = history.filter(email => {
    const matchesUrgency = filterUrgency === "all" || email.urgency?.toLowerCase() === filterUrgency;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      email.subject?.toLowerCase().includes(searchLower) || 
      email.sender_email?.toLowerCase().includes(searchLower) ||
      email.category?.toLowerCase().includes(searchLower);
    
    return matchesUrgency && matchesSearch;
  });

  if (loading) return <div style={{ color: "white", padding: "20px", display: "flex", gap: "10px" }}><div className="spin">⏳</div> Chargement de l'historique...</div>;

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", color: "white" }}>
      
      {!selectedEmail ? (
        <>
          {/* --- BARRE DE FILTRES --- */}
          <div style={{ display: "flex", gap: "15px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center", background: "#1e293b", padding: "15px", borderRadius: "12px", border: "1px solid #334155" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
              <Search size={18} color="#94a3b8" />
              <input 
                type="text" 
                placeholder="Rechercher (sujet, email...)" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ background: "transparent", border: "none", color: "white", outline: "none", width: "100%", fontSize: "0.95rem" }}
              />
            </div>
            
            <div style={{ width: "1px", height: "24px", background: "#334155" }}></div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Filter size={16} color="#94a3b8" />
              <select 
                value={filterUrgency} 
                onChange={(e) => setFilterUrgency(e.target.value)}
                style={{ background: "#0f172a", color: "white", border: "1px solid #334155", padding: "6px 12px", borderRadius: "6px", outline: "none", cursor: "pointer" }}
              >
                <option value="all">Toutes urgences</option>
                <option value="haute">Haute 🔴</option>
                <option value="moyenne">Moyenne 🟠</option>
                <option value="faible">Faible 🟢</option>
              </select>
            </div>
          </div>

          {/* --- LISTE DES EMAILS --- */}
          <div style={{ display: "grid", gap: "12px" }}>
            {filteredHistory.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px", color: "#64748b", background: "#1e293b", borderRadius: "12px" }}>
                Aucun email ne correspond à vos critères.
              </div>
            )}

            {filteredHistory.map((email) => {
              const style = getUrgencyStyles(email.urgency);
              return (
                <div 
                  key={email.id}
                  onClick={() => handleSelectEmail(email)}
                  style={{ 
                    background: "#1e293b", 
                    padding: "16px 20px", 
                    borderRadius: "12px", 
                    border: "1px solid #334155", 
                    cursor: "pointer", 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    transition: "transform 0.1s, border-color 0.1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#6366f1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#334155"; }}
                >
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      {/* BADGE URGENCE DYNAMIQUE */}
                      <span style={{ 
                        background: style.bg, 
                        color: style.text, 
                        border: style.border,
                        padding: "2px 8px", 
                        borderRadius: "6px", 
                        fontSize: "0.7rem", 
                        fontWeight: "800", 
                        textTransform: "uppercase",
                        letterSpacing: "0.5px"
                      }}>
                        {email.urgency}
                      </span>
                      <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{new Date(email.created_at).toLocaleDateString()} à {new Date(email.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div style={{ fontWeight: "700", fontSize: "1.05rem", color: "white" }}>{email.subject}</div>
                    <div style={{ color: "#94a3b8", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Mail size={14} /> {email.sender_email}
                    </div>
                  </div>

                  {/* BOUTONS D'ACTION RAPIDE */}
                  <div style={{ display: "flex", gap: "10px", paddingLeft: "20px", borderLeft: "1px solid #334155" }}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleSelectEmail(email); }} 
                      title="Voir le détail"
                      style={{ background: "#3b82f6", color: "white", border: "none", padding: "8px", borderRadius: "8px", cursor: "pointer", display: "grid", placeItems: "center" }}
                    >
                      <Eye size={18} />
                    </button>
                    <button 
                      onClick={(e) => handleDelete(e, email.id)} 
                      title="Supprimer"
                      style={{ background: "rgba(239, 68, 68, 0.2)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "8px", borderRadius: "8px", cursor: "pointer", display: "grid", placeItems: "center" }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* --- VUE DÉTAIL --- */
        <div style={{ background: "#1e293b", borderRadius: "16px", border: "1px solid #334155", overflow: "hidden", animation: "fadeIn 0.2s" }}>
          <div style={{ padding: "20px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f172a" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: "bold", display: "flex", alignItems: "center", gap: "10px" }}>
              <Mail size={20} color="#6366f1" /> {selectedEmail.subject}
            </h2>
            <button onClick={handleClose} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}><X size={24} /></button>
          </div>
          
          <div style={{ padding: "24px" }}>
            {/* Infos IA */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
               {(() => {
                  const style = getUrgencyStyles(selectedEmail.urgency);
                  return <span style={{ background: style.bg, color: style.text, padding: "4px 10px", borderRadius: "6px", fontWeight: "bold", fontSize: "0.8rem", textTransform: "uppercase" }}>Urgence : {selectedEmail.urgency}</span>;
               })()}
               <span style={{ background: "#334155", color: "white", padding: "4px 10px", borderRadius: "6px", fontWeight: "bold", fontSize: "0.8rem", textTransform: "uppercase" }}>Catégorie : {selectedEmail.category}</span>
            </div>

            <div style={{ marginBottom: "20px", padding: "20px", background: "rgba(255,255,255,0.03)", borderRadius: "12px", border: "1px solid #334155" }}>
              <div style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "8px", fontWeight: "bold" }}>De : {selectedEmail.sender_email}</div>
              <div style={{ color: "#e2e8f0", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{selectedEmail.raw_email_text}</div>
            </div>

            <h3 style={{ fontSize: "1.1rem", fontWeight: "bold", marginBottom: "15px", color: "#6366f1", display: "flex", alignItems: "center", gap: "8px" }}>
              <Send size={18} /> Réponse IA suggérée
            </h3>
            
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", color: "#94a3b8", marginBottom: "5px", fontSize: "0.9rem" }}>Objet</label>
              <input value={replySubject} onChange={(e) => setReplySubject(e.target.value)} style={{ width: "100%", padding: "12px", background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", color: "white" }} />
            </div>
            
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", color: "#94a3b8", marginBottom: "5px", fontSize: "0.9rem" }}>Message</label>
              <textarea rows={12} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} style={{ width: "100%", padding: "12px", background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", color: "white", lineHeight: "1.6", resize: "vertical" }} />
            </div>

            {message && (
              <div style={{ padding: "12px", borderRadius: "8px", marginBottom: "20px", background: message.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)", color: message.type === "success" ? "#34d399" : "#ef4444", fontWeight: "bold", display: "flex", alignItems: "center", gap: "10px" }}>
                {message.text}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", borderTop: "1px solid #334155", paddingTop: "20px" }}>
              <button onClick={handleSendEmail} disabled={isSending} style={{ background: "#10b981", color: "white", border: "none", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", opacity: isSending ? 0.7 : 1 }}>
                <Send size={18} /> {isSending ? "Envoi en cours..." : "Envoyer la réponse"}
              </button>
              
              <button onClick={(e) => handleDelete(e, selectedEmail.id)} style={{ background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
                <Trash2 size={18} /> Supprimer
              </button>
              
              <button onClick={handleClose} style={{ background: "transparent", color: "#94a3b8", border: "1px solid #334155", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", marginLeft: "auto" }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailHistory;