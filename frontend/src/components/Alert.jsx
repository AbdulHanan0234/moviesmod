import { Link } from "react-router-dom";
import { useState } from "react";
import "./Alert.css"

const Alert = () => {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="alert rounded-3 d-flex align-items-center justify-content-center text-center">
    <p>
      We have Changed our Official Domain to
      <Link
        to="https://moviesmod.zone/"
        target="_blank"
        className="alert-a px-1"
      >
        MoviesMod
      </Link>
      Bookmarks Now.
    </p>
    <button className="alert-x" onClick={() => setVisible(false)}>
      <i className="fa fa-times" aria-hidden="true"></i>
    </button>
  </div>
  )
}

export default Alert
