import { useState, useEffect, useRef, useCallback } from "react";
import "./AddMovies.css";
import MovieInfoCard from "../components/MovieInfoCard";
import SeriesInfo from "../components/SeriesInfo";
import moviesApi from "../api/moviesApi";

// ─── TMDB helpers ─────────────────────────────────────────────────────────────
const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TMDB     = "https://api.themoviedb.org/3";
const IMG      = "https://image.tmdb.org/t/p";
const poster   = (p, sz = "w185") => p ? `${IMG}/${sz}${p}` : null;

// ─── constants ────────────────────────────────────────────────────────────────
const RESOLUTIONS = ["360p","480p", "720p", "1080p", "2160p (4K)"];
const QUALITIES   = ["WEB-DL", "BluRay","HDRip", "CamRip", "HDTS", "10bit"];
const AUDIO_TAGS  = ["","{Hindi-English}", "{English}", "{Hindi}", "{Org Audio}", "{Hindi-English-Spanish}", "{Multi Audio}"];

const BLANK_LINK = { resolution: "1080p", quality: "WEB-DL", audioTag: "{Org Audio}", size: "", customSuffix: "", downloadLink: "", episodeLink: "", batchLink: "" };

const isValidUrl = (str) => {
  try { return Boolean(new URL(str)); } catch { return false; }
};

const buildLabel = ({ resolution, quality, size, audioTag, customSuffix }) =>
  [resolution, quality, audioTag, size ? `[${size}]` : "", customSuffix]
    .map(s => (s || "").trim()).filter(Boolean).join(" ");

// colour-coded label renderer (same logic as DownloadSection)
const renderLabel = (label) => {
  if (!label) return null;
  const nodes = [];
  const re = /\{[^}]*\}|x26\d|10bit|\[[^\]]*\]/gi;
  let last = 0, m;
  while ((m = re.exec(label)) !== null) {
    if (m.index > last) nodes.push(label.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("{"))        nodes.push(<span className="text-red"  key={m.index}>{tok}</span>);
    else if (/x26\d|10bit/i.test(tok)) nodes.push(<span className="text-blue" key={m.index}>{tok}</span>);
    else                            nodes.push(<span className="text-teal" key={m.index}>{tok}</span>);
    last = re.lastIndex;
  }
  if (last < label.length) nodes.push(label.slice(last));
  return <span className="text-teal">{nodes}</span>;
};

// ─── Download preview (no alerts, no socialmini) ───────────────────────────────
const DownloadPreview = ({ title, downloadLinks, mediaType }) => (
  <div className="am-dl-preview">
    <h3 className="download-section-heading">Download {title}</h3>
    <hr className="download-hr" />
    {downloadLinks.length === 0 ? (
      <p className="am-no-links">No download links added yet — add some on the left.</p>
    ) : (
      downloadLinks.map((d, i) => (
        <div className="download-group" key={i}>
          <h3 className="download-heading">{renderLabel(d.label)}</h3>
          <p className="download-links">
            {mediaType === "movie" ? (
              // Movies: show single download link
              d.downloadLink && <a className="dl-btn dl-single" href={d.downloadLink} target="_blank" rel="noopener noreferrer">Download</a>
            ) : (
              // TV Shows: show episode links and batch
              <>
                {d.episodeLink && <a className="dl-btn dl-single" href={d.episodeLink} target="_blank" rel="noopener noreferrer">Episode Links</a>}
                {d.batchLink   && <a className="dl-btn dl-batch"  href={d.batchLink}   target="_blank" rel="noopener noreferrer">Batch/Zip File</a>}
              </>
            )}
            {mediaType === "movie" && !d.downloadLink && <span className="am-no-url-hint">No URL yet.</span>}
            {mediaType !== "movie" && !d.episodeLink && !d.batchLink && <span className="am-no-url-hint">No URLs yet.</span>}
          </p>
        </div>
      ))
    )}
  </div>
);

// ─── Preview panel ─────────────────────────────────────────────────────────────
// Shows ONLY the parts that differ per-movie: InfoCard + SeriesInfo + Downloads
const MoviePreview = ({ details, downloadLinks }) => {
  const { tmdb, mediaType, seasonInfo } = details;

  const movieObj = {
    type:     mediaType === "tv" ? "Series" : "Movie",
    title:    tmdb.title || tmdb.name || "",
    genre:    (tmdb.genres || [])[0]?.name || "",
    lang:     "English",
    imageUrl: poster(tmdb.poster_path, "w500"),
  };

  const genres = (tmdb.genres || []).map(g => g.name).join(", ");

  // derive size/quality summary from download links
  const sizes    = [...new Set(downloadLinks.map(d => d.size).filter(Boolean))];
  const quals    = [...new Set(downloadLinks.map(d => `${d.resolution} ${d.quality}`).filter(Boolean))];

  const director = tmdb.credits?.crew?.filter(c => c.job === "Director").map(c => c.name).join(", ") || "";
  const writer   = tmdb.credits?.crew?.filter(c => c.department === "Writing").map(c => c.name).join(", ") || "";
  const actors   = (tmdb.credits?.cast || []).slice(0, 4).map(c => c.name);

  const displayDetail = {
    imdbID:           details.imdbID || "",
    title:            tmdb.title || tmdb.name || "",
    fullName:         tmdb.title || tmdb.name || "",
    poster:           poster(tmdb.poster_path, "w500"),
    year:             (tmdb.release_date || tmdb.first_air_date || "").slice(0, 4),
    genres,
    released:         tmdb.release_date || tmdb.first_air_date || "",
    runtime:          tmdb.runtime ? `${tmdb.runtime} min` : "",
    imdbRating:       tmdb.vote_average ? tmdb.vote_average.toFixed(1) : "",
    imdbVotes:        tmdb.vote_count || "",
    plot:             seasonInfo?.overview || tmdb.overview || "",
    director,
    writer,
    actors,
    language:         tmdb.original_language || "",
    season:           seasonInfo?.seasonText || null,
    seasonRange:      seasonInfo?.seasonRange || null,
    episodesPerSeason: seasonInfo?.episodesPerSeason || [],
    downloads:        downloadLinks,
    size:             sizes.length ? sizes.join(" & ") : "",
    quality:          quals.length ? quals.join(" & ") : "",
    format:           "Mkv",
    subtitles:        "Yes (English)",
  };

  return (
    <div className="am-preview-content">
      <MovieInfoCard detail={displayDetail} movie={movieObj} loading={false} />
      <SeriesInfo    movie={movieObj}        detail={displayDetail} plot={displayDetail.plot} />
      <DownloadPreview title={displayDetail.title} downloadLinks={downloadLinks} mediaType={mediaType} />
    </div>
  );
};

// ─── Quality chip ──────────────────────────────────────────────────────────────
const QualityChip = ({ d, index, onRemove, mediaType }) => {
  const urlCount = mediaType === "movie"
    ? (d.downloadLink ? 1 : 0)
    : (d.seasons?.length || 0);
  return (
    <div className="am-link-chip">
      <div className="am-link-chip-main">
        <span className="am-chip-res">{d.resolution}</span>
        <span className="am-chip-quality">{d.quality}</span>
        {d.size && <span className="am-chip-size">[{d.size}]</span>}
        <span className={`am-chip-urls ${urlCount === 0 ? "am-chip-urls--none" : ""}`}>
          {mediaType === "tv"
            ? (urlCount === 0 ? "no seasons" : `${urlCount} season${urlCount > 1 ? "s" : ""}`)
            : (urlCount === 0 ? "no URL" : "1 URL")}
        </span>
      </div>
      <button className="am-link-chip-remove" onClick={() => onRemove(index)} title="Remove">×</button>
    </div>
  );
};

// ─── Series quality editor (seasons + episodes per quality) ────────────────────
const SeriesQualityEditor = ({ quality, onChange }) => {
  const [season, setSeason] = useState("");
  const [batchLink, setBatchLink] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState("");
  const [episodeLink, setEpisodeLink] = useState("");
  const [activeSeason, setActiveSeason] = useState(null);

  const seasons = quality.seasons || [];

  const addSeason = () => {
    if (!season || !batchLink || !isValidUrl(batchLink)) return;
    const sn = parseInt(season, 10);
    const existing = seasons.find((s) => s.season === sn);
    const nextSeasons = existing
      ? seasons.map((s) => (s.season === sn ? { ...s, batchLink } : s))
      : [...seasons, { season: sn, batchLink, episodes: [] }].sort(
          (a, b) => a.season - b.season
        );
    onChange({ ...quality, seasons: nextSeasons });
    setSeason("");
    setBatchLink("");
  };

  const addEpisode = (sn) => {
    if (!episodeNumber || !episodeLink || !isValidUrl(episodeLink)) return;
    const epNum = parseInt(episodeNumber, 10);
    const nextSeasons = seasons.map((s) => {
      if (s.season !== sn) return s;
      const eps = s.episodes || [];
      const ex = eps.find((e) => e.episodeNumber === epNum);
      const nextEps = ex
        ? eps.map((e) => (e.episodeNumber === epNum ? { ...e, episodeLink } : e))
        : [...eps, { episodeNumber: epNum, episodeLink }].sort(
            (a, b) => a.episodeNumber - b.episodeNumber
          );
      return { ...s, episodes: nextEps };
    });
    onChange({ ...quality, seasons: nextSeasons });
    setEpisodeNumber("");
    setEpisodeLink("");
  };

  const removeSeason = (sn) =>
    onChange({ ...quality, seasons: seasons.filter((s) => s.season !== sn) });

  const removeEpisode = (sn, epNum) =>
    onChange({
      ...quality,
      seasons: seasons.map((s) =>
        s.season === sn
          ? { ...s, episodes: (s.episodes || []).filter((e) => e.episodeNumber !== epNum) }
          : s
      ),
    });

  return (
    <div className="am-season-editor">
      <h4 className="am-season-editor-title">Seasons for {quality.label}</h4>

      {/* Add season */}
      <div className="am-season-form-row">
        <div className="am-form-group am-season-num">
          <label className="am-form-label">Season #</label>
          <input className="am-input" type="number" min="1" placeholder="1" value={season} onChange={(e) => setSeason(e.target.value)} />
        </div>
        <div className="am-form-group am-season-url">
          <label className="am-form-label">Season Batch / Zip Link</label>
          <input className="am-input" type="url" placeholder="https://drive.google.com/…" value={batchLink} onChange={(e) => setBatchLink(e.target.value)} />
        </div>
        <button className="am-btn am-btn-add" onClick={addSeason} disabled={!season || !batchLink || !isValidUrl(batchLink)}>Add</button>
      </div>

      {/* Season list */}
      {seasons.length === 0 ? (
        <p className="am-no-links">No seasons added yet.</p>
      ) : (
        seasons.map((s) => (
          <div className="am-season-block" key={s.season}>
            <div className="am-season-block-head">
              <span className="am-season-name">Season {s.season}</span>
              <a className="am-mini-link" href={s.batchLink} target="_blank" rel="noopener noreferrer">Batch</a>
              <button className="am-link-chip-remove" onClick={() => removeSeason(s.season)} title="Remove season">×</button>
            </div>

            <ul className="am-ep-list">
              {(s.episodes || []).map((ep) => (
                <li key={ep.episodeNumber} className="am-ep-row">
                  <span>Ep {ep.episodeNumber}</span>
                  <a className="am-mini-link" href={ep.episodeLink} target="_blank" rel="noopener noreferrer">link</a>
                  <button className="am-link-chip-remove" onClick={() => removeEpisode(s.season, ep.episodeNumber)} title="Remove">×</button>
                </li>
              ))}
            </ul>

            {activeSeason === s.season ? (
              <div className="am-ep-form-row am-ep-form">
                <div className="am-ep-inputs">
                  <div className="am-form-group am-ep-num">
                    <label className="epi-form-label">Ep #</label>
                    <input className="epi-input" type="number" min="1" placeholder="1" value={episodeNumber} onChange={(e) => setEpisodeNumber(e.target.value)} />
                  </div>
                  <div className="am-form-group am-ep-url">
                    <label className="epi-form-label">Episode Link</label>
                    <input className="epi-input" type="url" placeholder="https://drive.google.com/…" value={episodeLink} onChange={(e) => setEpisodeLink(e.target.value)} />
                  </div>
                </div>
                <div className="am-ep-btns">
                  <button className="am-btn am-btn-add" onClick={() => addEpisode(s.season)} disabled={!episodeNumber || !episodeLink || !isValidUrl(episodeLink)}>Add Ep</button>
                  <button className="am-btn am-btn-back" onClick={() => setActiveSeason(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="am-btn am-btn-add am-btn-sm" onClick={() => setActiveSeason(s.season)}>
                + Add Episode
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────
const AddMovies = () => {
  // search
  const [query,         setQuery]         = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching,     setSearching]     = useState(false);
  const debounceRef = useRef(null);

  // selected movie
  const [selectedResult, setSelectedResult] = useState(null); // basic tmdb result
  const [fullDetails,    setFullDetails]    = useState(null); // { tmdb, mediaType, imdbID, seasonInfo }
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [mediaType, setMediaType] = useState(null); // "movie" or "tv"

  // link builder
  const [downloadLinks, setDownloadLinks] = useState([]);
  const [newLink,       setNewLink]       = useState(BLANK_LINK);
  const previewLabel = buildLabel(newLink);
  const canAdd = Boolean(newLink.resolution && newLink.quality);

  // publish
  const [published,      setPublished]      = useState(false);
  const [publishedList,  setPublishedList]  = useState([]);
  const [editingTmdbId,  setEditingTmdbId]  = useState(null);
  const [mode,           setMode]           = useState("add"); // "add" | "manage"
  const [manageQuery,    setManageQuery]    = useState("");

  // admin security
  const [isAdminUnlocked,   setIsAdminUnlocked]   = useState(() => moviesApi.isAdminUnlocked());
  const [adminModalOpen,    setAdminModalOpen]    = useState(false);
  const [adminModalConfig,  setAdminModalConfig]  = useState({ title: "", desc: "", onSuccess: null });
  const [adminInputPass,    setAdminInputPass]    = useState("");
  const [adminModalError,   setAdminModalError]   = useState("");
  const [adminModalLoading, setAdminModalLoading] = useState(false);
  const [showPassword,      setShowPassword]      = useState(false);

  const requestAdminAccess = (actionName, targetTitle, onSuccess) => {
    if (isAdminUnlocked) {
      onSuccess();
      return;
    }
    setAdminModalError("");
    setAdminInputPass("");
    setShowPassword(false);
    setAdminModalConfig({
      title: "Admin Password Required",
      desc: `Please enter your admin password to ${actionName} "${targetTitle}".`,
      onSuccess,
    });
    setAdminModalOpen(true);
  };

  const handleAdminSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!adminInputPass.trim()) {
      setAdminModalError("Please enter the admin password.");
      return;
    }
    setAdminModalLoading(true);
    setAdminModalError("");
    try {
      await moviesApi.verifyAdminPassword(adminInputPass.trim());
      setIsAdminUnlocked(true);
      setAdminModalOpen(false);
      if (adminModalConfig.onSuccess) {
        adminModalConfig.onSuccess();
      }
    } catch (err) {
      setAdminModalError(err.message || "Incorrect admin password.");
    } finally {
      setAdminModalLoading(false);
    }
  };

  const handleLockAdmin = () => {
    moviesApi.clearAdminPassword();
    setIsAdminUnlocked(false);
  };

  useEffect(() => {
    moviesApi.list().then(setPublishedList).catch(() => {});
  }, []);

  // ── TMDB search (debounced 450ms) ─────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    // Intentional: reset results synchronously when the query is cleared.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!q) { setSearchResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await fetch(`${TMDB}/search/multi?query=${encodeURIComponent(q)}&api_key=${TMDB_KEY}&language=en-US&page=1`);
        const data = await res.json();
        setSearchResults(
          (data.results || [])
            .filter(r => r.media_type === "movie" || r.media_type === "tv")
            .slice(0, 12)
        );
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 450);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // ── Fetch full TMDB details on selection ──────────────────────────────────
  const handleSelectResult = useCallback(async (result) => {
    setSelectedResult(result);
    setDownloadLinks([]);
    setNewLink(BLANK_LINK);
    setPublished(false);
    setFullDetails(null);
    setLoadingDetails(true);
    setMediaType(result.media_type);

    try {
      const mt  = result.media_type; // "movie" or "tv"
      const res = await fetch(`${TMDB}/${mt}/${result.id}?api_key=${TMDB_KEY}&append_to_response=credits,external_ids`);
      const tmb = await res.json();

      const imdbID = tmb.external_ids?.imdb_id || "";

      let seasonInfo = null;

      if (mt === "tv") {
        const totalSeasons = tmb.number_of_seasons || 1;
        const list = Array.from({ length: totalSeasons }, (_, i) => i + 1);
        seasonInfo = {
          seasonRange: { start: 1, end: totalSeasons, list },
          seasonText: totalSeasons > 1 ? `Season 1-${totalSeasons}` : "Season 1",
          episodesPerSeason: [],  // can be fetched per-season if needed
          overview: tmb.overview,
        };
      }

      setFullDetails({ tmdb: tmb, mediaType: mt, imdbID, seasonInfo });
    } catch (e) {
      console.error(e);
    }
    setLoadingDetails(false);
  }, []);

  const handleUnselect = () => {
    setSelectedResult(null);
    setFullDetails(null);
    setDownloadLinks([]);
    setPublished(false);
    setMediaType(null);
    setEditingTmdbId(null);
  };

  // ── Link form helpers ──────────────────────────────────────────────────────
  const setField = (field) => (e) => setNewLink(p => ({ ...p, [field]: e.target.value }));

  const handleAddLink = () => {
    if (!canAdd) return;
    if (mediaType === "tv") {
      setDownloadLinks(prev => [
        ...prev,
        {
          resolution: newLink.resolution,
          quality: newLink.quality,
          audioTag: newLink.audioTag,
          size: newLink.size,
          customSuffix: newLink.customSuffix,
          label: buildLabel(newLink),
          seasons: [],
        },
      ]);
    } else {
      setDownloadLinks(prev => [...prev, { ...newLink, label: buildLabel(newLink) }]);
    }
    setNewLink(p => ({ ...BLANK_LINK, resolution: p.resolution, quality: p.quality, audioTag: p.audioTag }));
  };

  const handleRemoveLink = (index) =>
    setDownloadLinks(prev => prev.filter((_, i) => i !== index));

  // Series: edit seasons/episodes inside a single quality block.
  const updateQuality = (index, next) =>
    setDownloadLinks(prev => prev.map((d, i) => (i === index ? next(d) : d)));

  // ── Publish / Update ────────────────────────────────────────────────────────
  const [publishError, setPublishError] = useState(null);

  const executePublish = async () => {
    setPublishError(null);
    const tmdb = fullDetails.tmdb || {};
    const entry = {
      tmdbId:      selectedResult.id,
      mediaType:   fullDetails.mediaType,
      title:       selectedResult.title || selectedResult.name,
      poster:      poster(selectedResult.poster_path),
      genre:       (tmdb.genres || [])[0]?.name || "",
      lang:        tmdb.original_language || "English",
      imdbID:      fullDetails.imdbID || "",
      overview:    tmdb.overview || "",
      rating:      tmdb.vote_average || 0,
      votes:       tmdb.vote_count || 0,
      runtime:     tmdb.runtime || null,
      released:    tmdb.release_date || tmdb.first_air_date || "",
      director:    tmdb.credits?.crew?.filter(c => c.job === "Director").map(c => c.name).join(", ") || "",
      writer:      tmdb.credits?.crew?.filter(c => c.department === "Writing").map(c => c.name).join(", ") || "",
      actors:      (tmdb.credits?.cast || []).slice(0, 4).map(c => c.name),
      downloadLinks,
      seasonEpisodes: [],
      publishedAt: editingTmdbId != null
        ? (publishedList.find((p) => p.tmdbId === editingTmdbId)?.publishedAt || new Date().toISOString())
        : new Date().toISOString(),
    };
    try {
      if (editingTmdbId != null) await moviesApi.update(entry);
      else await moviesApi.add(entry);
      const updated = await moviesApi.list();
      setPublishedList(updated);
      setPublished(true);
    } catch (e) {
      console.error("Publish failed:", e);
      if (e.message?.includes("Unauthorized") || e.message?.includes("Admin")) {
        setIsAdminUnlocked(false);
        moviesApi.clearAdminPassword();
      }
      setPublishError(e.message || "Failed to publish. Is the backend running?");
    }
  };

  const handlePublish = async () => {
    if (published || !selectedResult || !fullDetails) return;
    // Updating existing movie requires admin auth
    if (editingTmdbId != null && !isAdminUnlocked) {
      requestAdminAccess("update", selectedTitle, executePublish);
      return;
    }
    await executePublish();
  };

  // ── Edit an already-published movie/series ─────────────────────────────────
  const startEdit = async (entry) => {
    setEditingTmdbId(entry.tmdbId);
    setPublished(false);
    setSelectedResult({
      id: entry.tmdbId,
      title: entry.title,
      name: entry.title,
      poster_path: null,
      media_type: entry.mediaType,
    });
    setFullDetails(null);
    setLoadingDetails(true);
    setMediaType(entry.mediaType);
    try {
      const mt = entry.mediaType;
      const res = await fetch(`${TMDB}/${mt}/${entry.tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits,external_ids`);
      const tmb = await res.json();
      const imdbID = tmb.external_ids?.imdb_id || entry.imdbID || "";
      let seasonInfo = null;
      if (mt === "tv") {
        const totalSeasons = Math.max(
          tmb.number_of_seasons || 0,
          (entry.downloadLinks && entry.downloadLinks[0]?.seasons?.length) || 0,
          1
        );
        const list = Array.from({ length: totalSeasons }, (_, i) => i + 1);
        seasonInfo = {
          seasonRange: { start: 1, end: totalSeasons, list },
          seasonText: totalSeasons > 1 ? `Season 1-${totalSeasons}` : "Season 1",
          episodesPerSeason: [],
          overview: tmb.overview,
        };
      }
      setFullDetails({ tmdb: tmb, mediaType: mt, imdbID, seasonInfo });
    } catch (e) {
      console.error(e);
    }
    setLoadingDetails(false);
    setDownloadLinks(
      entry.downloadLinks ? JSON.parse(JSON.stringify(entry.downloadLinks)) : []
    );
  };

  // ── Delete a published movie/series ─────────────────────────────────────────
  const handleDelete = async (tmdbId) => {
    try {
      await moviesApi.remove(tmdbId);
      const updated = await moviesApi.list();
      setPublishedList(updated);
      if (editingTmdbId === tmdbId) handleUnselect();
    } catch (e) {
      console.error("Delete failed:", e);
      if (e.message?.includes("Unauthorized") || e.message?.includes("Admin")) {
        setIsAdminUnlocked(false);
        moviesApi.clearAdminPassword();
      }
      alert(e.message || "Failed to delete movie.");
    }
  };

  const selectedTitle = selectedResult?.title || selectedResult?.name || "";
  const isPublished   = publishedList.some(p => p.tmdbId === selectedResult?.id);

  return (
    <>
      <div className="am-page">

        {/* ══════════ LEFT PANEL ══════════ */}
        <aside className="am-panel">
          <div className="am-panel-header">
            <div className="am-panel-header-row">
              <h2 className="am-panel-title"><i className="fa fa-film" /> Add Movie</h2>
              <div className="am-admin-pill-wrap">
                {isAdminUnlocked ? (
                  <span className="am-admin-pill am-admin-pill--unlocked" title="Admin access unlocked for this session">
                    <i className="fa fa-unlock-alt" /> Admin
                    <button className="am-pill-lock-btn" onClick={handleLockAdmin} title="Lock Admin Access">
                      <i className="fa fa-lock" />
                    </button>
                  </span>
                ) : (
                  <button
                    className="am-admin-pill am-admin-pill--locked"
                    onClick={() => requestAdminAccess("manage", "movie management", () => {})}
                    title="Click to enter admin password"
                  >
                    <i className="fa fa-lock" /> Admin Lock
                  </button>
                )}
              </div>
            </div>
            <p className="am-panel-sub">Search TMDB · add quality links · publish.</p>
          </div>

          {/* Published movies management */}
          {/* Mode toggle — only one function visible at a time */}
          <div className="am-mode-toggle">
            <button
              className={`am-mode-btn ${mode === "add" ? "am-mode-btn--active" : ""}`}
              onClick={() => setMode("add")}
            >
              <i className="fa fa-plus" /> Add New
            </button>
            <button
              className={`am-mode-btn ${mode === "manage" ? "am-mode-btn--active" : ""}`}
              onClick={() => setMode("manage")}
            >
              <i className="fa fa-edit" /> Manage / Edit
            </button>
          </div>

          {mode === "manage" ? (
            <div className="am-manage-view">
              <div className="am-manage-head">
                <span className="am-manage-count">Published: {publishedList.length}</span>
              </div>
              {publishedList.length === 0 ? (
                <p className="am-no-links">No published movies yet. Switch to “Add New” to publish one.</p>
              ) : (
                <>
                  <div className="am-search-wrap">
                    <i className="fa fa-search am-search-icon" />
                    <input
                      className="am-search-input"
                      type="text"
                      placeholder="Search your published titles…"
                      value={manageQuery}
                      onChange={(e) => setManageQuery(e.target.value)}
                      autoComplete="off"
                    />
                    {manageQuery && (
                      <button className="am-search-clear" onClick={() => setManageQuery("")} title="Clear">×</button>
                    )}
                  </div>
                  <ul className="am-managed-list">
                    {publishedList
                      .filter((p) => p.title.toLowerCase().includes(manageQuery.trim().toLowerCase()))
                      .map((p) => (
                        <li key={p.tmdbId} className="am-managed-item">
                          <span className="am-managed-name">
                            {p.title}
                            <span className={`am-managed-type ${p.mediaType === "tv" ? "am-tag-type" : "am-tag-genre"}`}>
                              {p.mediaType === "tv" ? "Series" : "Movie"}
                            </span>
                          </span>
                          <span className="am-managed-actions">
                            <button
                              className="am-mini-btn"
                              onClick={() => requestAdminAccess("edit", p.title, () => { startEdit(p); setMode("add"); })}
                              title="Edit (Requires Admin)"
                            >
                              Edit
                            </button>
                            <button
                              className="am-mini-btn am-mini-btn--danger"
                              onClick={() => requestAdminAccess("delete", p.title, () => handleDelete(p.tmdbId))}
                              title="Delete (Requires Admin)"
                            >
                              Delete
                            </button>
                          </span>
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </div>
          ) : (
          <>
          {/* Search */}
          <div className="am-search-wrap">
            <i className={`fa ${searching ? "fa-spinner fa-spin" : "fa-search"} am-search-icon`} />
            <input
              id="am-search"
              className="am-search-input"
              type="text"
              placeholder="Search any movie or TV show…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoComplete="off"
            />
            {query && (
              <button className="am-search-clear" onClick={() => { setQuery(""); setSearchResults([]); }} title="Clear">×</button>
            )}
          </div>

          {/* Search results */}
          {searchResults.length > 0 && !selectedResult && (
            <div className="am-movie-list">
              {searchResults.map(r => (
                <div
                  key={r.id}
                  className="am-movie-item"
                  onClick={() => handleSelectResult(r)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === "Enter" && handleSelectResult(r)}
                >
                  <img
                    className="am-movie-thumb"
                    src={poster(r.poster_path, "w92") || "https://placehold.co/42x60/111/333/png?text=?"}
                    alt={r.title || r.name}
                  />
                  <div className="am-movie-meta">
                    <span className="am-movie-name">{r.title || r.name}</span>
                    <div className="am-movie-tags">
                      <span className={`am-tag ${r.media_type === "tv" ? "am-tag-type" : "am-tag-genre"}`}>
                        {r.media_type === "tv" ? "Series" : "Movie"}
                      </span>
                      <span className="am-tag am-tag-year">
                        {(r.release_date || r.first_air_date || "").slice(0, 4)}
                      </span>
                      {r.vote_average > 0 && (
                        <span className="am-tag am-tag-rating">⭐ {r.vote_average.toFixed(1)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state / searching hint */}
          {!selectedResult && searchResults.length === 0 && !searching && (
            <div className="am-search-hint">
              {query.trim() ? (
                <p>No results found for <strong>"{query}"</strong></p>
              ) : (
                <p>Type a title above to search the TMDB database.</p>
              )}
            </div>
          )}

          {/* Selected movie info strip */}
          {selectedResult && (
            <div className="am-selected-strip">
              <img
                className="am-selected-thumb"
                src={poster(selectedResult.poster_path, "w92") || "https://placehold.co/38x54/111/333/png?text=?"}
                alt={selectedTitle}
              />
              <div className="am-selected-meta">
                <span className="am-selected-title">{selectedTitle}</span>
                <span className="am-selected-year">{(selectedResult.release_date || selectedResult.first_air_date || "").slice(0, 4)}</span>
              </div>
              <button className="am-deselect-btn" onClick={handleUnselect} title="Choose another">×</button>
            </div>
          )}

          {/* Loading full details */}
          {loadingDetails && (
            <div className="am-loading-details">
              <i className="fa fa-spinner fa-spin" /> Fetching details from TMDB…
            </div>
          )}

          {/* ── LINK BUILDER ── */}
          {selectedResult && fullDetails && !loadingDetails && (
            <div className="am-link-builder">
              <h3 className="am-section-title"><i className="fa fa-download" /> Download Links</h3>

              {/* Added chips */}
              {downloadLinks.length > 0 && (
                <div className="am-chips-list">
                  {downloadLinks.map((d, i) => (
                    <div key={i}>
                      <QualityChip d={d} index={i} onRemove={handleRemoveLink} mediaType={mediaType} />
                      {mediaType === "tv" && (
                        <SeriesQualityEditor
                          quality={d}
                          onChange={(nq) => updateQuality(i, () => nq)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Form */}
              <div className="am-new-link-form">

                {/* Row 1: Resolution + Quality */}
                <div className="am-form-row">
                  <div className="am-form-group">
                    <label className="am-form-label" htmlFor="am-resolution">Resolution</label>
                    <select id="am-resolution" className="am-select" value={newLink.resolution} onChange={setField("resolution")}>
                      {RESOLUTIONS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="am-form-group">
                    <label className="am-form-label" htmlFor="am-quality">Source / Quality</label>
                    <select id="am-quality" className="am-select" value={newLink.quality} onChange={setField("quality")}>
                      {QUALITIES.map(q => <option key={q}>{q}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 2: Audio + Size */}
                <div className="am-form-row">
                  <div className="am-form-group">
                    <label className="am-form-label" htmlFor="am-audio">Audio Tag</label>
                    <select id="am-audio" className="am-select" value={newLink.audioTag} onChange={setField("audioTag")}>
                      {AUDIO_TAGS.map(a => <option key={a}>{a}</option>)}
                    </select>
                  </div>
                  <div className="am-form-group">
                    <label className="am-form-label" htmlFor="am-size">File Size</label>
                    <input id="am-size" className="am-input" type="text" placeholder="e.g. 350MB, 1.2GB" value={newLink.size} onChange={setField("size")} />
                  </div>
                </div>

                {/* Extra tags */}
                <div className="am-form-group am-form-group--full">
                  <label className="am-form-label" htmlFor="am-suffix">
                    Extra Tags <span className="am-form-hint">(optional)</span>
                  </label>
                  <input id="am-suffix" className="am-input" type="text" placeholder="x264 Msubs  /  10bit HDR  /  HEVC" value={newLink.customSuffix} onChange={setField("customSuffix")} />
                </div>

                {/* Label preview */}
                {previewLabel && (
                  <div className="am-label-preview">
                    <span className="am-label-preview-tag">Preview:</span>
                    <span className="am-label-preview-text">{previewLabel}</span>
                  </div>
                )}

                {/* URLs */}
                <div className="am-url-section">
                  {mediaType === "movie" ? (
                    // Movies: single download link
                    <div className="am-form-group am-form-group--full">
                      <label className="am-form-label" htmlFor="am-download-link">
                        <i className="fa fa-download" /> Download Link
                        <span className="am-form-hint"> (required for movie)</span>
                      </label>
                      <input id="am-download-link" className="am-input" type="url" placeholder="https://drive.google.com/…" value={newLink.downloadLink} onChange={setField("downloadLink")} />
                    </div>
                  ) : (
                    // TV Shows: links are added per season/episode below
                    <p className="am-no-links">
                      Click <strong>“Add This Quality”</strong> above, then add each
                      Season (with its batch link) and Episodes under it.
                    </p>
                  )}
                </div>

                <button id="am-add-link-btn" className="am-btn am-btn-add am-btn-add--full" onClick={handleAddLink} disabled={!canAdd}>
                  <i className="fa fa-plus" /> Add This Quality
                </button>
              </div>

              {/* Publish row */}
              <div className="am-publish-row">
                <button
                  id="am-publish-btn"
                  className={`am-btn am-btn-publish ${published ? "am-btn-published" : ""}`}
                  onClick={handlePublish}
                  disabled={published}
                >
                  {published
                    ? <span><i className="fa fa-check-circle" /> {editingTmdbId != null ? "Updated!" : "Published!"}</span>
                    : <span><i className="fa fa-rocket" /> {editingTmdbId != null ? "Update" : "Publish"} {mediaType === "tv" ? "Series" : "Movie"}</span>}
                </button>
                <button id="am-back-btn" className="am-btn am-btn-back" onClick={handleUnselect}>
                  <i className="fa fa-arrow-left" /> Back
                </button>
              </div>

              {published && (
                <div className="am-success-banner">
                  <i className="fa fa-check-circle" />
                  <span><strong>{selectedTitle}</strong> has been {editingTmdbId != null ? "updated" : "published"}!</span>
                </div>
              )}
              {publishError && (
                <div className="am-success-banner" style={{ background: "#ff4444" }}>
                  <i className="fa fa-exclamation-circle" />
                  <span>{publishError}</span>
                </div>
              )}
            </div>
          )}
          </>
        )}
        </aside>

        {/* ══════════ RIGHT PANEL ══════════ */}
        <section className="am-preview-panel">
          {!fullDetails ? (
            <div className="am-empty-preview">
              <div className="am-empty-icon">🎬</div>
              <h3>{loadingDetails ? "Loading details…" : "Select a movie to preview"}</h3>
              <p>
                {loadingDetails
                  ? "Fetching data from TMDB…"
                  : "Search any title above and click it to see a live preview of how it will look on the site."}
              </p>
            </div>
          ) : (
            <>
              <div className="am-preview-badge"><i className="fa fa-eye" /> Live Preview</div>
              {isPublished && (
                <div className="am-published-note">
                  <i className="fa fa-check-circle" /> This title is already in your published list.
                </div>
              )}
              <MoviePreview details={fullDetails} downloadLinks={downloadLinks} />
            </>
          )}
        </section>
      </div>

      {/* ══════════ ADMIN PASSWORD MODAL ══════════ */}
      {adminModalOpen && (
        <div className="am-modal-overlay" onClick={() => !adminModalLoading && setAdminModalOpen(false)}>
          <div className="am-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="am-modal-header">
              <div className="am-modal-icon-wrap">
                <i className="fa fa-lock" />
              </div>
              <div className="am-modal-title-box">
                <h3 className="am-modal-title">{adminModalConfig.title || "Admin Authentication"}</h3>
                <p className="am-modal-desc">{adminModalConfig.desc}</p>
              </div>
              <button
                type="button"
                className="am-modal-close"
                onClick={() => !adminModalLoading && setAdminModalOpen(false)}
                disabled={adminModalLoading}
                title="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAdminSubmit} className="am-modal-form">
              <div className="am-form-group am-form-group--full">
                <label className="am-form-label" htmlFor="am-admin-password-input">
                  Enter Admin Password
                </label>
                <div className="am-pass-input-box">
                  <input
                    id="am-admin-password-input"
                    className="am-input am-pass-input"
                    type={showPassword ? "text" : "password"}
                    placeholder="Admin password…"
                    value={adminInputPass}
                    onChange={(e) => setAdminInputPass(e.target.value)}
                    autoFocus
                    disabled={adminModalLoading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="am-pass-toggle-btn"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    <i className={`fa ${showPassword ? "fa-eye-slash" : "fa-eye"}`} />
                  </button>
                </div>
              </div>

              {adminModalError && (
                <div className="am-modal-error-alert">
                  <i className="fa fa-exclamation-circle" />
                  <span>{adminModalError}</span>
                </div>
              )}

              <div className="am-modal-btn-row">
                <button
                  type="button"
                  className="am-btn am-btn-back"
                  onClick={() => setAdminModalOpen(false)}
                  disabled={adminModalLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="am-btn am-btn-add am-btn-verify-submit"
                  disabled={adminModalLoading || !adminInputPass.trim()}
                >
                  {adminModalLoading ? (
                    <span><i className="fa fa-spinner fa-spin" /> Verifying…</span>
                  ) : (
                    <span><i className="fa fa-unlock-alt" /> Authenticate</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default AddMovies;
