import "./MovieInfoCard.css";

const MovieInfoCard = ({ detail, movie, loading }) => {
  if (loading) {
    return (
      <div className="imdbwp imdbwp--dark">
        <div className="imdbwp__loading">Loading...</div>
      </div>
    );
  }

  const imdbID = detail?.imdbID || "";
  const poster = detail?.poster || movie?.imageUrl || "/placeholder.png";
  const title = detail?.title || movie?.title || "";
  const rated = detail?.rated || "N/A";
  const genre = detail?.genres || movie?.genre || "N/A";
  const released = detail?.released || "N/A";
  const imdbRating = detail?.imdbRating || "N/A";
  const imdbVotes = detail?.imdbVotes || "N/A";
  const plot = detail?.plot || "";
  const director = detail?.director || "N/A";
  const writer = detail?.writer || "N/A";
  const actors = Array.isArray(detail?.actors)
    ? detail.actors.join(", ")
    : detail?.actors || "N/A";

  return (
    <div className="imdbwp imdbwp--dark">
      <div className="imdbwp__thumb">
        <a
          className="imdbwp__link"
          target="_blank"
          href={`https://www.imdb.com/title/${imdbID}`}
          rel="noopener noreferrer"
        >
          <img className="imdbwp__img" src={poster} alt={title} />
        </a>
      </div>
      <div className="imdbwp__content">
        <div className="imdbwp__header">
          <span className="imdbwp__title">{title}</span>
          <div className="imdbwp__meta">
            <span>{rated}</span> | <span>{genre}</span> |{" "}
            <span>{released}</span>
          </div>
        </div>
        <div className="imdbwp__belt">
          <span className="imdbwp__star">{imdbRating}</span>
          <span className="imdbwp__rating">
            <strong>Rating:</strong> {imdbRating} / 10 from{" "}
            {imdbVotes} users
          </span>
        </div>
        <div className="imdbwp__teaser">{plot}</div>
        <div className="imdbwp__footer">
          <strong>Director:</strong> <span>{director}</span>
          <br />
          <strong>Creator:</strong> <span>{writer}</span>
          <br />
          <strong>Actors:</strong> <span>{actors}</span>
        </div>
      </div>
    </div>
  );
};

export default MovieInfoCard;
