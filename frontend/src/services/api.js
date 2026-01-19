// frontend/src/services/api.js

// ==============================
// Config
// ==============================
export const API_URL =
  import.meta.env.VITE_API_URL?.trim() ||
  "https://cipherflow-mvp-production.up.railway.app";

export const LS_TOKEN = "cipherflow_token";
export const LS_EMAIL = "cipherflow_email";

// ==============================
// Storage helpers
// ==============================
export function getToken() {
  return localStorage.getItem(LS_TOKEN);
}

export function setToken(token) {
  if (token) localStorage.setItem(LS_TOKEN, token);
}

export function getEmail() {
  return localStorage.getItem(LS_EMAIL);
}

export function setEmail(email) {
  if (email) localStorage.setItem(LS_EMAIL, email);
}

export function clearAuth() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_EMAIL);
}

// ==============================
// URL + JSON helpers
// ==============================
export function buildUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${p}`;
}

export async function safeJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text; // fallback si backend renvoie autre chose
  }
}

// ==============================
// Public fetch (sans token)
// ==============================
export async function apiPublicFetch(path, options = {}) {
  const url = buildUrl(path);

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "include", // utile si backend pose cookie refresh
  });

  const data = await safeJson(res);

  if (!res.ok) {
    const msg =
      (data && (data.detail || data.message || data.error)) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

// ==============================
// Auth fetch (avec Bearer token)
// - si 401 => tente refresh => retry 1 fois
// ==============================
export async function authFetch(path, options = {}) {
  const url = buildUrl(path);

  const doRequest = async (accessToken) => {
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    };

    const isFormData = options.body instanceof FormData;
    if (!isFormData && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    if (isFormData) {
      delete headers["Content-Type"];
      delete headers["content-type"];
    }

    return fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });
  };

  const token = getToken();
  if (!token) {
    throw new Error("Non authentifié : token absent.");
  }

  // 1) requête normale
  let res = await doRequest(token);

  // 2) si 401 => refresh => retry
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      clearAuth();
      throw new Error("Session expirée, veuillez vous reconnecter.");
    }
    res = await doRequest(newToken);
  }

  return res;
}

// ==============================
// Refresh token (cookie HttpOnly)
// ==============================
export async function refreshAccessToken() {
  try {
    const res = await fetch(buildUrl("/auth/refresh"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) return null;

    const data = await safeJson(res);
    const newAccess =
      data?.access_token || data?.token || data?.accessToken || null;

    if (newAccess) {
      setToken(newAccess);
      return newAccess;
    }

    return null;
  } catch {
    return null;
  }
}

// ==============================
// API calls
// ==============================
export async function login(email, password) {
  // adapte si ton backend attend un autre schema
  const data = await apiPublicFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  const token = data?.access_token || data?.token || data?.accessToken;
  if (token) setToken(token);
  setEmail(email);

  return data;
}

export async function logout() {
  // si ton backend a /auth/logout (sinon ça ne casse rien)
  try {
    await fetch(buildUrl("/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // ignore
  } finally {
    clearAuth();
  }
}

export async function getDashboardStats() {
  const res = await authFetch("/dashboard/stats");
  const data = await safeJson(res);

  if (!res.ok) {
    throw new Error(data?.detail || "Erreur récupération stats.");
  }

  // On renvoie DIRECTEMENT les stats (pas {res,data})
  return data;
}

// ==============================
// Tenant files - unlink document from tenant
// ==============================
export async function unlinkDocumentFromTenant(tenantId, fileId) {
  const res = await authFetch(`/tenant-files/${tenantId}/documents/${fileId}`, {
    method: "DELETE",
  });

  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.detail || "Impossible de retirer le document du dossier.");
  }

  return data; // { status, tenant_id, file_id, new_status, checklist }
}


// ==============================
// Email verification
// ==============================
export async function resendVerificationEmail(email) {
  return apiPublicFetch("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
export async function forgotPassword(email) {
  return apiPublicFetch("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token, new_password) {
  return apiPublicFetch("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password }),
  });
}
