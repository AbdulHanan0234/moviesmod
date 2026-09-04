import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { transformPublished } from "../assets/moviesStore";
import moviesApi from "../api/moviesApi";
import "./EpisodePage.css";

const EpisodePage = () => {
  const { movieId, seasonNum } = useParams();
  const [searchParams] = useSearchParams();
  const qIndex = parseInt(searchParams.get("q") || "0", 10);

  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    moviesApi.list().then((list) => {
      if (!active) return;
      const found =
        list
          .map(transformPublished)
          .find((m) => String(m.id) === String(movieId)) ||
        null;
      setMovie(found);
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [movieId]);

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="ep-page"><p className="ep-loading">Loading…</p></div>
        <Footer />
      </>
    );
  }

  if (!movie || movie.type !== "Series") {
    return (
      <>
        <Navbar />
        <div className="ep-page">
          <p className="ep-notfound">
            Series not found. <Link to="/">Go back home</Link>
          </p>
        </div>
        <Footer />
      </>
    );
  }

  const quality = (movie.downloadLinks || [])[qIndex] || (movie.downloadLinks || [])[0];
  const season = (quality?.seasons || []).find(
    (s) => String(s.season) === String(seasonNum)
  );

  const episodes = season?.episodes || [];

  return (
    <>
      <Navbar />
      <div className="ep-page">
        <div className="ep-breadcrumb">
          <Link to="/">Home</Link>
          <span className="sep">,</span>
          <Link to={`/movie-details/${movie.id}`}>{movie.title}</Link>
          <span className="sep">,</span>
          <span>Season {seasonNum}</span>
        </div>

        <h1 className="ep-title">
          {movie.title} — Season {seasonNum}
          {quality ? <span className="ep-quality"> {quality.label}</span> : null}
        </h1>

        <div className="ep-quality-tabs">
          {(movie.downloadLinks || []).map((d, i) => (
            <Link
              key={i}
              to={`/series/${movie.id}/season/${seasonNum}?q=${i}`}
              className={`ep-quality-tab ${i === qIndex ? "ep-quality-tab--active" : ""}`}
            >
              {d.label}
            </Link>
          ))}
        </div>

        {episodes.length === 0 ? (
          <p className="ep-empty">No episodes added for this season/quality yet.</p>
        ) : (
          <ul className="ep-list">
            {episodes.map((ep) => (
              <li className="ep-row" key={ep.episodeNumber}>
                {/* <span className="ep-num">Episode {ep.episodeNumber}</span> */}
                <a
                  className="dl-btn dl-single"
                  href={ep.episodeLink || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Episode {ep.episodeNumber}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Footer />
    </>
  );
};

export default EpisodePage;
