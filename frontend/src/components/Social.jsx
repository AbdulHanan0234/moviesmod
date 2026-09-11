import "./Social.css";
import { useNavigate } from "react-router-dom";

const Social = () => {
  const navigate = useNavigate();
  const go = (to) => () => navigate(to);

  return (
    <div className="social body d-flex justify-content-center align-items-center">
      <button className="btn-telegram">
        <i className="fa fa-telegram pe-1" aria-hidden="true"></i>
        JOIN TELEGRAM
      </button>
      <button className="btn-social" onClick={go("/?lang=en&type=movie")}>English Movies</button>
      <button className="btn-social" onClick={go("/?lang=multi&type=movie")}>Dual Audio</button>
      <button className="btn-social" onClick={go("/?lang=ja")}>Anime</button>
      <button className="btn-social" onClick={go("/?lang=ko&type=tv")}>K-Drama Series</button>
      <button className="btn-social" onClick={go("/?type=tv")}>WeB Series</button>
      <button className="btn-social" onClick={go("/?lang=hi&type=tv")}>Hindi Series</button>
      <button className="btn-4k">
        <i className="fa fa-film pe-1" aria-hidden="true"></i>
        4K MOVIES
      </button>
    </div>
  );
};

export default Social;
