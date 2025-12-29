import React, { useEffect, useState } from "react";
import { Mail, ArrowRight, X, Send, Trash2, Eye, Search, Filter, ArrowUpDown } from "lucide-react";

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

  // États pour les filtres et le tri
  const [filterUrgency, setFilterUrgency] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  
  // ✅ IMPORTANT : Par défaut, on trie par date descendante (plus récent en haut)
  const [sortBy, setSortBy] = useState("date_desc");

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

  // --- 1. NORMALISATION ---
  const normalizeUrgency = (rawUrgency) => {
    if (!rawUrgency) return "faible";
    const val = String(rawUrgency).toLowerCase().trim();
    if (val.includes("haut") || val.includes("high") || val.includes("urg") || val.includes("elev") || val.includes("criti")) return "haute";
    if (val.includes("moyen") || val.includes("medium") || val.includes("mod")) return "moyenne";
    return "faible";
  };

  // --- 2. STYLES ---
  const getUrgencyStyles = (standardizedUrgency) => {
    switch (standardizedUrgency) {
      case "haute":
        return { bg: "rgba(239, 68, 68, 0.2)", text: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)" }; // Rouge
      case "moyenne":
        return { bg: "rgba(249, 115, 22, 0.2)", text: "#f97316", border: "1px solid rgba(249, 115, 22, 0.3)" }; // Orange
      default: // faible
        return { bg: "rgba(16, 185, 129, 0.2)", text: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)" }; // Vert
    }
  };

  // --- 3. FONCTION DE NETTOYAGE (ANTI-HTML) ---
  const cleanEmailBody = (text) => {
    if (!text) return "";
    return text
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // Enlève le CSS
      .replace(/<[^>]+>/g, "") // Enlève les balises HTML <div> <br> etc
      .replace(/&nbsp;/g, " ") // Remplace les espaces insécables
      .trim();
  };

  // --- 4. LOGIQUE DE TRI ROBUSTE ---
  const getSortedAndFilteredHistory = () => {
    // A. Filtrage d'abord
    let filtered = history.filter(email => {
      const normalizedU = normalizeUrgency(email.urgency);
      const matchesUrgency = filterUrgency === "all" || normalizedU === filterUrgency;
      
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        (email.subject || "").toLowerCase().includes(searchLower) || 
        (email.sender_email || "").toLowerCase().includes(searchLower) ||
        (email.category || "").toLowerCase().includes(searchLower);
      
      return matchesUrgency && matchesSearch;
    });

    // B. Tri ensuite (Sur le Frontend pour être sûr)
    return filtered.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;

      // 📅 Tri par DATE (Le plus demandé)
      if (sortBy === "date_desc") {
        return dateB - dateA; // Le plus grand (récent) en premier
      }
      
      // 🔥 Tri par URGENCE (+ Date en secondaire)
      if (sortBy === "urgency_desc" || sortBy === "urgency_asc") {
        const score = (u) => {
          const n = normalizeUrgency(u);
          if (n === "haute") return 3;
          if (n === "moyenne") return 2;
          return 1; // Faible
        };
        const scoreA = score(a.urgency);
        const scoreB = score(b.urgency);

        // Si urgence différente, on trie par urgence
        if (scoreA !== scoreB) {
          return sortBy === "urgency_desc" ? scoreB - scoreA : scoreA - scoreB;
        }
        // Si urgence identique, on trie toujours le plus récent en premier
        return dateB - dateA;
      }
      
      return 0;
    });
  };

  const processedHistory = getSortedAndFilteredHistory();

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

  const handleDelete = async (e, id) => {
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

  if (loading) return <div style={{ color: "white", padding: "20px", display: "flex", gap: "10px" }}><div className="spin">⏳</div> Chargement de l'historique...</div>;

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", color: "white" }}>
      
      {!selectedEmail ? (
        <>
          {/* --- BARRE D'OUTILS --- */}
          <div style={{ display: "flex", gap: "15px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center", background: "#1e293b", padding: "15px", borderRadius: "12px", border: "1px solid #334155" }}>
            
            {/* Recherche */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: "200px" }}>
              <Search size={18} color="#94a3b8" />
              <input 
                type="text" 
                placeholder="Rechercher..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ background: "transparent", border: "none", color: "white", outline: "none", width: "100%", fontSize: "0.95rem" }}
              />
            </div>
            
            <div style={{ width: "1px", height: "24px", background: "#334155", margin: "0 10px" }}></div>

            {/* Filtre Urgence */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Filter size={16} color="#94a3b8" />
              <select 
                value={filterUrgency} 
                onChange={(e) => setFilterUrgency(e.target.value)}
                style={{ background: "#0f172a", color: "white", border: "1px solid #334155", padding: "8px 12px", borderRadius: "6px", outline: "none", cursor: "pointer", fontSize: "0.9rem" }}
              >
                <option value="all">Filtre: Tout</option>
                <option value="haute">Filtre: Urgences</option>
                <option value="moyenne">Filtre: Moyenne</option>
                <option value="faible">Filtre: Faible</option>
              </select>
            </div>

            {/* Tri (Fixé) */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <ArrowUpDown size={16} color="#94a3b8" />
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                style={{ background: "#0f172a", color: "white", border: "1px solid #334155", padding: "8px 12px", borderRadius: "6px", outline: "none", cursor: "pointer", fontSize: "0.9rem" }}
              >
                <option value="date_desc">📅 Plus récents (Défaut)</option>
                <option value="urgency_desc">🔥 Urgence Haute d'abord</option>
                <option value="urgency_asc">🌱 Urgence Faible d'abord</option>
              </select>
            </div>

          </div>

          {/* --- LISTE DES EMAILS --- */}
          <div style={{ display: "grid", gap: "12px" }}>
            {processedHistory.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px", color: "#64748b", background: "#1e293b", borderRadius: "12px" }}>
                Aucun email ne correspond à vos critères.
              </div>
            )}

            {processedHistory.map((email) => {
              const standardUrgency = normalizeUrgency(email.urgency);
              const style = getUrgencyStyles(standardUrgency);
              
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
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#6366f1"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#334155"; e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      {/* BADGE URGENCE DYNAMIQUE */}
                      <span style={{ 
                        background: style.bg, 
                        color: style.text, 
                        border: style.border,
                        padding: "4px 10px", 
                        borderRadius: "6px", 
                        fontSize: "0.75rem", 
                        fontWeight: "800", 
                        textTransform: "uppercase",
                        letterSpacing: "0.5px"
                      }}>
                        {standardUrgency}
                      </span>
                      <span style={{ color: "#64748b", fontSize: "0.85rem" }}>
                        {email.created_at ? new Date(email.created_at).toLocaleDateString() + ' à ' + new Date(email.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "Date inconnue"}
                      </span>
                    </div>
                    <div style={{ fontWeight: "700", fontSize: "1.1rem", color: "white" }}>{email.subject || "Sans objet"}</div>
                    <div style={{ color: "#94a3b8", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Mail size={14} /> {email.sender_email}
                    </div>
                  </div>

                  {/* BOUTONS D'ACTION RAPIDE */}
                  <div style={{ display: "flex", gap: "10px", paddingLeft: "20px", borderLeft: "1px solid #334155" }}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleSelectEmail(email); }} 
                      title="Voir le détail"
                      style={{ background: "#3b82f6", color: "white", border: "none", padding: "10px", borderRadius: "10px", cursor: "pointer", display: "grid", placeItems: "center", transition: "0.2s" }}
                    >
                      <Eye size={18} />
                    </button>
                    <button 
                      onClick={(e) => handleDelete(e, email.id)} 
                      title="Supprimer"
                      style={{ background: "rgba(239, 68, 68, 0.2)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "10px", borderRadius: "10px", cursor: "pointer", display: "grid", placeItems: "center", transition: "0.2s" }}
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
                  const standardUrgency = normalizeUrgency(selectedEmail.urgency);
                  const style = getUrgencyStyles(standardUrgency);
                  return <span style={{ background: style.bg, color: style.text, padding: "4px 10px", borderRadius: "6px", fontWeight: "bold", fontSize: "0.8rem", textTransform: "uppercase" }}>Urgence : {standardUrgency}</span>;
               })()}
               <span style={{ background: "#334155", color: "white", padding: "4px 10px", borderRadius: "6px", fontWeight: "bold", fontSize: "0.8rem", textTransform: "uppercase" }}>Catégorie : {selectedEmail.category}</span>
            </div>

            <div style={{ marginBottom: "20px", padding: "20px", background: "rgba(255,255,255,0.03)", borderRadius: "12px", border: "1px solid #334155" }}>
              <div style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "8px", fontWeight: "bold" }}>De : {selectedEmail.sender_email}</div>
              <div style={{ color: "#e2e8f0", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
                {/* ✅ FONCTION DE NETTOYAGE APPLIQUÉE ICI */}
                {cleanEmailBody(selectedEmail.raw_email_text)}
              </div>
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