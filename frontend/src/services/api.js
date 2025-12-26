// frontend/src/services/api.js
const API_URL = import.meta.env.VITE_API_URL;

function getToken() {
  return (
    localStorage.getItem("cipherflow_token") || // ✅ ton token actuel
    localStorage.getItem("token") ||            // fallback ancien
    null
  );
}

function isFormDataBody(body) {
  return (
    body instanceof FormData ||
    (typeof FormData !== "undefined" && body && body.constructor?.name === "FormData")
  );
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const formData = isFormDataBody(options.body);

  // Base headers
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // ✅ IMPORTANT :
  // - Si FormData => surtout PAS de Content-Type (le navigateur met multipart/form-data; boundary=...)
  // - Si JSON => on met application/json
  if (formData) {
    // si un ancien code l'avait mis, on le supprime
    delete headers["Content-Type"];
    delete headers["content-type"];
  } else {
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem("cipherflow_token");
    localStorage.removeItem("token");
    window.location.href = "/login";
    return res;
  }

  return res;
}
