import "./Navbar.css"
import moviesmod from "../assets/moviesmod.png"
import { Link, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";

const navItems = [
  {
    label: "HOME",
    link: "/"
  },
  {
    label: "MOVIES",
    dropdown: [
      { label: "Bollywood Movies", link: "/?lang=Hindi&type=movie" },
      { label: "Hollywood Movies", link: "/?lang=English&type=movie" },
      { label: "Dual Audio Movies", link: "/?lang=Dual+Audio&type=movie" },
      { label: "South Indian Movies", link: "/?lang=South+Indian&type=movie" },
      { label: "Animated Movies", link: "/?genre=Animation&type=movie" },
    ]
  },
  {
    label: "LANGUAGE",
    dropdown: [
      { label: "Hindi", link: "/?lang=Hindi" },
      { label: "English", link: "/?lang=English" },
      { label: "Tamil", link: "/?lang=Tamil" },
      { label: "Telugu", link: "/?lang=Telugu" },
      { label: "Kannada", link: "/?lang=Kannada" },
      { label: "Malayalam", link: "/?lang=Malayalam" },
    ]
  },
  {
    label: "GENRE",
    dropdown: [
      { label: "Action", link: "/?genre=Action" },
      { label: "Comedy", link: "/?genre=Comedy" },
      { label: "Drama", link: "/?genre=Drama" },
      { label: "Horror", link: "/?genre=Horror" },
      { label: "Thriller", link: "/?genre=Thriller" },
      { label: "Romance", link: "/?genre=Romance" },
      { label: "Sci-Fi", link: "/?genre=Sci-Fi" },
      { label: "Animation", link: "/?genre=Animation" },
    ]
  },
  {
    label: "YEAR",
    dropdown: [
      { label: "2026", link: "/?year=2026" },
      { label: "2025", link: "/?year=2025" },
      { label: "2024", link: "/?year=2024" },
      { label: "2023", link: "/?year=2023" },
      { label: "2022", link: "/?year=2022" },
      { label: "2021", link: "/?year=2021" },
    ]
  },
  {
    label: "OTT",
    dropdown: [
      { label: "Netflix", link: "/?ott=Netflix" },
      { label: "Amazon Prime", link: "/?ott=Amazon+Prime" },
      { label: "Disney+ Hotstar", link: "/?ott=Disney%2B+Hotstar" },
      { label: "SonyLIV", link: "/?ott=SonyLIV" },
      { label: "ZEE5", link: "/?ott=ZEE5" },
      { label: "MX Player", link: "/?ott=MX+Player" },
    ]
  },
  {
    label: "WEB SERIES",
    dropdown: [
      { label: "Hindi Web Series", link: "/?lang=Hindi&type=tv" },
      { label: "English Web Series", link: "/?lang=English&type=tv" },
      { label: "South Indian Series", link: "/?lang=South+Indian&type=tv" },
    ]
  },
  {
    label: "TV SERIES",
    dropdown: [
      { label: "Hindi TV Shows", link: "/?lang=Hindi&type=tv" },
      { label: "English TV Shows", link: "/?lang=English&type=tv" },
      { label: "Korean Drama", link: "/?lang=Korean&type=tv" },
    ]
  },
  {
    label: "ADD MOVIES",
    link: "/AddMovies"
  }
];

const Navbar = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const dropdownRef = useRef(null);

  const onSearch = () => {
    const q = query.trim();
    if (q) navigate(`/?q=${encodeURIComponent(q)}`);
  };

  const handleDropdownEnter = (index) => {
    setActiveDropdown(index);
  };

  const handleDropdownLeave = () => {
    setActiveDropdown(null);
  };

  const toggleDropdown = (index) => {
    setActiveDropdown(activeDropdown === index ? null : index);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="nav-bar">
      <div className="nav-top-row">
        <div className="logo">
          <Link to="/">
            <img src={moviesmod} alt="MoviesMod" />
          </Link>
        </div>

        <div className="search-box">
          <input
            type="text"
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

        <div className="btn-box">
          <Link to="/" className="btn-a" target="_blank">
            Bollywood
          </Link>
          <Link to="/" className="btn-b" target="_blank">
            AnimeFlix
          </Link>
        </div>
      </div>

      <button
        className="menu-toggle"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
      >
        <i className={`fa ${menuOpen ? 'fa-times' : 'fa-bars'}`}></i> Menu
      </button>

      <div className={`navigation-tab ${menuOpen ? 'active' : ''}`} ref={dropdownRef}>
        {navItems.map((item, index) => (
          <div
            key={index}
            className={`navi-btn ${activeDropdown === index ? 'active' : ''}`}
            onMouseEnter={() => handleDropdownEnter(index)}
            onMouseLeave={handleDropdownLeave}
          >
            {item.link ? (
              <Link
                to={item.link}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ) : (
              <>
                <button onClick={() => toggleDropdown(index)}>
                  {item.label}
                  <i className="fa fa-caret-down"></i>
                </button>
                {item.dropdown && (
                  <div className="dropdown-menu">
                    {item.dropdown.map((subItem, subIndex) => (
                      <Link
                        key={subIndex}
                        to={subItem.link}
                        onClick={() => {
                          setMenuOpen(false);
                          setActiveDropdown(null);
                        }}
                      >
                        {subItem.label}
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Navbar;
