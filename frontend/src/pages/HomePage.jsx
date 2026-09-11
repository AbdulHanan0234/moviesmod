import "./HomePage.css";
import Navbar from "../components/Navbar";
import Social from "../components/Social";
import Alert from "../components/Alert";
import MovieGrid from "../components/Postcards";
import Pagination from "../components/Pagination";
import Footer from "../components/Footer.jsx";
import { transformPublished } from "../assets/moviesStore";
import { getMoviesForTag, getMoviesForOtt, matchesLang, matchesGenre, langName } from "../assets/Tags.js";
import moviesApi from "../api/moviesApi";
import { useSearchParams } from "react-router-dom";
import { useMemo, useState, useEffect } from "react";

const PAGE_SIZE = 20;

const HomePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tag = (searchParams.get("tag") || "").trim();
  const q = (searchParams.get("q") || "").toLowerCase().trim();
  const langParam = (searchParams.get("lang") || "").trim();
  const genreParam = (searchParams.get("genre") || "").trim();
  const yearParam = (searchParams.get("year") || "").trim();
  const typeParam = (searchParams.get("type") || "").trim();
  const ottParam = (searchParams.get("ott") || "").trim();
  const pageParam = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  // Default view: one page at a time from the server (tiny payload, instant
  // pagination). Tag/search/filter views: fetch the light full list once,
  // then apply every filter client-side.
  const [pageData, setPageData] = useState({ movies: [], totalPages: null });
  const [published, setPublished] = useState([]);

  const filteredMode = Boolean(tag || q || langParam || genreParam || yearParam || typeParam || ottParam);

  // Filtering — language codes/aliases via Tags.js helpers, then tag and/or
  // search on top, newest first.
  const newestFirst = useMemo(() => {
    if (!filteredMode) return [];
    let base = published;

    if (langParam) base = base.filter((m) => matchesLang(m, langParam));
    if (genreParam) base = base.filter((m) => matchesGenre(m, genreParam));
    if (yearParam) base = base.filter((m) => String(m.released || "").startsWith(yearParam));
    if (typeParam) base = base.filter((m) => m.type === (typeParam === "tv" ? "Series" : "Movie"));
    if (ottParam) base = getMoviesForOtt(ottParam, base);

    if (tag) {
      const textMatches = base.filter((m) =>
        [m.lang, m.type, m.genre, m.title]
          .join(" ")
          .toLowerCase()
          .includes(tag.toLowerCase())
      );
      const ruleMatches = getMoviesForTag(tag, base);
      const seen = new Set();
      base = [...textMatches, ...ruleMatches].filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    }

    if (q) {
      base = base.filter((m) =>
        [m.title, m.genre, m.lang, m.type]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    return [...base].sort((a, b) => {
      const at = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const bt = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      if (bt !== at) return bt - at;
      return b.id - a.id;
    });
  }, [filteredMode, tag, q, langParam, genreParam, yearParam, typeParam, ottParam, published]);

  // Readable label for filter views, e.g. "Hindi · Series · 2024"
  const filterLabel = [
    langParam ? langName(langParam) : "",
    typeParam ? (typeParam === "tv" ? "Series" : "Movies") : "",
    genreParam,
    yearParam,
    ottParam,
  ].filter(Boolean).join(" · ");

  const totalPages = filteredMode
    ? Math.max(1, Math.ceil(newestFirst.length / PAGE_SIZE))
    : (pageData.totalPages || 1);

  // Clamp only once the real count is known — a stale ?page=99 deep-link
  // lands on the last page instead of an empty grid.
  const page = filteredMode
    ? Math.min(pageParam, totalPages)
    : pageData.totalPages
      ? Math.min(pageParam, pageData.totalPages)
      : pageParam;

  useEffect(() => {
    let active = true;
    const request = filteredMode
      ? moviesApi.list({ all: 1 }).then((r) => {
          if (active) setPublished(r.movies.map(transformPublished));
        })
      : moviesApi.list({ page, limit: PAGE_SIZE }).then((r) => {
          if (active) {
            setPageData({
              movies: r.movies.map(transformPublished),
              totalPages: r.totalPages || 1,
            });
          }
        });
    request.catch(() => {});
    return () => { active = false; };
  }, [filteredMode, tag, q, page]);

  const currentMovies = filteredMode
    ? newestFirst.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : pageData.movies;

  const handlePageChange = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    // Preserve every active filter (tag/q/lang/genre/year/type/ott)
    const params = new URLSearchParams(searchParams);
    params.set("page", String(nextPage));
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
      ) : filterLabel ? (
        <div className="search-results-note">
          <strong>{filterLabel}</strong> ({newestFirst.length} found)
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
