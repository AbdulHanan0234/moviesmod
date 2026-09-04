import "./Navbar.css"
import moviesmod from "../assets/moviesmod.png"
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";


const Navbar = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const onSearch = () => {
    const q = query.trim();
    if (q) navigate(`/?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="nav-bar">
    <div className="nav-top-row d-flex justify-content-between align-items-center">
      <div className="logo ps-4">
        <Link to="/">
          <img src={moviesmod} alt="MoviesMod" />
        </Link>
      </div>

      <div className="search-box">
        <input
          type="text"
          className="p-2"
          placeholder="What are you looking for?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
        />
        <i
          className="fa fa-search"
          style={{ cursor: "pointer" }}
          onClick={onSearch}
        />
      </div>

      <div className="btn-box d-flex pe-4">
        <Link
          to="/"
          className="btn-a text-center pt-1"
          target="_blank"
        >
          Bollywood
        </Link>
        <Link
          to="/"
          className="btn-b text-center pt-1"
          target="_blank"
        >
          AnimeFlix
        </Link>
      </div>
    </div>

    <div className="navigation-tab d-flex rounded-bottom-3">
      <div className="navi-btn">
        <Link className="border-end" to="/">
          HOME
        </Link>
      </div>
      <div className="navi-btn">
        <button className="border-end">
          MOVIES <i className="fa fa-sort-desc" aria-hidden="true"></i>
        </button>
      </div>
      <div className="navi-btn">
        <button className="border-end">
          LANGUAGE <i className="fa fa-sort-desc" aria-hidden="true"></i>
        </button>
      </div>
      <div className="navi-btn">
        <button className="border-end">
          GENRE <i className="fa fa-sort-desc" aria-hidden="true"></i>
        </button>
      </div>
      <div className="navi-btn">
        <button className="border-end">
          YEAR <i className="fa fa-sort-desc" aria-hidden="true"></i>
        </button>
      </div>
      <div className="navi-btn">
        <button className="border-end">
          OTT <i className="fa fa-sort-desc" aria-hidden="true"></i>
        </button>
      </div>
      <div className="navi-btn">
        <button className="border-end">
          WEB SERIES <i className="fa fa-sort-desc" aria-hidden="true"></i>
        </button>
      </div>
      <div className="navi-btn">
        <button className="border-end">
          TV SERIES <i className="fa fa-sort-desc" aria-hidden="true"></i>
        </button>
      </div>
      <div className="navi-btn">
        <Link to="/AddMovies" className="border-end">
          ADD MOVIES
        </Link>
      </div>
    </div>
  </div>
  )
}

export default Navbar
