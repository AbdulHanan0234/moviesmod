import "./Postcards.css";
import { Link } from "react-router-dom";
import { getMovieDetails } from "../assets/movieDetails";

const PosterCard = ({ movie }) => {
  const detail = getMovieDetails(movie);

  const title = movie.title.startsWith("Download ")
    ? movie.title
    : detail.releaseTitle;

  const imgSrc = movie.imageUrl;

  return (
    <Link
      to={`/movie-details/${movie.id}`}
      className="movie-card-link text-decoration-none"
    >
      <article className="movie-card">
        <div className="movie-card-image-wrap">
          <img
            src={imgSrc}
            alt={title}
            className="movie-card-img"
            width="300"
            height="450"
            loading="lazy"
            decoding="async"
          />
        </div>
        <header className="movie-card-header">
          <h2 className="movie-card-title">{title}</h2>
        </header>
      </article>
    </Link>
  );
};

export const PostCard = ({ movie }) => <PosterCard movie={movie} />;

const MovieGrid = ({ movies }) => {
  return (
    <div className="grid-body my-5">
      {movies.map((movie) => (
        <PosterCard key={movie.id} movie={movie} />
      ))}
    </div>
  );
};

export default MovieGrid;
