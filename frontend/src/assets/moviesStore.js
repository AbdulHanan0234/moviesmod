const PLACEHOLDER =
  "https://placehold.co/300x450/09090b/e4e4e7/png?text=No+Poster";

// Turn a raw stored/published entry into the canonical movie shape used
// across the app (HomePage, Postcards, MovieDetails).
export const transformPublished = (entry) => {
  const isTv = entry.mediaType === "tv";

  // Normalise download links: each quality carries an optional `seasons`
  // array. Older entries stored episodes separately in `seasonEpisodes`;
  // merge that into each quality so everything lives in one place.
  const downloadLinks = (Array.isArray(entry.downloadLinks) ? entry.downloadLinks : []).map(
    (d) => {
      if (isTv && (!d.seasons || d.seasons.length === 0) && Array.isArray(entry.seasonEpisodes) && entry.seasonEpisodes.length) {
        return { ...d, seasons: entry.seasonEpisodes };
      }
      return d;
    }
  );

  return {
    id: Number(entry.tmdbId),
    title: entry.title || "Untitled",
    genre: entry.genre || "",
    lang: entry.lang || "English",
    type: isTv ? "Series" : "Movie",
    imageUrl: entry.poster || PLACEHOLDER,
    link: "#",
    uploadedAt: entry.publishedAt ? new Date(entry.publishedAt) : new Date(),
    _published: true,
    downloadLinks,
    seasonEpisodes: Array.isArray(entry.seasonEpisodes) ? entry.seasonEpisodes : [],
    imdbID: entry.imdbID || "",
    overview: entry.overview || "",
    rating: entry.rating || 0,
    votes: entry.votes || 0,
    runtime: entry.runtime || null,
    released: entry.released || "",
    director: entry.director || "",
    writer: entry.writer || "",
    actors: entry.actors || [],
  };
};
