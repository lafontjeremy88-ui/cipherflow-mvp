// frontend/src/services/api.js

const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://cipherflow-mvp-production.up.railway.app";

const LS_TOKEN = "cipherflow_token";
const LS_EMAIL = "cipherflow_email";

export function getToken() {
  return localStorage.getItem(LS_TOKEN);
}

export function setToken(token) {
  if (token) localStorage.setItem(LS_TOKEN, token);
  else localStorage.removeItem(LS_TOKEN);
}

export function setEmail(email) {
  if (email) localStorage.setItem(LS_EMAIL, email);
  else localStorage.removeItem(LS_EMAIL);
}

export function clearAuth() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_EMAIL);
  localStorage.removeItem("abc"); // nettoyage si ça traîne encore
}

/**
 * Appel PUBLIC (login/register) :
 * - important: credentials: "include" pour accepter Set-Cookie (refresh_token)
 */
export async function apiPublicFetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  return res;
}

/**
 * Refresh access token via cookie HttpOnly refresh_token
 */
export async function refreshAccessToken() {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  if (data?.access_token) {
    setToken(data.access_token);
    return data.access_token;
  }
  return null;
}

/**
 * Appel PROTÉGÉ :
 * - ajoute Authorization Bearer
 * - si 401 : tente un refresh puis rejoue la requête 1 fois
 */
export async function apiFetch(path, options = {}) {
  const token = getToken();

  const doFetch = async (bearer) => {
    const headers = {
      ...(options.headers || {}),
    };

    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    // IMPORTANT: credentials include => envoyer cookie refresh_token
    return fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });
  };

  let res = await doFetch(token);

  // si token expiré => refresh + retry 1 fois
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) return res; // refresh impossible => laisser 401

    res = await doFetch(newToken);
  }

  return res;
}

export async function logout() {
  // supprime côté backend (révocation refresh token) + cookie
  await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => {});

  clearAuth();
}
