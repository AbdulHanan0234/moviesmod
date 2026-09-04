import "./HomePage.css";
import Navbar from "../components/Navbar";
import Social from "../components/Social";
import Alert from "../components/Alert";
import MovieGrid from "../components/Postcards";
import Pagination from "../components/Pagination";
import Footer from "../components/Footer.jsx";
import { transformPublished } from "../assets/moviesStore";
import { getMoviesForTag } from "../assets/Tags.js";
import moviesApi from "../api/moviesApi";
import { useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";

const PAGE_SIZE = 20;

const HomePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tag = (searchParams.get("tag") || "").trim();
  const q = (searchParams.get("q") || "").toLowerCase().trim();
  const pageParam = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  const [published, setPublished] = useState([]);

  useEffect(() => {
    let active = true;
    moviesApi.list().then((list) => {
      if (active) setPublished(list.map(transformPublished));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const base = tag
    ? (() => {
        const textMatches = published.filter((m) =>
          [m.lang, m.type, m.genre, m.title]
            .join(" ")
            .toLowerCase()
            .includes(tag.toLowerCase())
        );
        const ruleMatches = getMoviesForTag(tag, published);
        const seen = new Set();
        return [...textMatches, ...ruleMatches].filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
      })()
    : q
      ? published.filter((m) =>
          [m.title, m.genre, m.lang, m.type]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : published;

  const newestFirst = [...base].sort((a, b) => {
    const at = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    const bt = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    if (bt !== at) return bt - at;
    return b.id - a.id;
  });
  const totalPages = Math.max(1, Math.ceil(newestFirst.length / PAGE_SIZE));
  const page = Math.min(pageParam, totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const currentMovies = newestFirst.slice(start, start + PAGE_SIZE);

  const handlePageChange = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    const params = tag
      ? { page: nextPage, tag }
      : q
        ? { page: nextPage, q }
        : { page: nextPage };
    setSearchParams(params);
    window.scrollTo(0, 0);
  };

  return (
    <>
      <Navbar />
      <Social />
      <Alert />
      {tag ? (
        <div className="search-results-note">
          Movies tagged <strong>#{tag}</strong> ({newestFirst.length} found)
        </div>
      ) : q ? (
        <div className="search-results-note">
          Showing results for "<strong>{searchParams.get("q")}</strong>" (
          {newestFirst.length} found)
        </div>
      ) : null}
      <MovieGrid movies={currentMovies} />
      <Pagination
        totalPages={totalPages}
        page={page}
        onPageChange={handlePageChange}
      />
      <Footer/>
    </>
  );
};

export default HomePage;