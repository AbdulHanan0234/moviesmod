
const rawBase = import.meta.env.VITE_API_BASE_URL;
const baseUrl = rawBase
  ? rawBase.trim().replace(/\/+$/, "")
  : (import.meta.env.DEV ? "http://localhost:5000" : "");

const API = baseUrl ? `${baseUrl}/api/movies` : "/api/movies";

const ADMIN_KEY = "moviesmod_admin_pass";

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

  async list() {
    const res = await fetch(API);
    if (!res.ok) throw new Error("Failed to fetch movies");
    return res.json();
  },

  async add(movie) {
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
