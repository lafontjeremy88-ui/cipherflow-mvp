// frontend/src/pages/OAuthCallback.jsx
import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function OAuthCallback({ onLogin }) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("token");
    const email = params.get("email");

    if (!token) {
      navigate("/login");
      return;
    }

    localStorage.setItem("cipherflow_token", token);

    // si ton app utilise onLogin(token, email) comme ton Login.jsx
    if (typeof onLogin === "function") {
      onLogin(token, email || "");
    }

    navigate("/dashboard");
  }, [location.search, navigate, onLogin]);

  return (
    <div style={{ padding: 24, color: "white" }}>
      Connexion Google en cours...
    </div>
  );
}
