import { useState, useEffect, useRef } from "react";

const TMDB_IMG = "https://image.tmdb.org/t/p";
export const tmdbPoster = (path, size = "w500") =>
  path ? `${TMDB_IMG}/${size}${path}` : null;
export const tmdbBackdrop = (path, size = "w1280") =>
  path ? `${TMDB_IMG}/${size}${path}` : null;

const tmdbCache = {};

// identifier: { imdbID } for legacy/built-in movies, or
//             { tmdbId, mediaType } for published (user-added) movies.
const useTmdbMovie = (identifier, seasonRange) => {
  const imdbID = identifier?.imdbID;
  const tmdbId = identifier?.tmdbId;
  const mediaTypeHint = identifier?.mediaType;
  const seasonList = seasonRange?.list || [];
  const cacheKey = `${imdbID || tmdbId}_s${seasonList.join(",") || "0"}`;

  const isCacheValid = (key) => Boolean(tmdbCache[key]);

  const prevCacheKeyRef = useRef(cacheKey);

  const [state, setState] = useState(() => {
    if (cacheKey && isCacheValid(cacheKey)) {
      return { data: tmdbCache[cacheKey], loading: false, error: null };
    }
    return { data: null, loading: Boolean(imdbID || tmdbId), error: null };
  });

  useEffect(() => {
    if (prevCacheKeyRef.current !== cacheKey) {
      prevCacheKeyRef.current = cacheKey;
    }

    if (!imdbID && !tmdbId) return;
    if (isCacheValid(cacheKey)) {
      setState({ data: tmdbCache[cacheKey], loading: false, error: null });
      return;
    }

    let cancelled = false;

    setState((s) => ({ ...s, loading: true, error: null }));

    const fetchFromTmdb = async () => {
      try {
        const key = import.meta.env.VITE_TMDB_API_KEY;

        let mediaType = mediaTypeHint;
        let id = tmdbId;
        let detail;

        if (imdbID) {
          const findRes = await fetch(
            `https://api.themoviedb.org/3/find/${imdbID}?api_key=${key}&external_source=imdb_id`
          );
          const findData = await findRes.json();
          if (cancelled) return;

          const movieResult = findData.movie_results?.[0];
          const tvResult = findData.tv_results?.[0];
          mediaType = movieResult ? "movie" : tvResult ? "tv" : null;
          id = movieResult?.id || tvResult?.id;

          if (!id || !mediaType) {
            setState({ data: null, loading: false, error: "Not found on TMDB" });
            return;
          }
        } else if (!id || !mediaType) {
          setState({ data: null, loading: false, error: null });
          return;
        }

        // Start the season fetches now so they run in parallel with the
        // detail request (the id is known by this point on every path).
        const seasonFetch =
          mediaType === "tv" && seasonList.length > 0
            ? Promise.all(
                seasonList.map((sn) =>
                  fetch(`https://api.themoviedb.org/3/tv/${id}/season/${sn}?api_key=${key}`)
                    .then((r) => (r.ok ? r.json() : null))
                    .catch(() => null)
                )
              )
            : null;

        const detailRes = await fetch(
          `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${key}&append_to_response=credits,external_ids,images&include_image_language=en,null`
        );
        detail = await detailRes.json();
        if (cancelled) return;

        const director = detail.credits?.crew
          ?.filter((c) => c.job === "Director")
          .map((c) => c.name)
          .join(", ") || "";

        const writer = detail.credits?.crew
          ?.filter((c) => c.department === "Writing")
          .map((c) => c.name)
          .join(", ") || "";

        const actors = (detail.credits?.cast || [])
          .slice(0, 4)
          .map((c) => c.name);

        // Build a map from show-level seasons array for fallback episode counts
        const showSeasons = detail.seasons || [];
        const showSeasonMap = {};
        for (const ss of showSeasons) {
          if (ss.season_number > 0) {
            showSeasonMap[ss.season_number] = {
              episode_count: ss.episode_count || 0,
              name: ss.name || `Season ${ss.season_number}`,
              overview: ss.overview || "",
              poster_path: ss.poster_path || null,
              air_date: ss.air_date || "",
            };
          }
        }

        // Collect the season data fetched in parallel above
        const seasonsData = [];
        if (seasonFetch) {
          const results = await seasonFetch;
          if (cancelled) return;

          for (let i = 0; i < seasonList.length; i++) {
            const sn = seasonList[i];
            const sd = results[i];
            const fallback = showSeasonMap[sn] || {};
            seasonsData.push({
              season_number: sn,
              name: sd?.name || fallback.name || `Season ${sn}`,
              overview: sd?.overview || fallback.overview || "",
              poster_path: sd?.poster_path || fallback.poster_path || null,
              air_date: sd?.air_date || fallback.air_date || "",
              episode_count: sd?.episode_count || fallback.episode_count || 0,
              episodes: (sd?.episodes || []).map((ep) => ({
                episode_number: ep.episode_number,
                name: ep.name,
                overview: ep.overview,
                air_date: ep.air_date,
                runtime: ep.runtime,
                still: ep.still_path ? tmdbPoster(ep.still_path, "w300") : null,
                rating: ep.vote_average || 0,
              })),
            });
          }
        }

        const firstSeason = seasonsData[0] || null;

        const imdbID = detail.external_ids?.imdb_id || "";

        // Extract real screenshots from TMDB backdrops & episode stills
        const tmdbBackdrops = (detail.images?.backdrops || [])
          .filter((b) => b.file_path)
          .slice(0, 8)
          .map((b) => tmdbBackdrop(b.file_path, "w780"));

        const episodeStills = seasonsData
          .flatMap((s) => s.episodes || [])
          .map((ep) => (ep.still ? ep.still.replace("w300", "w780") : null))
          .filter(Boolean);

        const realScreenshots = tmdbBackdrops.length > 0
          ? tmdbBackdrops
          : (episodeStills.length > 0
              ? episodeStills.slice(0, 8)
              : (detail.backdrop_path ? [tmdbBackdrop(detail.backdrop_path, "w780")] : []));

        const result = {
          tmdbId: id,
          mediaType,
          imdbID,
          title: detail.title || detail.name || "",
          year: (detail.release_date || detail.first_air_date || "").substring(0, 4),
          overview: detail.overview || firstSeason?.overview || "",
          poster: tmdbPoster(detail.poster_path),
          backdrop: tmdbBackdrop(detail.backdrop_path),
          screenshots: realScreenshots.length > 0 ? realScreenshots.slice(0, 8) : (detail.backdrop_path ? [tmdbBackdrop(detail.backdrop_path, "w780")] : []),
          rating: detail.vote_average ? Number(detail.vote_average.toFixed(1)) : 0,
          votes: detail.vote_count || 0,
          runtime: detail.runtime || null,
          genres: (detail.genres || []).map((g) => g.name),
          language: detail.original_language || "",
          director,
          writer,
          actors,
          released: detail.release_date || detail.first_air_date || "",
          status: detail.status || "",
          number_of_seasons: detail.number_of_seasons || null,
          number_of_episodes: detail.number_of_episodes || null,
          seasonsData,
          seasonNumbers: seasonsData.map((s) => s.season_number),
          episodesPerSeason: seasonsData.map((s) => s.episode_count),
        };

        tmdbCache[cacheKey] = result;
        setState({ data: result, loading: false, error: null });
      } catch {
        if (!cancelled) setState({ data: null, loading: false, error: "Failed to fetch from TMDB" });
      }
    };

    fetchFromTmdb();
    return () => { cancelled = true; };
    // mediaTypeHint/seasonList are derived props used only for filtering the
    // fetched payload; including them would re-run the fetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imdbID, tmdbId, cacheKey]);

  return state;
};

export default useTmdbMovie;
