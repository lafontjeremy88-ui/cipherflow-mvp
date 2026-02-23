import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const LS_TOKEN = "cipherflow_token";
const LS_EMAIL = "cipherflow_email";

function getCookie(name) {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="))
    ?.split("=")[1] || null;
}

function deleteCookie(name) {
  document.cookie = `${name}=; max-age=0; path=/`;
}

function parseJwtEmail(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.email || null;
  } catch {
    return null;
  }
}

export default function OAuthCallback({ onSuccess }) {
  const navigate = useNavigate();

  useEffect(() => {
    // P2 : lecture depuis cookie HttpOnly au lieu de ?token= dans l'URL
    const token = getCookie("oauth_token");

    if (!token) {
      navigate("/", { replace: true });
      return;
    }

    // Nettoyage immédiat du cookie
    deleteCookie("oauth_token");

    // Extraction email depuis le JWT (pas de requête réseau)
    const email = parseJwtEmail(token);

    localStorage.setItem(LS_TOKEN, token);
    if (email) localStorage.setItem(LS_EMAIL, email);

    if (typeof onSuccess === "function") {
      onSuccess(token, email);
    }

    navigate("/", { replace: true });
  }, [navigate, onSuccess]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ padding: 20 }}>
        <h3>Connexion en cours...</h3>
        <p>On finalise la session.</p>
      </div>
    </div>
  );
}
