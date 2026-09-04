import { Link } from "react-router-dom";
// import "./SeriesSeasons.css";

const renderLabel = (label) => {
  if (!label) return null;
  const nodes = [];
  const re = /\{[^}]*\}|x26\d|10bit|\[[^\]]*\]/gi;
  let last = 0;
  let m;
  while ((m = re.exec(label)) !== null) {
    if (m.index > last) nodes.push(label.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("{"))
      nodes.push(
        <span className="text-red" key={m.index}>
          {tok}
        </span>,
      );
    else if (/x26\d|10bit/i.test(tok))
      nodes.push(
        <span className="text-blue" key={m.index}>
          {tok}
        </span>,
      );
    else
      nodes.push(
        <span className="text-teal" key={m.index}>
          {tok}
        </span>,
      );
    last = re.lastIndex;
  }
  if (last < label.length) nodes.push(label.slice(last));
  return <span className="text-teal">{nodes}</span>;
};

// Build the season list for a quality: use stored seasons, or fall back to the
// show-level season range (links will be placeholders for non-published shows).
const seasonsFor = (d, detail) => {
  if (d.seasons && d.seasons.length) return d.seasons;
  const list = detail?.seasonRange?.list || [];
  return list.map((s) => ({ season: s, batchLink: "#", episodes: [] }));
};

// "Season 1" / "Season 1-5" from a quality's season list.
const seasonRangeText = (seasons) => {
  if (!seasons.length) return "";
  const nums = seasons.map((s) => s.season).sort((a, b) => a - b);
  if (nums.length === 1) return `Season ${nums[0]}`;
  return `Season ${nums[0]}-${nums[nums.length - 1]}`;
};

const SeriesSeasons = ({ movie, detail }) => {
  const qualities = detail?.downloads || [];

  if (qualities.length === 0) {
    return (
      <div className="download-group">
        <p className="am-no-links">No download links added yet.</p>
      </div>
    );
  }

  return (
    <>
      {qualities.map((d, qi) => {
        const seasons = seasonsFor(d, detail);
        const heading = [seasonRangeText(seasons), d.label]
          .filter(Boolean)
          .join(" ");
        return (
          <div className="download-group" key={qi}>
            <h3 className="download-heading">{renderLabel(heading)}</h3>
            {seasons.map((s) => (
              <p className="download-links" key={s.season}>
                <a
                  className="dl-btn dl-batch"
                  href={s.batchLink || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Batch/Zip
                </a>
                <Link
                  className="dl-btn dl-single"
                  to={`/series/${movie.id}/season/${s.season}?q=${qi}`}
                >
                  Episodes ({s.episodes?.length || 0})
                </Link>
              </p>
            ))}
          </div>
        );
      })}
    </>
  );
};

export default SeriesSeasons;
