import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";
const API_BASE = import.meta.env.VITE_API_URL; // doit déjà exister dans ton projet

const originalFetch = window.fetch;

window.fetch = async (input, init = {}) => {
  try {
    const url = typeof input === "string" ? input : input.url;

    // On ne touche qu'aux appels vers ton backend
    const isApiCall = API_BASE && url.startsWith(API_BASE);

    if (isApiCall) {
      const token = localStorage.getItem("token");
      const headers = new Headers(init.headers || {});

      // Ajoute le JWT si présent et pas déjà défini
      if (token && !headers.get("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      // Si tu envoies du JSON, on aide un peu
      if (!headers.get("Content-Type") && init.body) {
        headers.set("Content-Type", "application/json");
      }

      init = { ...init, headers };
    }

    return originalFetch(input, init);
  } catch (e) {
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
