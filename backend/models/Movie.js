import mongoose from "mongoose";

const downloadLinkSchema = new mongoose.Schema({
  resolution: String,
  quality: String,
  audioTag: String,
  size: String,
  customSuffix: String,
  label: String,
  downloadLink: String,
  episodeLink: String,
  batchLink: String,
  seasons: [
    {
      season: Number,
      batchLink: String,
      episodes: [
        {
          episodeNumber: Number,
          episodeLink: String,
        },
      ],
    },
  ],
}, { _id: false });

const movieSchema = new mongoose.Schema(
  {
    tmdbId:      { type: Number, required: true, unique: true },
    mediaType:   { type: String, enum: ["movie", "tv"], required: true },
    title:       { type: String, required: true },
    poster:      String,
    genre:       String,
    lang:        { type: String, default: "English" },
    imdbID:      { type: String, default: "" },
    overview:    { type: String, default: "" },
    rating:      { type: Number, default: 0 },
    votes:       { type: Number, default: 0 },
    runtime:     Number,
    released:    String,
    director:    { type: String, default: "" },
    writer:      { type: String, default: "" },
    actors:      [{ type: String }],
    downloadLinks: [downloadLinkSchema],
    seasonEpisodes: [downloadLinkSchema],
    screenshots: [{ type: String }],
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Movie = mongoose.model("Movie", movieSchema);

export default Movie;
