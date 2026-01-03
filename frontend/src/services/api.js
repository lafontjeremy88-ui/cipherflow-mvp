// frontend/src/services/api.js
const API_URL = import.meta.env.VITE_API_URL;

const LS_TOKEN = "cipherflow_token";

function getToken() {
  return (
    localStorage.getItem(LS_TOKEN) ||
    localStorage.getItem("token") ||
    null
  );
}

function setToken(t) {
  if (t) localStorage.setItem(LS_TOKEN, t);
}

function clearToken() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem("token");
}

function isFormDataBody(body) {
  return (
    body instanceof FormData ||
    (typeof FormData !== "undefined" && body && body.constructor?.name === "FormData")
  );
}

async function callRefresh() {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include", // ✅ indispensable pour envoyer/recevoir le cookie refresh
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  if (data?.access_token) {
    setToken(data.access_token);
    return data.access_token;
  }
  return null;
}

export async function apiFetch(path, options = {}) {
  const formData = isFormDataBody(options.body);

  const headers = {
    ...(options.headers || {}),
    ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
  };

  // ✅ FormData => ne pas forcer Content-Type
  if (formData) {
    delete headers["Content-Type"];
    delete headers["content-type"];
  } else {
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  const doFetch = async () =>
    fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: "include", // ✅ IMPORTANT : pour le cookie refresh
    });

  let res = await doFetch();

  // 401 -> refresh -> retry 1 fois
  if (res.status === 401) {
    const newAccess = await callRefresh();

    if (!newAccess) {
      clearToken();
      window.location.href = "/auth";
      return res;
    }

    headers.Authorization = `Bearer ${newAccess}`;
    res = await doFetch();

    if (res.status === 401) {
      clearToken();
      window.location.href = "/auth";
    }
  }

  return res;
}
