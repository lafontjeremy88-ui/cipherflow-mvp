import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App.jsx";
import "./index.css";
import "./App.css";

// ── Sentry — error tracking ─────────────────────────────────────────────────
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  import("@sentry/react").then((Sentry) => {
    Sentry.init({
      dsn: sentryDsn,
      tracesSampleRate: 0.1,
      environment: import.meta.env.VITE_ENVIRONMENT || "production",
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
