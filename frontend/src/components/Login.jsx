// Import de React et du hook useState pour gérer l’état du composant
import React, { useState } from 'react';

// Import des icônes utilisées dans l’interface (UI)
import { Lock, Mail, ArrowRight, Zap } from 'lucide-react';

// Composant Login
// onLogin est une fonction passée par le parent pour stocker le token après connexion
const Login = ({ onLogin }) => {

  // État pour stocker l’email saisi par l’utilisateur
  const [email, setEmail] = useState('');

  // État pour stocker le mot de passe saisi
  const [password, setPassword] = useState('');

  // État pour afficher un message d’erreur en cas d’échec
  const [error, setError] = useState('');

  // État pour afficher un loader pendant la requête
  const [loading, setLoading] = useState(false);

  // Fonction déclenchée lors de la soumission du formulaire classique
  const handleSubmit = async (e) => {
    // Empêche le rechargement automatique de la page
    e.preventDefault();

    // Active l’état de chargement
    setLoading(true);

    // Réinitialise les erreurs précédentes
    setError('');

    try {
      // Appel API vers le backend pour un login email/mot de passe
      const res = await fetch(
        'https://cipherflow-mvp-production.up.railway.app/auth/login',
        {
          method: 'POST', // Méthode HTTP POST
          headers: {
            'Content-Type': 'application/json', // Envoi de JSON
          },
          body: JSON.stringify({
            email,     // Email utilisateur
            password,  // Mot de passe utilisateur
          }),
        }
      );

      // Si le backend répond avec une erreur (401, 403, etc.)
      if (!res.ok) {
        throw new Error('Identifiants incorrects');
      }

      // Conversion de la réponse en JSON
      const data = await res.json();

      // Stockage du token JWT dans le navigateur
      localStorage.setItem('cipherflow_token', data.access_token);

      // Appel de la fonction parent pour mettre à jour l’état global
      onLogin(data.access_token, data.user_email);

    } catch (err) {
      // En cas d’erreur, on affiche le message
      setError(err.message);
    } finally {
      // On désactive le loader quoi qu’il arrive
      setLoading(false);
    }
  };

  // Fonction déclenchée quand on clique sur "Continuer avec Google"
  const handleGoogleLogin = () => {
    // Redirection directe vers le backend
    // Le backend s’occupe ensuite de Google OAuth
    window.location.href =
      `${import.meta.env.VITE_API_URL}/auth/google/login`;
  };

  // Rendu du composant
  return (
    <div
      style={{
        height: '100vh',               // Pleine hauteur écran
        display: 'flex',               // Flexbox
        alignItems: 'center',          // Centrage vertical
        justifyContent: 'center',      // Centrage horizontal
        backgroundColor: '#0f172a',    // Fond sombre
        color: 'white',                // Texte blanc
      }}
    >
      {/* Carte centrale */}
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '400px',           // Largeur max
          padding: '2.5rem',           // Espacement intérieur
        }}
      >
        {/* En-tête */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '12px',
              borderRadius: '50%',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              marginBottom: '1rem',
            }}
          >
            {/* Icône */}
            <Zap size={32} color="#6366f1" />
          </div>

          {/* Titre */}
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
            CipherFlow
          </h1>

          {/* Sous-titre */}
          <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>
            Connexion à l'espace pro
          </p>
        </div>

        {/* Formulaire de login classique */}
        <form onSubmit={handleSubmit}>

          {/* Champ Email */}
          <div className="form-group">
            <label>Email</label>
            <div style={{ position: 'relative' }}>
              <Mail
                size={18}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '12px',
                  color: '#94a3b8',
                }}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: '40px' }}
                placeholder="admin@cipherflow.com"
                required
              />
            </div>
          </div>

          {/* Champ Mot de passe */}
          <div className="form-group">
            <label>Mot de passe</label>
            <div style={{ position: 'relative' }}>
              <Lock
                size={18}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '12px',
                  color: '#94a3b8',
                }}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '40px' }}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {/* Message d’erreur */}
          {error && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#f87171',
                padding: '0.75rem',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                fontSize: '0.9rem',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          {/* Bouton login classique */}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
            <ArrowRight size={18} />
          </button>
        </form>

        {/* Bouton Google OAuth */}
        <div style={{ marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={handleGoogleLogin}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid #334155',
              backgroundColor: '#020617',
              color: '#e5e7eb',
              cursor: 'pointer',
              fontSize: '0.95rem',
            }}
          >
            Continuer avec Google
          </button>
        </div>

      </div>
    </div>
  );
};

// Export du composant pour l’utiliser ailleurs dans l’app
export default Login;
