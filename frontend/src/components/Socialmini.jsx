import "./Socialmini.css";
import { useNavigate } from "react-router-dom";

const Socialmini = () => {
  const navigate = useNavigate();
  const go = (to) => () => navigate(to);

  return (
    <div className="social body d-flex justify-content-center align-items-center">
      <button className="btn-telegram">
        <i className="fa fa-telegram pe-1" aria-hidden="true"></i>
        JOIN TELEGRAM
      </button>
      <button className="btn-social" onClick={go("/?lang=hi&type=movie")}>Bollywood</button>
      <button className="btn-social" onClick={go("/?lang=ja")}>Animeflix</button>
      <button className="btn-social" onClick={go("/?year=2026")}>Updates</button>
      <button className="btn-4k">
        <i className="fa fa-film pe-1" aria-hidden="true"></i>
        4K UHDMOVIES
      </button>
    </div>
  )
}

export default Socialmini
