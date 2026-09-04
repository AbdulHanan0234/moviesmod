import "./MovieHeader.css";
import { Link } from "react-router-dom";
import { getTags } from "../assets/Tags";

const formatRelativeTime = (date) => {
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffMonth > 0) return `${diffMonth} month${diffMonth > 1 ? "s" : ""} ago`;
  if (diffWeek > 0) return `${diffWeek} week${diffWeek > 1 ? "s" : ""} ago`;
  if (diffDay > 0) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  if (diffHr > 0) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
  if (diffMin > 0) return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`;
  return "Just now";
};

const MovieHeader = ({ detail }) => {
  const tagNames = getTags().map((t) => t.name);

  const to = (c) =>
    tagNames.includes(c)
      ? `/?tag=${encodeURIComponent(c)}`
      : `/?q=${encodeURIComponent(c)}`;

  const categories = (detail.categories || []).slice(0, 10);
  const uploadedAt = detail.uploadedAt ? formatRelativeTime(detail.uploadedAt) : "";

  return (
    <>
      <div className="breadcrumb-row">
        <Link to="/">
          <i className="fa fa-home" aria-hidden="true"></i>
        </Link>
        <span className="sep ">,</span>
        {categories.map((c, i) => (
          <span key={c}>
            <Link className="cat-badge" to={to(c)}>
              {c}
            </Link>
            {i < categories.length - 1 && <span className="sep">,</span>}
          </span>
        ))}
      </div>

      <h1 className="post-title">{detail.releaseTitle}</h1>

      <div className="post-meta">
        {uploadedAt && (
          <span>
            <i className="fa fa-calendar upload-time" aria-hidden="true" />
            {" "}{uploadedAt}
          </span>
        )}
        <span>
          <p className="comments-a">
            <i className="fa fa-comments " aria-hidden="true" />
            No Comments
          </p>
        </span>
      </div>
    </>
  );
};

export default MovieHeader;
