import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function OAuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      navigate("/login?error=oauth_missing_token", { replace: true });
      return;
    }

    localStorage.setItem("token", token);

    // Nettoie l’URL (optionnel) + redirection dashboard
    navigate("/dashboard", { replace: true });
  }, [navigate]);

  return <div style={{ padding: 24 }}>Connexion en cours…</div>;
}
