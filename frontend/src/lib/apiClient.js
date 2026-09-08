import { useAuthStore } from '@/stores/authStore';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

/**
 * An HTTP error carrying the server's status and validation details, so a
 * caller can branch on `err.status` and render `err.details` under fields.
 */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  /** Field-name -> message, for react-hook-form's setError. */
  get fieldErrors() {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(this.details.map((d) => [d.path, d.message]));
  }
}

function buildUrl(path, params) {
  const url = `${BASE_URL}${path}`;
  if (!params) return url;
  const search = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * The single place that talks to the API.
 *
 * Attaches the bearer token, unwraps JSON, converts non-2xx into ApiError,
 * and signs the user out on a 401 so a stale token cannot leave the UI in a
 * half-authenticated state.
 */
async function request(path, { method = 'GET', body, params, signal, isFormData = false } = {}) {
  const token = useAuthStore.getState().token;

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isFormData) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the server. Check your connection.');
  }

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token) {
      useAuthStore.getState().signOut();
    }
    throw new ApiError(response.status, payload.error ?? response.statusText, payload.details);
  }

  return payload;
}

export const api = {
  get: (path, params, options) => request(path, { ...options, params }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  postForm: (path, formData, options) =>
    request(path, { ...options, method: 'POST', body: formData, isFormData: true }),
};
