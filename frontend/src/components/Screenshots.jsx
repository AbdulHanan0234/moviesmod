import { useState } from "react";
import "./Screenshots.css";

const Screenshots = ({ images, title }) => {
  const [failed, setFailed] = useState({});

  if (!images || images.length === 0) return null;

  const visible = images.filter((_, i) => !failed[i]);

  if (visible.length === 0) return null;

  return (
    <>
      <h2 className="section-heading">
        <i className="fa fa-image" aria-hidden="true" /> Screenshots
      </h2>
      <div className="screenshots">
        {images.map((src, i) =>
          failed[i] ? null : (
            <img
              key={i}
              src={src}
              alt={`${title} screenshot ${i + 1}`}
              loading="lazy"
              onError={() => setFailed((prev) => ({ ...prev, [i]: true }))}
            />
          ),
        )}
      </div>
    </>
  );
};

export default Screenshots;