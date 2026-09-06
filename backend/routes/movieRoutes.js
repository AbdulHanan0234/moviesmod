import express from "express";
import Movie from "../models/Movie.js";

const router = express.Router();

// GET /api/movies — list all published movies
router.get("/", async (req, res) => {
  try {
    const movies = await Movie.find().sort({ publishedAt: -1 });
    res.json(movies);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/movies/:tmdbId — get a single movie by TMDB ID
router.get("/:tmdbId", async (req, res) => {
  try {
    const movie = await Movie.findOne({ tmdbId: Number(req.params.tmdbId) });
    if (!movie) return res.status(404).json({ message: "Movie not found" });
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
    const movie = await Movie.create(req.body);
    res.status(201).json(movie);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

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

// PUT /api/movies/:tmdbId — update an existing movie (Requires Admin)
router.put("/:tmdbId", verifyAdmin, async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (!updateData.poster) {
      delete updateData.poster;
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
