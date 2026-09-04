// ─────────────────────────────────────────────────────────────────────────────
// moviesApi — talks to the Express/MongoDB backend at /api/movies.
// ─────────────────────────────────────────────────────────────────────────────

const rawBase = import.meta.env.VITE_API_BASE_URL;
const baseUrl = rawBase
  ? rawBase.trim().replace(/\/+$/, "")
  : (import.meta.env.DEV ? "http://localhost:5000" : "");

const API = baseUrl ? `${baseUrl}/api/movies` : "/api/movies";

export const moviesApi = {
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
    if (!res.ok) throw new Error("Failed to add movie");
    return res.json();
  },

  async update(movie) {
    const res = await fetch(`${API}/${movie.tmdbId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(movie),
    });
    if (!res.ok) throw new Error("Failed to update movie");
    return res.json();
  },

  async remove(tmdbId) {
    const res = await fetch(`${API}/${tmdbId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete movie");
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
