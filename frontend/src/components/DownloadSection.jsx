import "./DownloadSection.css";

const renderLabel = (label) => {
  if (!label) return null;
  const nodes = [];
  const re = /\{[^}]*\}|x26\d|10bit|\[[^\]]*\]/gi;
  let last = 0;
  let m;
  while ((m = re.exec(label)) !== null) {
    if (m.index > last) nodes.push(label.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("{")) {
      nodes.push(
        <span className="text-red" key={m.index}>
          {tok}
        </span>
      );
    } else if (/x26\d|10bit/i.test(tok)) {
      nodes.push(
        <span className="text-blue" key={m.index}>
          {tok}
        </span>
      );
    } else {
      nodes.push(
        <span className="text-teal" key={m.index}>
          {tok}
        </span>
      );
    }
    last = re.lastIndex;
  }
  if (last < label.length) nodes.push(label.slice(last));
  return <span className="text-teal">{nodes}</span>;
};

const buildHeadingTitle = (movie, detail) => {
  const raw = movie.title.replace(/^Download\s+/i, "");

  let name = raw
    .replace(/\s*[([:].*/, "")
    .replace(/\s+\b(20\d\d|19\d\d|Season\s*[^)]+|S\d+)\b.*/i, "")
    .trim();

  let seasonTag = "";
  const seasonMatch = raw.match(/\((Season\s*[^)]+)\)/i);
  if (seasonMatch) {
    seasonTag = seasonMatch[1].replace(/Season\s*/i, "Season ");
  } else {
    const colonMatch = raw.match(/:\s*(Season\s*\d+|S\d+)/i);
    if (colonMatch) {
      seasonTag = colonMatch[1].replace(/Season\s*/i, "Season ");
    } else if (detail.season) {
      seasonTag = detail.season;
    }
  }

  const yearMatch = raw.match(/\b(20\d\d|19\d\d)\b/);
  const yearStr = yearMatch ? yearMatch[1] : detail.year ? String(detail.year) : "";

  const dualMatch = raw.match(/(?:Dual|Multi)?\s*Audio\s*[{{(]([^}})]+)[}})]/i) || raw.match(/\(([^)]+Audio)\)/i);
  const langStr = dualMatch
    ? dualMatch[1].replace(/Audio/i, "").replace(/,/g, "-").replace(/\s+/g, "")
    : detail.language
      ? detail.language.replace(/,\s*/g, "-")
      : movie.lang || "";

  const quals = [];
  if (detail.downloads && detail.downloads.length > 0) {
    detail.downloads.forEach((d) => {
      const q = d.cls ? `${d.cls}p` : (d.label.match(/\b(480p|720p|1080p|2160p|4K)\b/i) || [])[1];
      if (q && !quals.includes(q)) quals.push(q);
    });
  }
  if (quals.length === 0) quals.push("480p", "720p", "1080p");

  const qualityText = quals.length === 1
    ? quals[0]
    : quals.length === 2
      ? `${quals[0]} & ${quals[1]}`
      : `${quals.slice(0, -1).join(", ")} & ${quals[quals.length - 1]}`;

  let subStr = "";
  if (/Esubs/i.test(raw) || /Esubs/i.test(detail.releaseTitle || "")) {
    subStr = "Esubs";
  } else if (/Msubs/i.test(raw) || /Msubs/i.test(detail.releaseTitle || "")) {
    subStr = "Msubs";
  }

  const parts = [
    "Download",
    name,
    seasonTag,
    yearStr,
    langStr,
    qualityText,
    subStr,
  ].filter(Boolean);

  return parts.join(" ");
};

const DownloadSection = ({ movie, detail }) => {
  return (
    <>
      <h3 className="download-section-heading">
        {buildHeadingTitle(movie, detail)}
      </h3>
      <hr className="download-hr" />
      {detail.downloads.map((d) => (
        <div className="download-group" key={d.label}>
          <h3 className="download-heading">{renderLabel(d.label)}</h3>
          <p className="download-links">
            <a
              className="dl-btn dl-single"
              href={d.href || "#"}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download
            </a>
          </p>
        </div>
      ))}
    </>
  );
};

export default DownloadSection;