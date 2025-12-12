import React, { useState, useEffect } from "react";
import { 
  LayoutDashboard, Send, History, Zap, CheckCircle, AlertCircle, Mail,
  Activity, AlertTriangle, Euro, Settings, LogOut, FileText, User
} from "lucide-react"; 

import EmailHistory from "./components/EmailHistory";
import StatCard from "./components/StatCard";
import SettingsPanel from "./components/SettingsPanel";
import Login from "./components/Login";
import InvoiceGenerator from "./components/InvoiceGenerator";
import Register from "./components/Register"; 

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

function App() {
  const [token, setToken] = useState(localStorage.getItem('cipherflow_token'));
  const [userEmail, setUserEmail] = useState(localStorage.getItem('cipherflow_email')); // <--- On stocke l'email
  const [showRegister, setShowRegister] = useState(false);

  // Fonction de connexion unifiée
  const handleAuthSuccess = (newToken, email) => {
      localStorage.setItem('cipherflow_token', newToken);
      localStorage.setItem('cipherflow_email', email); // Sauvegarde
      setToken(newToken);
      setUserEmail(email);
      setShowRegister(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('cipherflow_token');
    localStorage.removeItem('cipherflow_email');
    setToken(null);
    setUserEmail(null);
    setShowRegister(false);
  };

  // --- ECRAN DE CONNEXION / INSCRIPTION COMPACT ---
  if (!token) {
    return (
        <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            minHeight: '100vh',
            background: '#0f172a',
            padding: '20px'
        }}>
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                <Zap size={40} color="#6366f1" />
                <h1 style={{ color: 'white', fontSize: '1.5rem', marginTop: '10px' }}>CipherFlow V2</h1>
            </div>

            {/* Zone Blanche (Carte) */}
            <div style={{ 
                width: '100%', 
                maxWidth: '400px', 
                background: '#1e293b', 
                padding: '2rem', 
                borderRadius: '16px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
            }}>
                {showRegister ? (
                    <Register onLogin={(t, e) => handleAuthSuccess(t, e)} />
                ) : (
                    <Login onLogin={(t, e) => handleAuthSuccess(t, e)} />
                )}

                {/* LE BOUTON DE BASCULE (Juste en dessous) */}
                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #334155', textAlign: 'center' }}>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '10px' }}>
                        {showRegister ? "Déjà un compte ?" : "Pas encore de compte ?"}
                    </p>
                    <button 
                        onClick={() => setShowRegister(!showRegister)}
                        style={{ 
                            background: 'rgba(99, 102, 241, 0.1)', 
                            color: '#818cf8', 
                            border: 'none', 
                            padding: '10px 20px', 
                            borderRadius: '8px', 
                            cursor: 'pointer', 
                            fontWeight: 'bold',
                            width: '100%'
                        }}
                    >
                        {showRegister ? "Se connecter" : "Créer un compte gratuitement"}
                    </button>
                </div>
            </div>
        </div>
    );
  }

  return <Dashboard token={token} userEmail={userEmail} onLogout={handleLogout} />;
}

// --- DASHBOARD ---
function Dashboard({ token, userEmail, onLogout }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  
  // États Dashboard...
  const [fromEmail, setFromEmail] = useState("client@example.com");
  const [subject, setSubject] = useState("Problème de connexion");
  const [content, setContent] = useState("Bonjour...");
  const [analyse, setAnalyse] = useState(null);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [stats, setStats] = useState({ total_processed: 0, high_urgency: 0, devis_requests: 0 });

  const authFetch = async (url, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...options.headers, 'Authorization': `Bearer ${token}` };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) { onLogout(); throw new Error("Session expirée"); }
    return res;
  };

  const fetchStats = async () => {
    try {
      const res = await authFetch(`${API_BASE}/dashboard/stats`);
      if (res.ok) setStats(await res.json());
    } catch (err) {}
  };

  useEffect(() => { if (activeTab === 'dashboard') fetchStats(); }, [activeTab, analyse]);

  const handleAnalyse = async () => {
    setErrorMessage(""); setInfoMessage(""); setIsAnalyzing(true);
    try {
      const res = await authFetch(`${API_BASE}/email/process`, { method: "POST", body: JSON.stringify({ from_email: fromEmail, subject, content, send_email: false }) });
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setAnalyse(data.analyse); setReplySubject(data.reponse?.subject); setReplyBody(data.reponse?.reply);
      setInfoMessage("Analyse terminée !");
    } catch (err) { setErrorMessage(err.message); } finally { setIsAnalyzing(false); }
  };

  const handleSendEmail = async () => {
    setIsSending(true); setErrorMessage("");
    try {
      const res = await authFetch(`${API_BASE}/email/send`, { method: "POST", body: JSON.stringify({ to_email: fromEmail, subject: replySubject, body: replyBody }) });
      if (!res.ok) throw new Error("Erreur");
      setInfoMessage("Email envoyé !"); setAnalyse(null); setContent("");
    } catch (err) { setErrorMessage(err.message); } finally { setIsSending(false); }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo">
          <Zap size={28} color="#6366f1" />
          <span>CipherFlow V2</span>
        </div>
        
        {/* INFO UTILISATEUR CONNECTÉ */}
        <div style={{ padding: '0 20px 20px 20px', marginBottom: '20px', borderBottom: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8', fontSize: '0.85rem' }}>
                <div style={{ background: '#334155', padding: '8px', borderRadius: '50%' }}><User size={16} /></div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <div style={{ fontWeight: 'bold', color: 'white' }}>Connecté en tant que</div>
                    <div title={userEmail}>{userEmail || "Utilisateur"}</div>
                </div>
            </div>
        </div>

        <nav>
          <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}><LayoutDashboard size={20} /> <span>Traitement</span></div>
          <div className={`nav-item ${activeTab === 'invoices' ? 'active' : ''}`} onClick={() => setActiveTab('invoices')}><FileText size={20} /> <span>Facturation</span></div>
          <div className={`nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}><History size={20} /> <span>Historique</span></div>
          <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}><Settings size={20} /> <span>Paramètres</span></div>
          <div className="nav-item" style={{ marginTop: 'auto', color: '#f87171' }} onClick={onLogout}><LogOut size={20} /> <span>Déconnexion</span></div>
        </nav>
      </aside>

      <main className="main-content">
        <header style={{ marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>
                {activeTab === 'dashboard' && 'Traitement Intelligent'}
                {activeTab === 'invoices' && 'Générateur de Factures'}
                {activeTab === 'history' && 'Historique des Activités'}
                {activeTab === 'settings' && 'Paramètres du SaaS'}
            </h1>
        </header>

        {errorMessage && <div style={{ backgroundColor: 'rgba(239,68,68,0.2)', color: '#f87171', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', gap: '10px' }}><AlertCircle size={20} /> {errorMessage}</div>}
        {infoMessage && <div style={{ backgroundColor: 'rgba(16,185,129,0.2)', color: '#34d399', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', gap: '10px' }}><CheckCircle size={20} /> {infoMessage}</div>}

        {activeTab === 'dashboard' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
              <StatCard title="Emails Traités" value={stats.total_processed} icon={Activity} color="#6366f1" />
              <StatCard title="Urgences" value={stats.high_urgency} icon={AlertTriangle} color="#ef4444" />
              <StatCard title="Devis" value={stats.devis_requests} icon={Euro} color="#10b981" />
            </div>
            <div className="dashboard-grid">
              <div className="card">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}><Mail size={20} color="var(--accent)" /> Email du Client</h2>
                <div className="form-group"><label>Expéditeur</label><input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} /></div>
                <div className="form-group"><label>Sujet</label><input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
                <div className="form-group"><label>Contenu</label><textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} /></div>
                <button className="btn btn-primary" onClick={handleAnalyse} disabled={isAnalyzing}>{isAnalyzing ? "Analyse..." : "Analyser"} <Zap size={18} /></button>
              </div>
              {analyse && (
                <>
                  <div className="card" style={{ borderColor: 'var(--accent)' }}>
                    <h3 style={{ marginBottom: '1rem' }}>📊 Analyse IA</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div><label>Catégorie</label><div className="badge badge-info">{analyse.category}</div></div>
                      <div><label>Urgence</label><div className={`badge ${analyse.urgency === 'haute' ? 'badge-danger' : 'badge-success'}`}>{analyse.urgency}</div></div>
                    </div>
                    <div style={{ marginTop: '1rem' }}><label>Résumé</label><p>{analyse.summary}</p></div>
                  </div>
                  <div className="card">
                    <h3 style={{ marginBottom: '1rem' }}>✍️ Réponse</h3>
                    <div className="form-group"><label>Objet</label><input type="text" value={replySubject} onChange={(e) => setReplySubject(e.target.value)} /></div>
                    <div className="form-group"><label>Corps</label><textarea rows={10} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} /></div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-success" onClick={handleSendEmail} disabled={isSending}>{isSending ? "Envoi..." : "Envoyer"} <Send size={18} /></button></div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
        {activeTab === 'invoices' && <div style={{ maxWidth: '800px', margin: '0 auto' }}><InvoiceGenerator /></div>}
        {activeTab === 'history' && <EmailHistory token={token} />}
        {activeTab === 'settings' && <SettingsPanel token={token} />}
      </main>
    </div>
  );
}

export default App;