// ─── Language & genre normalisation ───────────────────────────────────────────
// TMDB stores codes ("en", "hi") and full genre names ("Science Fiction"),
// while navbar/tag links use display names ("English", "Sci-Fi"). Everything
// funnels through these helpers so tags, nav dropdowns and the home page agree.

const LANG_CODES = {
  english: "en", hindi: "hi", spanish: "es", tamil: "ta", telugu: "te",
  kannada: "kn", malayalam: "ml", korean: "ko", japanese: "ja",
  french: "fr", german: "de", chinese: "zh", mandarin: "zh", italian: "it",
};

const LANG_NAMES = {
  en: "English", hi: "Hindi", es: "Spanish", ta: "Tamil", te: "Telugu",
  kn: "Kannada", ml: "Malayalam", ko: "Korean", ja: "Japanese",
  fr: "French", de: "German", zh: "Chinese", it: "Italian",
};

const SOUTH_INDIAN = ["ta", "te", "kn", "ml"];

export const langCode = (v) => {
  const s = String(v || "").trim().toLowerCase();
  return LANG_CODES[s] || s;
};

export const langName = (v) => LANG_NAMES[langCode(v)] || String(v || "");

// Movies grouped as "Dual Audio / Multi Audio" on the site: anything that
// isn't native English or Hindi.
const isMultiAudio = (m) => !["en", "hi"].includes(m.lang);

export const matchesLang = (m, value) => {
  const code = langCode(value);
  if (code === "multi" || code === "dual audio" || code === "dubbed" || code === "multi audio") {
    return isMultiAudio(m);
  }
  if (code === "south" || code === "south indian") return SOUTH_INDIAN.includes(m.lang);
  return m.lang === code;
};

const genreAlias = (v) => {
  const s = String(v || "").trim().toLowerCase();
  if (s === "sci-fi" || s === "scifi") return "science fiction";
  return s;
};

export const matchesGenre = (m, value) =>
  String(m.genre || "").toLowerCase() === genreAlias(value);

// ─── Sidebar / chip tags ─────────────────────────────────────────────────────

const tagRules = [
  { name: "English", test: (m) => m.lang === "en" },
  { name: "Hindi", test: (m) => m.lang === "hi" },
  { name: "Multi Audio", test: isMultiAudio },
  { name: "Spanish", test: (m) => m.lang === "es" },
  {
    name: "2026",
    test: (m) => (m.uploadedAt ? new Date(m.uploadedAt).getFullYear() === 2026 : false),
  },
  {
    name: "Drama Series",
    test: (m) => m.type === "Series" && matchesGenre(m, "Drama"),
  },
  {
    name: "Spanish Series",
    test: (m) => m.lang === "es" && m.type === "Series",
  },
  // No OTT/platform field exists in the data, so "Netflix" is approximated as
  // top-rated series until real platform info is stored on the documents.
  {
    name: "Netflix",
    test: (m) => m.type === "Series" && (m.rating || 0) >= 8,
  },
];

export const getTags = () => tagRules.map((t) => ({ name: t.name }));

export const getMoviesForTag = (name, movies = []) => {
  const rule = tagRules.find(
    (t) => t.name.toLowerCase() === String(name).toLowerCase()
  );
  if (!rule) return [];
  return movies.filter(rule.test);
};

// ─── OTT dropdown buckets ────────────────────────────────────────────────────
// Heuristic groupings over the fields we have (type / lang / genre / rating) —
// same caveat as the Netflix tag above.

const OTT_BUCKETS = {
  netflix: (m) => m.type === "Series" && (m.rating || 0) >= 8,
  "amazon prime": (m) => m.type === "Series" && (m.rating || 0) >= 7 && (m.rating || 0) < 8,
  "disney+ hotstar": (m) => matchesGenre(m, "Animation"),
  sonyliv: (m) => m.lang === "hi" && m.type === "Series",
  zee5: (m) => m.lang === "hi" && m.type === "Movie",
  "mx player": (m) => isMultiAudio(m) && m.type === "Series",
};

export const getMoviesForOtt = (name, movies = []) => {
  const bucket = OTT_BUCKETS[String(name || "").trim().toLowerCase()];
  return bucket ? movies.filter(bucket) : [];
};
