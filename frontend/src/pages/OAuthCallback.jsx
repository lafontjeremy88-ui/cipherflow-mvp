import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function OAuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (token) {
      localStorage.setItem("token", token); // ou ton système actuel
      navigate("/dashboard", { replace: true });
    } else {
      navigate("/login?error=oauth", { replace: true });
    }
  }, [navigate]);

  return <div style={{ padding: 24 }}>Connexion en cours…</div>;
}
