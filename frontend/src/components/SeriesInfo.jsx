import "./SeriesInfo.css";

const renderQuality = (text) => {
  if (!text || typeof text !== "string") return text;
  const regex = /(.*?)(WeB-DL|WEB-DL|Web-DL|BluRay|HDTV|HDRip)(.*)/i;
  const match = text.match(regex);
  if (match) {
    return (
      <>
        {match[1]}
        <span style={{ color: "#ff0000" }}>
          <strong>
            {match[2].toUpperCase() === "WEB-DL" ? "WEB-DL" : match[2]}
          </strong>
        </span>
        {match[3]}
      </>
    );
  }
  return text;
};

const cleanTitle = (rawTitle) => {
  if (!rawTitle || typeof rawTitle !== "string") return rawTitle;
  return rawTitle
    .replace(/^Download\s+/i, "")
    .replace(/:\s*(Season\s*\d+|S\d+)/i, "")
    .replace(/\s*[[(]Season\s*[^)\]]+[)\]]/i, "")
    .replace(/\s*[[(].*/, "")
    .replace(/\s+\b(20\d\d|19\d\d|Season\s*[^)]+|S\d+)\b.*/i, "")
    .replace(/\s+(Dual|Multi)?\s*Audio.*/i, "")
    .replace(/\s+(WeB-DL|WEB-DL|BluRay|HDRip|480p|720p|1080p|2160p|4K).*/i, "")
    .trim();
};

const SeriesInfo = ({ movie, detail, plot }) => {
  if (!detail && !movie) return null;

  const isSeries = movie?.type === "Series";
  const headerTitle = isSeries ? "Series Info:" : "Movie Info:";

  const items = [];

  const displayName = detail?.title || detail?.fullName || movie?.title;
  if (displayName) {
    items.push({ label: "Full Name", value: cleanTitle(displayName) });
  }

  if (detail?.year) {
    items.push({ label: "Year", value: detail.year });
  }

  if (isSeries) {
    const seasonList = detail?.seasonRange?.list;
    const episodesPerSeason = detail?.episodesPerSeason;
    if (seasonList && seasonList.length > 0) {
      const seasonLabel = seasonList.length > 1
        ? seasonList.join(", ")
        : `Season ${seasonList[0]}`;
      items.push({ label: "Seasons", value: seasonLabel });
    } else if (detail?.season) {
      items.push({ label: "Seasons", value: detail.season });
    }
    if (episodesPerSeason && episodesPerSeason.length > 0) {
      items.push({ label: "Episodes", value: episodesPerSeason.join(", ") });
    }
  }

  if (detail?.runtime) {
    items.push({ label: "Duration", value: detail.runtime });
  }

  if (detail?.language) {
    items.push({ label: "Language", value: detail.language });
  }

  if (detail?.size) {
    items.push({ label: "Size", value: detail.size });
  }

  if (detail?.quality) {
    items.push({ label: "Quality", value: detail.quality, isQuality: true });
  }

  if (detail?.format) {
    items.push({ label: "Format", value: detail.format });
  }

  return (
    <div className="series-info-container">
      {items.length > 0 && (
        <>
          <h3>
            <span style={{ color: "#008080" }}> {headerTitle} </span>
          </h3>
          <ul>
            {items.map((item) => (
              <li key={item.label}>
                <strong>{item.label}:</strong>{" "}
                {item.isQuality ? renderQuality(item.value) : item.value}
              </li>
            ))}
          </ul>
        </>
      )}

      {plot && (
        <>
          <h2>
            <span style={{ color: "#008080" }}>Storyline:</span>
          </h2>
          <p>{plot}</p>
        </>
      )}
    </div>
  );
};

export default SeriesInfo;
