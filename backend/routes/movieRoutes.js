import express from "express";
import Movie from "../models/Movie.js";

const router = express.Router();

// Only these fields are accepted from clients on create/update — everything
// else in the request body is ignored (keeps tmdbId/publishedAt trustworthy).
const MOVIE_FIELDS = [
  "tmdbId",
  "mediaType",
  "title",
  "poster",
  "genre",
  "lang",
  "imdbID",
  "overview",
  "rating",
  "votes",
  "runtime",
  "released",
  "director",
  "writer",
  "actors",
  "downloadLinks",
  "seasonEpisodes",
  "screenshots",
];

const pickMovieFields = (body) =>
  MOVIE_FIELDS.reduce((data, field) => {
    if (body[field] !== undefined) data[field] = body[field];
    return data;
  }, {});

// Middleware to verify admin password for edit and delete operations
const verifyAdmin = (req, res, next) => {
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) {
    return res.status(500).json({ message: "ADMIN_PASSWORD is not configured on the server" });
  }
  const providedPass = req.headers["x-admin-password"];
  if (!providedPass || providedPass !== adminPass) {
    return res.status(401).json({ message: "Unauthorized: Invalid or missing admin password" });
  }
  next();
};

// POST /api/movies/verify-admin — verify admin password from client
router.post("/verify-admin", (req, res) => {
  const adminPass = process.env.ADMIN_PASSWORD;
  const { password } = req.body || {};
  if (!adminPass) {
    return res.status(500).json({ success: false, message: "ADMIN_PASSWORD is not configured on the server" });
  }
  if (password === adminPass) {
    return res.json({ success: true, message: "Admin verified successfully" });
  }
  return res.status(401).json({ success: false, message: "Invalid admin password" });
});

// List responses skip the heavy per-title arrays (download links with
// per-episode URLs, screenshots). The grid/sidebar never render them — pages
// that do fetch them use the single-movie endpoint below.
const LIST_PROJECTION = "-downloadLinks -seasonEpisodes -screenshots -overview -__v";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 60;

// GET /api/movies — list published movies
//   ?page=2&limit=20 — one page (default view)
//   ?all=1           — every movie, light fields (tag/search pages filter client-side)
// Returns { movies, total, page, totalPages }.
router.get("/", async (req, res) => {
  try {
    const sort = { publishedAt: -1, tmdbId: -1 };

    if (req.query.all === "1") {
      const movies = await Movie.find()
        .select(LIST_PROJECTION)
        .sort(sort)
        .lean();
      res.set("Cache-Control", "no-cache"); // revalidate → cheap 304s
      return res.json({
        movies,
        total: movies.length,
        page: 1,
        totalPages: 1,
      });
    }

    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE)
    );
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const [movies, total] = await Promise.all([
      Movie.find()
        .select(LIST_PROJECTION)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Movie.countDocuments(),
    ]);

    res.set("Cache-Control", "no-cache");
    res.json({
      movies,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/movies/:tmdbId — get a single movie by TMDB ID (full document)
router.get("/:tmdbId", async (req, res) => {
  try {
    const movie = await Movie.findOne({ tmdbId: Number(req.params.tmdbId) }).lean();
    if (!movie) return res.status(404).json({ message: "Movie not found" });
    res.set("Cache-Control", "no-cache");
    res.json(movie);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/movies — add a new published movie
router.post("/", async (req, res) => {
  try {
    const existing = await Movie.findOne({ tmdbId: req.body.tmdbId });
    if (existing) {
      return res.status(409).json({ message: "Movie already exists" });
    }
    const movie = await Movie.create(pickMovieFields(req.body));
    res.status(201).json(movie);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT /api/movies/:tmdbId — update an existing movie (Requires Admin)
router.put("/:tmdbId", verifyAdmin, async (req, res) => {
  try {
    const updateData = pickMovieFields(req.body);
    delete updateData.tmdbId; // the URL param identifies the movie — never rename it
    if (!updateData.poster) {
      delete updateData.poster; // don't wipe a saved poster with an empty value
    }
    const movie = await Movie.findOneAndUpdate(
      { tmdbId: Number(req.params.tmdbId) },
      updateData,
      { new: true, runValidators: true }
    );
    if (!movie) return res.status(404).json({ message: "Movie not found" });
    res.json(movie);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE /api/movies/:tmdbId — remove a movie (Requires Admin)
router.delete("/:tmdbId", verifyAdmin, async (req, res) => {
  try {
    const movie = await Movie.findOneAndDelete({ tmdbId: Number(req.params.tmdbId) });
    if (!movie) return res.status(404).json({ message: "Movie not found" });
    res.json({ tmdbId: movie.tmdbId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
