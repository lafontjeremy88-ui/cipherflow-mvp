import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import {
  LayoutDashboard, Send, History, Zap, CheckCircle, AlertCircle, Mail,
  Settings, LogOut, FileText, User, FolderSearch, PieChart
} from "lucide-react";

import Login from "./components/Login";
import Register from "./components/Register";
import FileAnalyzer from "./components/FileAnalyzer";
import InvoiceGenerator from "./components/InvoiceGenerator";
import EmailHistory from "./components/EmailHistory";
import SettingsPanel from "./components/SettingsPanel";

import DashboardPage from "./pages/Dashboard"; 
import OAuthCallback from "./pages/OAuthCallback"; 

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

const LS_TOKEN = "cipherflow_token";
const LS_EMAIL = "cipherflow_email";

function App() {
  const [token, setToken] = useState(localStorage.getItem(LS_TOKEN));
  const [userEmail, setUserEmail] = useState(localStorage.getItem(LS_EMAIL));
  const [showRegister, setShowRegister] = useState(false);

  const handleAuthSuccess = (newToken, email) => {
    localStorage.setItem(LS_TOKEN, newToken);
    if (email) localStorage.setItem(LS_EMAIL, email);
    setToken(newToken);
    if (email) setUserEmail(email);
    setShowRegister(false);
  };

  const handleLogout = () => {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EMAIL);
    setToken(null);
    setUserEmail(null);
    setShowRegister(false);
  };

  return (
    <Routes>
      <Route path="/oauth/callback" element={<OAuthCallback onSuccess={handleAuthSuccess} />} />
      <Route path="/*" element={<AppShell token={token} userEmail={userEmail} showRegister={showRegister} setShowRegister={setShowRegister} onAuthSuccess={handleAuthSuccess} onLogout={handleLogout} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AppShell({ token, userEmail, showRegister, setShowRegister, onAuthSuccess, onLogout }) {
  if (!token) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0f172a", padding: "20px" }}>
        <div style={{ marginBottom: "20px", textAlign: "center" }}>
          <Zap size={40} color="#6366f1" />
          <h1 style={{ color: "white", fontSize: "1.5rem", marginTop: "10px" }}>CipherFlow V2</h1>
        </div>
        <div style={{ width: "100%", maxWidth: "400px", background: "#1e293b", padding: "2rem", borderRadius: "16px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.5)" }}>
          {showRegister ? <Register onLogin={onAuthSuccess} /> : <Login onLogin={onAuthSuccess} />}
          <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid #334155", textAlign: "center" }}>
            <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "10px" }}>{showRegister ? "Déjà un compte ?" : "Pas encore de compte ?"}</p>
            <button onClick={() => setShowRegister(!showRegister)} style={{ background: "rgba(99, 102, 241, 0.1)", color: "#818cf8", border: "none", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", width: "100%" }}>
              {showRegister ? "Se connecter" : "Créer un compte gratuitement"}
            </button>
          </div>
        </div>
      </div>
    );
  }
  return <MainApp token={token} userEmail={userEmail} onLogout={onLogout} />;
}

function MainApp({ token, userEmail, onLogout }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);

  const [fromEmail, setFromEmail] = useState("client@example.com");
  const [subject, setSubject] = useState("Problème de connexion");
  const [content, setContent] = useState("Bonjour...");
  const [analyse, setAnalyse] = useState(null);
  const [analysisId, setAnalysisId] = useState(null);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (activeTab !== "analyze") {
      setAnalyse(null); setAnalysisId(null); setInfoMessage(""); setErrorMessage("");
    }
  }, [activeTab]);

  // 🔥🔥🔥 CORRECTION : Gestion intelligente du Content-Type 🔥🔥🔥
  const authFetch = async (url, options = {}) => {
    const headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };

    // SI le corps de la requête n'est PAS un FormData (donc pas un fichier)
    // ALORS on ajoute "application/json".
    // SINON (si c'est un fichier), on ne met RIEN (le navigateur s'en occupe).
    if (!(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      onLogout();
      throw new Error("Session expirée, veuillez vous reconnecter.");
    }
    return res;
  };

  const handleAnalyse = async () => {
    setErrorMessage(""); setInfoMessage(""); setIsAnalyzing(true);
    try {
      const res = await authFetch(`${API_BASE}/email/process`, {
        method: "POST",
        body: JSON.stringify({ from_email: fromEmail, subject, content, send_email: false }),
      });
      if (!res.ok) throw new Error("Erreur serveur lors de l'analyse");
      const data = await res.json();
      setAnalysisId(data.id ?? data.email_id);
      setAnalyse(data.analyse);
      setReplySubject(data.reponse?.subject);
      setReplyBody(data.reponse?.reply);
      setInfoMessage("Analyse terminée !");
    } catch (err) { setErrorMessage(err.message); } finally { setIsAnalyzing(false); }
  };

  const handleSendEmail = async () => {
    setIsSending(true); setErrorMessage(""); setInfoMessage("");
    try {
      const res = await authFetch(`${API_BASE}/email/send`, {
        method: "POST",
        body: JSON.stringify({ to_email: fromEmail, subject: replySubject, body: replyBody, email_id: analysisId }),
      });
      if (!res.ok) throw new Error("Erreur envoi email");
      setInfoMessage("Email envoyé ✅"); setAnalyse(null); setAnalysisId(null); setContent("");
    } catch (err) { setErrorMessage(err.message); } finally { setIsSending(false); }
  };

  const handleNavigation = (tabName, id = null) => { if (id) setSelectedHistoryId(id); setActiveTab(tabName); };
  const handleSidebarClick = (tabName) => { setSelectedHistoryId(null); setActiveTab(tabName); };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo"><Zap size={28} color="#6366f1" /><span>CipherFlow V2</span></div>
        <div style={{ padding: "0 20px 20px 20px", marginBottom: "20px", borderBottom: "1px solid #334155" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#94a3b8", fontSize: "0.85rem" }}>
            <div style={{ background: "#334155", padding: "8px", borderRadius: "50%" }}><User size={16} /></div>
            <div><div style={{ fontWeight: "bold", color: "white" }}>Connecté</div><div title={userEmail} style={{overflow:'hidden', textOverflow:'ellipsis', maxWidth:'140px'}}>{userEmail}</div></div>
          </div>
        </div>
        <nav>
          <div className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => handleSidebarClick("dashboard")}><PieChart size={20} /> <span>Vue d'ensemble</span></div>
          <div className={`nav-item ${activeTab === "analyze" ? "active" : ""}`} onClick={() => handleSidebarClick("analyze")}><LayoutDashboard size={20} /> <span>Traitement Email</span></div>
          <div className={`nav-item ${activeTab === "invoices" ? "active" : ""}`} onClick={() => handleSidebarClick("invoices")}><FileText size={20} /> <span>Facturation</span></div>
          <div className={`nav-item ${activeTab === "documents" ? "active" : ""}`} onClick={() => handleSidebarClick("documents")}><FolderSearch size={20} /> <span>Documents</span></div>
          <div className={`nav-item ${activeTab === "history" ? "active" : ""}`} onClick={() => handleSidebarClick("history")}><History size={20} /> <span>Historique</span></div>
          <div className={`nav-item ${activeTab === "settings" ? "active" : ""}`} onClick={() => handleSidebarClick("settings")}><Settings size={20} /> <span>Paramètres</span></div>
          <div className="nav-item" style={{ marginTop: "auto", color: "#f87171" }} onClick={onLogout}><LogOut size={20} /> <span>Déconnexion</span></div>
        </nav>
      </aside>

      <main className="main-content">
        <header style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.8rem", fontWeight: "bold" }}>
            {activeTab === "dashboard" && "Tableau de Bord"}
            {activeTab === "analyze" && "Traitement Intelligent"}
            {activeTab === "invoices" && "Générateur de Factures"}
            {activeTab === "documents" && "Analyse de Documents"}
            {activeTab === "history" && "Historique des Activités"}
            {activeTab === "settings" && "Paramètres du SaaS"}
          </h1>
        </header>

        {errorMessage && <div style={{ backgroundColor: "rgba(239,68,68,0.2)", color: "#f87171", padding: "1rem", borderRadius: "8px", marginBottom: "1rem", display: "flex", gap: "10px" }}><AlertCircle size={20} /> {errorMessage}</div>}
        {infoMessage && <div style={{ backgroundColor: "rgba(16,185,129,0.2)", color: "#34d399", padding: "1rem", borderRadius: "8px", marginBottom: "1rem", display: "flex", gap: "10px" }}><CheckCircle size={20} /> {infoMessage}</div>}

        {activeTab === "dashboard" && <DashboardPage token={token} onNavigate={handleNavigation} authFetch={authFetch} />}
        
        {activeTab === "analyze" && (
          <div className="dashboard-grid">
            <div className="card">
              <h2 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1.5rem" }}><Mail size={20} color="var(--accent)" /> Email du Client</h2>
              <div className="form-group"><label>Expéditeur</label><input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} /></div>
              <div className="form-group"><label>Sujet</label><input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
              <div className="form-group"><label>Contenu</label><textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} /></div>
              <button className="btn btn-primary" onClick={handleAnalyse} disabled={isAnalyzing}>{isAnalyzing ? "Analyse..." : "Analyser"} <Zap size={18} /></button>
            </div>
            {analyse && (
              <>
                <div className="card" style={{ borderColor: "var(--accent)" }}>
                  <h3 style={{ marginBottom: "1rem" }}>📊 Analyse IA</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div><label>Catégorie</label><div className="badge badge-info">{analyse.category}</div></div>
                    <div><label>Urgence</label><div className={`badge ${analyse.urgency === "haute" ? "badge-danger" : "badge-success"}`}>{analyse.urgency}</div></div>
                  </div>
                  <div style={{ marginTop: "1rem" }}><label>Résumé</label><p>{analyse.summary}</p></div>
                </div>
                <div className="card">
                  <h3 style={{ marginBottom: "1rem" }}>✍️ Réponse</h3>
                  <div className="form-group"><label>Objet</label><input type="text" value={replySubject} onChange={(e) => setReplySubject(e.target.value)} /></div>
                  <div className="form-group"><label>Corps</label><textarea rows={10} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} /></div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn btn-success" onClick={handleSendEmail} disabled={isSending}>{isSending ? "Envoi..." : "Envoyer"} <Send size={18} /></button></div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "invoices" && <div style={{ maxWidth: "1600px", margin: "0 auto" }}><InvoiceGenerator token={token} authFetch={authFetch} /></div>}
        {activeTab === "documents" && <FileAnalyzer token={token} authFetch={authFetch} />}
        {activeTab === "history" && <EmailHistory token={token} initialId={selectedHistoryId} authFetch={authFetch} />}
        {activeTab === "settings" && <SettingsPanel token={token} authFetch={authFetch} />}
      </main>
    </div>
  );
}

export default App;