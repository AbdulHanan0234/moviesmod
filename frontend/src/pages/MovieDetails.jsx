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
  const [published, setPublished] = useState([]);
  const [publishedLoading, setPublishedLoading] = useState(true);
  const [tmdbScreenshots, setTmdbScreenshots] = useState([]);

  useEffect(() => {
    let active = true;
    moviesApi.list().then((list) => {
      if (active) {
        setPublished(list.map(transformPublished));
        setPublishedLoading(false);
      }
    }).catch(() => {
      if (active) setPublishedLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const movie = published.find((m) => String(m.id) === String(id));
  const siteData = movie ? getMovieDetails(movie) : null;

  // Fetch TMDB screenshots directly (proven approach from AddMovies preview)
  useEffect(() => {
    if (!movie?._published) return;
    const mt = movie.type === "Series" ? "tv" : "movie";
    const tmdbKey = import.meta.env.VITE_TMDB_API_KEY;
    if (!tmdbKey) return;

    let active = true;
    fetch(`https://api.themoviedb.org/3/${mt}/${movie.id}?api_key=${tmdbKey}&append_to_response=images&include_image_language=en,null`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        const shots = (data.images?.backdrops || [])
          .filter((b) => b.file_path)
          .slice(0, 8)
          .map((b) => `https://image.tmdb.org/t/p/w780${b.file_path}`);
        setTmdbScreenshots(shots);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [movie?._published, movie?.type, movie?.id]);

  const tmdbIdentifier = movie?._published
    ? { tmdbId: movie.id, mediaType: movie.type === "Series" ? "tv" : "movie" }
    : { imdbID: siteData?.imdbID };

  const { data: tmdb, loading: tmdbLoading } = useTmdbMovie(
    tmdbIdentifier,
    movie?._published ? null : siteData?.seasonRange,
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  if (publishedLoading) {
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
    screenshots: (tmdbScreenshots.length > 0)
      ? tmdbScreenshots
      : (t.screenshots && t.screenshots.length > 0)
        ? t.screenshots
        : siteData.screenshots,
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
