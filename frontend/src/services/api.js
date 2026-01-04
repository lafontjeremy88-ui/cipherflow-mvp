// frontend/src/services/api.js

const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://cipherflow-mvp-production.up.railway.app";

const LS_TOKEN = "cipherflow_token";
const LS_EMAIL = "cipherflow_email";

export function getToken() {
  return localStorage.getItem(LS_TOKEN);
}

export function getEmail() {
  return localStorage.getItem(LS_EMAIL);
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

  // Nettoyage des anciennes clés parasites si elles existent encore
  localStorage.removeItem("abc");
  localStorage.removeItem("token");
  localStorage.removeItem("email");
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Appels PUBLICS (login/register) :
 * - credentials: "include" indispensable pour recevoir le Set-Cookie (refresh_token)
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
 * ✅ LOGIN (email/password)
 * Attendu côté backend :
 * - Set-Cookie refresh_token (HttpOnly)
 * - JSON { access_token, user_email }
 */
export async function login(email, password) {
  const res = await apiPublicFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  const data = await safeJson(res);

  if (!res.ok) {
    // on renvoie une erreur simple (utilisable dans l'UI)
    const msg = data?.detail || data?.message || "Connexion impossible";
    throw new Error(msg);
  }

  const token = data?.access_token;
  const userEmail = data?.user_email || email;

  if (token) setToken(token);
  if (userEmail) setEmail(userEmail);

  return { token, email: userEmail, raw: data };
}

/**
 * (Optionnel) REGISTER si tu as un endpoint backend.
 * Si tu n'en as pas, tu peux supprimer cette fonction.
 */
export async function register(payload) {
  const res = await apiPublicFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const data = await safeJson(res);

  if (!res.ok) {
    const msg = data?.detail || data?.message || "Inscription impossible";
    throw new Error(msg);
  }

  // Certains backends renvoient directement un access_token après register
  if (data?.access_token) {
    setToken(data.access_token);
  }
  if (data?.user_email) {
    setEmail(data.user_email);
  }

  return data;
}

/**
 * ✅ Refresh access token via cookie HttpOnly refresh_token
 * - Si OK : met à jour localStorage + retourne le token
 * - Si KO : retourne null (ne fait pas de logout ici)
 */
export async function refreshAccessToken() {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) return null;

  const data = await safeJson(res);
  const newToken = data?.access_token || null;

  if (newToken) {
    setToken(newToken);
    // email peut rester tel quel en localStorage
    return newToken;
  }

  return null;
}

/**
 * ✅ Appel PROTÉGÉ UNIQUE
 * - Ajoute Authorization Bearer
 * - credentials include pour envoyer cookie refresh_token
 * - Si 401 : tente refresh puis rejoue 1 fois
 */
export async function apiFetch(path, options = {}) {
  const doFetch = async (bearer) => {
    const headers = {
      ...(options.headers || {}),
    };

    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    return fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });
  };

  let token = getToken();
  let res = await doFetch(token);

  // token expiré => refresh + retry 1 fois
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) return res;
    token = newToken;
    res = await doFetch(token);
  }

  return res;
}

/**
 * ✅ Init session au démarrage (silencieux)
 * - si cookie refresh_token existe : récupère un nouvel access_token
 * - retourne { token, email }
 */
export async function initSession() {
  // On tente un refresh même si pas de token local :
  // si le cookie refresh existe, on récupère un token et on restaure la session.
  const newToken = await refreshAccessToken();
  return { token: newToken || getToken() || "", email: getEmail() || "" };
}

/**
 * ✅ Logout PRO
 * - appelle /auth/logout (révoque refresh + supprime cookie)
 * - wipe TOTAL du localStorage auth
 */
export async function logout() {
  await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => {});

  clearAuth();
}
