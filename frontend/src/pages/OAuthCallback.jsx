import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function OAuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);

    // ton backend peut renvoyer token=... et optionnellement user=...
    const token = params.get("token");
    const user = params.get("user"); // optionnel

    if (!token) {
      // pas de token => on retourne au login
      navigate("/login", { replace: true });
      return;
    }

    localStorage.setItem("cf_token", token);
    if (user) localStorage.setItem("cf_user", user);

    // Nettoyage URL + redirection
    navigate("/dashboard", { replace: true });
  }, [location.search, navigate]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ padding: 20 }}>
        <h3>Connexion en cours...</h3>
        <p>On finalise la session.</p>
      </div>
    </div>
  );
}
