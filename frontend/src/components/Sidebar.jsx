import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Sidebar.css";
import tgmoviesmod from "../assets/tgmoviesmod.jpg"

const Sidebar = ({ tags, popular }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const handleSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/?q=${encodeURIComponent(q)}` : "/");
  };

  return (
    <div className="left">
      {/* Search */}
      <form className="search" onSubmit={handleSearch}>
        <p>SEARCH MOVIES</p>
        <div className="search-form-row">
          <input
            type="text"
            placeholder="What are you looking for?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="search-btn" aria-label="Search">
            <i className="fa fa-search"></i>
          </button>
        </div>
      </form>

      {/* Follow / social buttons */}
      <div className="side-block">
        <h3 className="side-heading">Join Us on Telegram</h3>
        <div className="social-row">
          <a href="#" target="_blank" rel="noopener noreferrer">
            <img className="social-img" src={tgmoviesmod} alt="Telegram MoviesMod" />
          </a>
        </div>
      </div>

      {/* Tags */}
      <div className="side-block">
        <h3 className="side-heading">
          <i className="fa fa-tags" aria-hidden="true" /> TAGS
        </h3>
        <div className="tags-list">
          {tags.map((t) => (
            <Link
              key={t.name}
              to={`/?tag=${encodeURIComponent(t.name)}`}
              className="tag-chip"
            >
              #{t.name}
            </Link>
          ))}
        </div>
      </div>

      {/* Popular posts */}
      <div className="side-block">
        <h3 className="side-heading">POPULAR POSTS</h3>
        <ul className="popular-list">
          {popular.map((p) => (
            <li className="popular-item" key={p.id}>
              <img
                src={p.imageUrl}
                alt={p.title}
                width="72"
                height="108"
                loading="lazy"
                decoding="async"
              />
              <Link to={`/movie-details/${p.id}`}>
                {p.title.startsWith("Download ") ? p.title : `Download ${p.title}`}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Sidebar;