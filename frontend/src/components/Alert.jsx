import { Link } from "react-router-dom";
import "./Alert.css"

const Alert = () => {
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
    <button className="alert-x">
      <i className="fa fa-times" aria-hidden="true"></i>
    </button>
  </div>
  )
}

export default Alert
