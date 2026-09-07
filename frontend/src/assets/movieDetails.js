const VIDEO_AUDIO = {
  English: "English With Subtitles",
  Hindi: "Hindi",
  Dubbed: "Dual Audio {Hindi-English}",
  Subbed: "Org Audio With English Subs",
  "Multi Audio": "Multi Audio {Hindi-English-Spanish}",
};

const SCREEN_BASE = "https://placehold.co/640x360/09090b/e4e4e7/png?text=";

const textPart = (text) =>
  encodeURIComponent(text)
    .replace(/%20/g, "+")
    .replace(/%27/g, "'");

const genScreenshots = (movie) => {
  if (Array.isArray(movie.screenshots) && movie.screenshots.length > 0) {
    return movie.screenshots;
  }
  return [1, 2, 3].map((n) => `${SCREEN_BASE}${textPart(movie.title)}+Screen+${n}`);
};

const getAudioTag = (movie) => {
  const lang = movie.lang;
  if (lang === "Dubbed") return "{Hindi-English}";
  if (lang === "Multi Audio") return "{Hindi-English-Spanish}";
  if (lang === "Hindi") return "{Hindi}";
  if (lang === "Subbed") return "{Org Audio}";
  return "{English}";
};

export const parseSeasonRange = (title) => {
  const rangeMatch = title.match(/(?:Season|S)\s*(\d+)\s*[-–]\s*(\d+)/i);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    const list = [];
    for (let i = start; i <= end; i++) list.push(i);
    return { start, end, list };
  }
  const singleMatch = title.match(/(?:Season|S)\s*(\d+)/i);
  if (singleMatch) {
    const n = parseInt(singleMatch[1], 10);
    return { start: n, end: n, list: [n] };
  }
  return { start: 1, end: 1, list: [1] };
};

const genDownloads = (movie) => {
  const audioTag = getAudioTag(movie);

  if (movie.type === "Series") {
    const { list } = parseSeasonRange(movie.title);

    const downloads = [];
    for (const s of list) {
      downloads.push(
        { label: `Season ${s} ${audioTag} 480p x264 Msubs [200MB]`, cls: "480" },
        { label: `Season ${s} ${audioTag} 720p 10Bit Msubs [350MB]`, cls: "720" },
        { label: `Season ${s} ${audioTag} 1080p x264 Msubs [1GB]`, cls: "1080" }
      );
    }
    return downloads;
  }

  return [
    { label: `${movie.title} ${audioTag} 480p x264 Msubs [200MB]`, cls: "480" },
    { label: `${movie.title} ${audioTag} 720p 10Bit Msubs [350MB]`, cls: "720" },
    { label: `${movie.title} ${audioTag} 1080p x264 Msubs [1GB]`, cls: "1080" },
  ];
};

const buildCategories = (movie) => {
  const categories = new Set();
  const isSeries = movie.type === "Series";

  categories.add(isSeries ? "Series" : "Movies");
  categories.add(movie.genre);

  const lang = movie.lang || "";
  if (lang === "Dubbed") categories.add("Dual Audio");
  if (lang === "Hindi") categories.add("Hindi");
  if (lang === "Subbed") categories.add("Subbed");
  if (lang === "English") categories.add("English");

  return Array.from(categories).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
};

const BOILERPLATE =
  "MoviesMod.Org is The Best Website/Platform For Bollywood And Hollywood HD Movies. We Provide Direct Google Drive Download Links For Fast And Secure Downloading. Just Click On the Download Button And Follow the Steps To Download And Watch Movies Online For Free.";

export const getMovieDetails = (movie) => {
  // ── Published (user-added) movies: render from stored data ───────────────
  if (movie._published) {
    const isSeries = movie.type === "Series";

    const seasonNums = new Set();
    (movie.downloadLinks || []).forEach((d) =>
      (d.seasons || []).forEach((s) => seasonNums.add(s.season))
    );
    const seasonList = [...seasonNums].filter(Boolean).sort((a, b) => a - b);
    const seasonRange = isSeries && seasonList.length
      ? {
          start: seasonList[0],
          end: seasonList[seasonList.length - 1],
          list: seasonList,
        }
      : { start: 1, end: 1, list: [1] };

    const downloads = (movie.downloadLinks || []).map((d) => ({
      label: d.label,
      cls: null,
      href: d.downloadLink || "#",
      seasons: isSeries ? (d.seasons || []) : [],
      isSeries,
    }));

    const audioTag = movie.lang === "Dubbed"
      ? "{Hindi-English}"
      : movie.lang === "Multi Audio"
        ? "{Hindi-English-Spanish}"
        : movie.lang === "Hindi"
          ? "{Hindi}"
          : movie.lang === "Subbed"
            ? "{Org Audio}"
            : "{English}";

    const seasonText = isSeries
      ? (seasonRange.list.length > 1
          ? `Season ${seasonRange.start}-${seasonRange.end}`
          : `Season ${seasonRange.start}`)
      : null;

    const quals = (movie.downloadLinks || [])
      .map((d) => `${d.resolution}${d.size ? ` [${d.size}]` : ""}`)
      .filter(Boolean);
    const qualityText = quals.length
      ? quals.join(" || ")
      : "480p [200MB] || 720p [350MB] || 1080p [1GB]";

    const releaseTitle = `Download ${movie.title}${
      isSeries && !/Season/i.test(movie.title) ? ` (${seasonText})` : ""
    } ${audioTag} Esubs WeB-DL ${qualityText}`;

    const blurb = `Download ${movie.title} ${
      VIDEO_AUDIO[movie.lang] || movie.lang
    } and is available in 480p, 720p & 1080p. This ${
      movie.type.toLowerCase()
    } is based on ${movie.genre || "your favorite title"}. Click on the links below to proceed.`;

    return {
      imdbID: movie.imdbID || "",
      releaseTitle,
      downloads,
      screenshots: genScreenshots(movie),
      categories: buildCategories(movie),
      blurb,
      description: [blurb, "", BOILERPLATE],
      size: (movie.downloadLinks || [])
        .map((d) => d.size)
        .filter(Boolean)
        .join(" & ") || "200MB & 350MB & 1GB",
      quality: (movie.downloadLinks || [])
        .map((d) => `${d.resolution} ${d.quality}`)
        .filter(Boolean)
        .join(" & ") || "480p & 720p & 1080p – WeB-DL",
      format: "Mkv",
      subtitles: "Yes (English)",
      season: seasonText,
      seasonRange,
    };
  }

  const imdbID = "";
  const downloads = genDownloads(movie);
  const audioTag = getAudioTag(movie);

  const isSeries = movie.type === "Series";

  const seasonRange = isSeries ? parseSeasonRange(movie.title) : null;
  const seasonText = isSeries
    ? (seasonRange.list.length > 1
        ? `Season ${seasonRange.start}-${seasonRange.end}`
        : `Season ${seasonRange.start}`)
    : null;
  const hasSeasonInTitle = isSeries && /:\s*Season\s*\d+|:\s*S\d+|\(\s*Season\s/i.test(movie.title);
  const seasonTag = isSeries
    ? (hasSeasonInTitle ? "" : ` (${seasonText})`)
    : "";

  const releaseTitle =
    `Download ${movie.title}${seasonTag} ${audioTag} Esubs WeB-DL 480p [200MB] || 720p [350MB] || 1080p [1GB]`;

  const blurb =
    `Download ${movie.title} ${VIDEO_AUDIO[movie.lang] || movie.lang} and is available in 480p, 720p & 1080p. This ${movie.type.toLowerCase()} is based on ${movie.genre}. Click on the links below to proceed.`;

  return {
    imdbID,
    releaseTitle,
    downloads,
    screenshots: genScreenshots(movie),
    categories: buildCategories(movie),
    blurb,
    description: [blurb, "", BOILERPLATE],
    size: "200MB & 350MB & 1GB (Each Episode)",
    quality: "480p & 720p & 1080p – WeB-DL",
    format: "Mkv",
    subtitles: "Yes (English)",
    season: seasonText,
    seasonRange,
  };
};
