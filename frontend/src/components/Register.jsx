import React, { useState } from 'react';
import { UserPlus, Mail, Lock, ArrowRight } from 'lucide-react';

const Register = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('https://cipherflow-mvp-production.up.railway.app/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('cipherflow_token', data.access_token);
        
        // MODIFICATION ICI : On passe aussi l'email reçu !
        onLogin(data.access_token, data.user_email);
        
      } else {
        setError(data.detail || "Erreur lors de l'inscription");
      }
    } catch (err) {
      setError("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ background: 'rgba(99, 102, 241, 0.1)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <UserPlus size={30} color="#6366f1" />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Créer un compte</h2>
          <p style={{ color: '#94a3b8' }}>Rejoignez CipherFlow gratuitement</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label><Mail size={16} style={{ display: 'inline', marginRight: '8px' }}/> Email</label>
            <input 
              type="email" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
            />
          </div>

          <div className="form-group">
            <label><Lock size={16} style={{ display: 'inline', marginRight: '8px' }}/> Mot de passe</label>
            <input 
              type="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <div style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '8px' }}>{error}</div>}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Création...' : 'S\'inscrire'} <ArrowRight size={18} style={{ marginLeft: '8px' }}/>
          </button>
        </form>
        
        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.9rem', color: '#94a3b8' }}>
            Déjà un compte ? <a href="#" onClick={() => window.location.reload()} style={{ color: '#6366f1', textDecoration: 'none' }}>Se connecter</a>
        </div>
      </div>
    </div>
  );
};

export default Register;