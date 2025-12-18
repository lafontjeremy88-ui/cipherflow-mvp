const API_URL = import.meta.env.VITE_API_URL;

function getToken() {
  return (
    localStorage.getItem("cipherflow_token") ||
    localStorage.getItem("token") || // fallback si un ancien token existe encore
    null
  );
}

export async function apiFetch(path, options = {}) {
  const token = getToken();

  const headers = {
    ...(options.headers || {}),
  };

  const isFormData = options.body instanceof FormData;

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Ne force pas Content-Type si FormData (le navigateur gère le boundary)
  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem("cipherflow_token");
    localStorage.removeItem("token");
    window.location.href = "/login";
  }

  return response;
}
