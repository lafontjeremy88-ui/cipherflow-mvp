const API_URL = import.meta.env.VITE_API_URL;

function getToken() {
  return (
    localStorage.getItem("cipherflow_token") ||
    localStorage.getItem("token") ||
    null
  );
}

export async function apiFetch(path, options = {}) {
  const token = getToken();

  const isFormData =
    options.body instanceof FormData ||
    (typeof FormData !== "undefined" &&
      options.body &&
      options.body.constructor?.name === "FormData");

  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // ✅ IMPORTANT : si FormData, on SUPPRIME tout Content-Type existant
  if (isFormData) {
    delete headers["Content-Type"];
    delete headers["content-type"];
  } else {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body: isFormData
      ? options.body
      : options.body
      ? JSON.stringify(options.body)
      : undefined,
  });

  if (response.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("cipherflow_token");
    window.location.href = "/login";
    return;
  }

  return response;
}
