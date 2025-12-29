import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

// On récupère l'URL depuis l'environnement ou on utilise une valeur par défaut vide
const API_BASE = import.meta.env.VITE_API_URL || "";

const originalFetch = window.fetch;

window.fetch = async (input, init = {}) => {
  try {
    const url = typeof input === "string" ? input : input.url;

    // On ne touche qu'aux appels vers ton backend (si API_BASE est défini)
    // ou si l'URL est relative (commence par /)
    const isApiCall = (API_BASE && url.startsWith(API_BASE)) || url.startsWith("/");

    if (isApiCall) {
      const token = localStorage.getItem("cipherflow_token");
      const headers = new Headers(init.headers || {});

      // Ajoute le JWT si présent et pas déjà défini
      if (token && !headers.get("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      // CORRECTION ICI :
      // On ajoute 'application/json' SEULEMENT si ce n'est pas du FormData.
      // Si c'est du FormData (upload de fichier), on laisse le navigateur gérer (multipart/form-data).
      const isFormData = init.body instanceof FormData;
      
      if (!headers.get("Content-Type") && init.body && !isFormData) {
        headers.set("Content-Type", "application/json");
      }

      init = { ...init, headers };
    }

    return originalFetch(input, init);
  } catch (e) {
    console.error("Fetch error:", e);
    return originalFetch(input, init);
  }
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);