import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import "./MovieDetails.css";
import "../components/DownloadSection.css";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import MovieHeader from "../components/MovieHeader";
import MovieInfoCard from "../components/MovieInfoCard";
import SeriesInfo from "../components/SeriesInfo";
import Screenshots from "../components/Screenshots";
import DownloadSection from "../components/DownloadSection";
import RelatedPosts from "../components/RelatedPosts";
import SeriesSeasons from "../components/SeriesSeasons";
import CommentSection from "../components/CommentSection";
import Sidebar from "../components/Sidebar";
import Socialmini from "../components/Socialmini";
import { getMovieDetails } from "../assets/movieDetails";
import { getTags } from "../assets/Tags";
import { transformPublished } from "../assets/moviesStore";
import moviesApi from "../api/moviesApi";
import useTmdbMovie from "../hooks/useTmdbMovie";

const MovieDetails = () => {
  const { id } = useParams();
  // The fetched document is stamped with the id it was fetched for, so a
  // route change to another movie derives `loading` instead of cascading
  // setState calls in the effect.
  const [fetched, setFetched] = useState({ id, doc: null, ready: false });
  const [published, setPublished] = useState([]);

  useEffect(() => {
    let active = true;
    // The movie document (with download links) and the light full list for
    // the sidebar/related sections are independent — fetch them in parallel.
    Promise.all([
      moviesApi.get(id),
      moviesApi.list({ all: 1 }).catch(() => ({ movies: [] })),
    ]).then(([doc, list]) => {
      if (!active) return;
      setFetched({ id, doc: doc ? transformPublished(doc) : null, ready: true });
      setPublished((list.movies || []).map(transformPublished));
    }).catch(() => {
      if (!active) return;
      setFetched({ id, doc: null, ready: true });
    });
    return () => {
      active = false;
    };
  }, [id]);

  const loading = fetched.id !== id || !fetched.ready;
  const movie = fetched.id === id ? fetched.doc : null;
  const siteData = movie ? getMovieDetails(movie) : null;

  const tmdbIdentifier = movie?._published
    ? { tmdbId: movie.id, mediaType: movie.type === "Series" ? "tv" : "movie" }
    : { imdbID: siteData?.imdbID };

  const { data: tmdb, loading: tmdbLoading } = useTmdbMovie(
    tmdbIdentifier,
    movie?._published ? null : siteData?.seasonRange,
  );

  // Screenshot rescue: when the TMDB hook comes back empty (missing key in the
  // environment, transient failure), fetch the backdrops directly so the page
  // shows real stills instead of the placeholder images.
  const [shots, setShots] = useState({ id: null, list: null });

  useEffect(() => {
    if (loading || tmdbLoading || tmdb) return; // hook working or still pending
    if (!movie || !movie._published) return;    // nothing to rescue with
    if (shots.id === movie.id) return;          // already attempted for this movie
    const tmdbKey = import.meta.env.VITE_TMDB_API_KEY;
    if (!tmdbKey) return;                       // can't rescue without a key
    let active = true;
    const mt = movie.type === "Series" ? "tv" : "movie";
    fetch(`https://api.themoviedb.org/3/${mt}/${movie.id}?api_key=${tmdbKey}&append_to_response=images&include_image_language=en,null`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        const list = (data.images?.backdrops || [])
          .filter((b) => b.file_path)
          .slice(0, 8)
          .map((b) => `https://image.tmdb.org/t/p/w780${b.file_path}`);
        setShots({ id: movie.id, list });
      })
      .catch(() => {
        if (!active) return;
        setShots({ id: movie.id, list: [] });
      });
    return () => { active = false; };
  }, [loading, tmdbLoading, tmdb, movie, shots.id]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="detail not-found-wrap">
          <div className="right">
            <div className="not-found">Loading...</div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  if (!movie || !siteData) {
    return (
      <>
        <Navbar />
        <div className="detail not-found-wrap">
          <div className="right">
            <div className="not-found">
              Movie not found. <Link to="/">Go back to Home</Link>
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  const tags = getTags();

  // TMDB is the single source of truth for all metadata, with stored fallbacks
  const t = tmdb || {};
  const title = t.title || movie.title;
  const year = t.year || "";
  const poster = t.poster || movie.imageUrl;
  const genre = t.genres?.length ? t.genres.join(", ") : movie.genre;
  const runtime = t.runtime ? `${t.runtime} min` : (movie.runtime ? `${movie.runtime} min` : "");
  const imdbRating = t.rating || movie.rating || "";
  const imdbVotes = t.votes || movie.votes || "";
  const plot = t.overview || movie.overview || "";
  const director = t.director || movie.director || "";
  const writer = t.writer || movie.writer || "";
  const actors = t.actors?.length ? t.actors : (movie.actors || []);
  const language = t.language || "";
  const released = t.released || movie.released || "";

  // Screenshots: TMDB hook → direct rescue fetch → stored list → placeholders.
  // While TMDB is still pending, hide the section rather than flash the
  // placeholder images.
  const hookShots = t.screenshots || [];
  let screenshots;
  if (hookShots.length > 0) {
    screenshots = hookShots;
  } else if (!movie._published) {
    screenshots = siteData.screenshots;
  } else if (shots.id !== movie.id) {
    screenshots = []; // rescue fetch still pending
  } else if (shots.list && shots.list.length > 0) {
    screenshots = shots.list;
  } else {
    screenshots = siteData.screenshots;
  }

  // Merge: TMDB metadata + site-specific data
  const displayDetail = {
    imdbID: siteData.imdbID || t.imdbID || "",
    releaseTitle: siteData.releaseTitle,
    fullName: title,
    poster,
    year,
    title,
    genres: genre,
    released,
    runtime,
    imdbRating,
    imdbVotes,
    plot,
    director,
    writer,
    actors,
    language,
    season: siteData.season,
    seasonRange: siteData.seasonRange,
    episodesPerSeason: t.episodesPerSeason || [],
    downloads: siteData.downloads,
    screenshots,
    categories: siteData.categories,
    blurb: siteData.blurb,
    description: [siteData.blurb, plot, siteData.description[2]],
    size: siteData.size,
    quality: siteData.quality,
    format: siteData.format,
    subtitles: siteData.subtitles,
    uploadedAt: movie.uploadedAt || null,
  };

  const popular = published
    .filter((m) => m.id !== movie.id)
    .sort((a, b) => b.id - a.id)
    .slice(0, 6);

  const related = published
    .filter((m) => m.id !== movie.id && m.type === movie.type)
    .slice(0, 4);

  return (
    <>
      <Navbar />
      <div className="detail">
        <div className="right">
          <MovieHeader detail={displayDetail} />

          <div className="thecontent">
            {displayDetail.description.map((p, i) =>
              p ? <p key={i}>{p}</p> : null,
            )}
          </div>

          <MovieInfoCard
            detail={displayDetail}
            movie={movie}
            loading={tmdbLoading}
          />

          <SeriesInfo movie={movie} detail={displayDetail} plot={plot} />

          <Screenshots images={displayDetail.screenshots} title={movie.title} />
          {movie.type === "Series" ? (
            <SeriesSeasons movie={movie} detail={displayDetail} />
          ) : (
            <DownloadSection movie={movie} detail={displayDetail} />
          )}
          <Socialmini />
          <div className="mt-4">
            <div className="alert-dl alert-dl-danger">
              Please Do Not Use VPN for Downloading Movies From Our Site.
            </div>
            <div className="alert-dl alert-dl-success">
              Click On The Above <strong>Download Button</strong> Download File.
            </div>
            <div className="alert-dl alert-dl-warning">
              If You Find Any Broken Link Then <strong>Report</strong> To Us.
            </div>
            <div className="alert-dl alert-dl-info">
              <strong>Comment</strong> Your Queries And Requests Below In The
              Comment Box.
            </div>
          </div>
          <RelatedPosts related={related} />
          <CommentSection />
        </div>
        <Sidebar tags={tags} popular={popular} />
      </div>
      <Footer />
    </>
  );
};

export default MovieDetails;
