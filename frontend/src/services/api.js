// frontend/src/services/api.js

const LS_TOKEN = "cipherflow_token";
const LS_EMAIL = "cipherflow_email";

// Ton backend Railway (tu peux aussi le mettre dans Vercel: VITE_API_URL)
export const API_URL =
  import.meta.env.VITE_API_URL || "https://cipherflow-mvp-production.up.railway.app";

export function getToken() {
  return localStorage.getItem(LS_TOKEN) || "";
}

export function setToken(token) {
  if (token) localStorage.setItem(LS_TOKEN, token);
}

export function clearToken() {
  localStorage.removeItem(LS_TOKEN);
}

export function getEmail() {
  return localStorage.getItem(LS_EMAIL) || "";
}

export function setEmail(email) {
  if (email) localStorage.setItem(LS_EMAIL, email);
}

export function clearEmail() {
  localStorage.removeItem(LS_EMAIL);
}

export function clearAuth() {
  clearToken();
  clearEmail();
}

export function isAuthed() {
  return !!getToken();
}

export function buildUrl(path) {
  // path doit être du type "/auth/login", "/dashboard/stats" etc.
  return `${API_URL}${path}`;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Appel API bas niveau
 * - credentials: "include" indispensable pour envoyer/recevoir le refresh_token cookie
 */
export async function apiFetch(path, options = {}) {
  const url = buildUrl(path);

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
    credentials: "include",
  });

  return res;
}

/**
 * Refresh access token via cookie HttpOnly refresh_token
 */
export async function refreshAccessToken() {
  const res = await apiFetch("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    return { ok: false, status: res.status };
  }

  const data = await safeJson(res);

  if (data?.access_token) {
    setToken(data.access_token);
  }
  if (data?.user_email) {
    setEmail(data.user_email);
  }

  return { ok: true, data };
}

/**
 * Fetch authentifié:
 * - Ajoute Authorization Bearer
 * - Si 401 -> tente refresh -> rejoue la requête 1 fois
 */
export async function authFetch(path, options = {}) {
  const token = getToken();

  const first = await apiFetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: token ? `Bearer ${token}` : "",
    },
  });

  if (first.status !== 401) return first;

  // 401 -> on tente refresh puis retry une seule fois
  const refreshed = await refreshAccessToken();
  if (!refreshed.ok) {
    clearAuth();
    return first; // renvoie le 401 initial
  }

  const token2 = getToken();

  const retry = await apiFetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: token2 ? `Bearer ${token2}` : "",
    },
  });

  return retry;
}

// -------------------- AUTH --------------------

export async function login(email, password) {
  const res = await apiFetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await safeJson(res);

  if (!res.ok) {
    const msg = data?.detail || "Login failed";
    throw new Error(msg);
  }

  if (data?.access_token) setToken(data.access_token);
  if (data?.user_email) setEmail(data.user_email);
  else setEmail(email);

  return data;
}

export async function register(email, password) {
  const res = await apiFetch("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await safeJson(res);

  if (!res.ok) {
    const msg = data?.detail || "Register failed";
    throw new Error(msg);
  }

  return data;
}

export async function logout() {
  // On appelle le backend pour nettoyer cookie refresh côté serveur si tu le fais
  await apiFetch("/auth/logout", { method: "POST" });
  clearAuth();
}

// -------------------- DATA --------------------

export async function getDashboardStats() {
  const res = await authFetch("/dashboard/stats");
  const data = await safeJson(res);
  return { res, data };
}
