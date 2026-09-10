
const rawBase = import.meta.env.VITE_API_BASE_URL;
const baseUrl = rawBase
  ? rawBase.trim().replace(/\/+$/, "")
  : (import.meta.env.DEV ? "http://localhost:5000" : "");

const API = baseUrl ? `${baseUrl}/api/movies` : "/api/movies";

const ADMIN_KEY = "moviesmod_admin_pass";

// In-memory cache for list responses so revisiting pages (Home → Details →
// back, or switching tags) doesn't refetch. Cleared by add/update/remove.
const listCache = new Map();

const listKey = (opts = {}) =>
  opts.all ? "all" : `page:${opts.page || 1}:limit:${opts.limit || 20}`;

export const moviesApi = {
  getAdminPassword() {
    return sessionStorage.getItem(ADMIN_KEY) || "";
  },

  setAdminPassword(pass) {
    if (pass) sessionStorage.setItem(ADMIN_KEY, pass);
    else sessionStorage.removeItem(ADMIN_KEY);
  },

  clearAdminPassword() {
    sessionStorage.removeItem(ADMIN_KEY);
  },

  isAdminUnlocked() {
    return Boolean(sessionStorage.getItem(ADMIN_KEY));
  },

  async verifyAdminPassword(password) {
    const res = await fetch(`${API}/verify-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || "Invalid admin password");
    }
    this.setAdminPassword(password);
    return true;
  },

  // list() → { movies, total, page, totalPages }
  //   list({ page, limit }) — one page of light-weight movie docs
  //   list({ all: 1 })      — every movie, light fields (tag/search pages)
  // A backend that hasn't been restarted yet returns a bare array and ignores
  // the pagination params — normalize it so the app works against either.
  async list(opts = {}) {
    const key = listKey(opts);
    if (listCache.has(key)) return listCache.get(key);

    const params = opts.all
      ? "?all=1"
      : `?page=${opts.page || 1}&limit=${opts.limit || 20}`;

    const res = await fetch(`${API}${params}`);
    if (!res.ok) throw new Error("Failed to fetch movies");

    const data = await res.json();
    const normalized = Array.isArray(data)
      ? { movies: data, total: data.length, page: 1, totalPages: 1 }
      : data;
    listCache.set(key, normalized);
    return normalized;
  },

  // get() → the full document for one movie (download links, screenshots…)
  // or null when it doesn't exist.
  async get(tmdbId) {
    const res = await fetch(`${API}/${tmdbId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Failed to fetch movie");
    return res.json();
  },

  async add(movie) {
    listCache.clear();
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(movie),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Failed to add movie");
    }
    return res.json();
  },

  async update(movie, adminPass) {
    listCache.clear();
    const pass = adminPass || this.getAdminPassword();
    const res = await fetch(`${API}/${movie.tmdbId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": pass,
      },
      body: JSON.stringify(movie),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) {
        throw new Error(err.message || "Admin authorization required to edit this movie.");
      }
      throw new Error(err.message || "Failed to update movie");
    }
    return res.json();
  },

  async remove(tmdbId, adminPass) {
    listCache.clear();
    const pass = adminPass || this.getAdminPassword();
    const res = await fetch(`${API}/${tmdbId}`, {
      method: "DELETE",
      headers: {
        "x-admin-password": pass,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) {
        throw new Error(err.message || "Admin authorization required to delete this movie.");
      }
      throw new Error(err.message || "Failed to delete movie");
    }
    return res.json();
  },

  async exists(tmdbId) {
    const res = await fetch(`${API}/${tmdbId}`);
    if (res.status === 404) return false;
    if (!res.ok) throw new Error("Failed to check movie");
    return true;
  },
};

export default moviesApi;
