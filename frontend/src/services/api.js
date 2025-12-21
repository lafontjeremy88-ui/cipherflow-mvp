const API_URL = import.meta.env.VITE_API_URL;

function getToken() {
  return (
    localStorage.getItem("cipherflow_token") ||
    localStorage.getItem("token") || // fallback si un ancien token existe encore
    null
  );
}

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("token");

  const isFormData =
    options.body instanceof FormData ||
    (typeof FormData !== "undefined" && options.body && options.body.constructor?.name === "FormData");

  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    // IMPORTANT:
    // On ne met PAS Content-Type si c'est un FormData.
    // Le navigateur le mettra tout seul avec le boundary.
    ...(!isFormData ? { "Content-Type": "application/json" } : {}),
  };

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    return;
  }

  return response;
}