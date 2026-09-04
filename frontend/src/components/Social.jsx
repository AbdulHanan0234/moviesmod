import "./Social.css";


const Social = () => {
  return (
    <div className="social body d-flex justify-content-center align-items-center">
      <button className="btn-telegram">
        <i className="fa fa-telegram pe-1" aria-hidden="true"></i>
        JOIN TELEGRAM
      </button>
      <button className="btn-social">English Movies</button>
      <button className="btn-social">Dual Audio</button>
      <button className="btn-social">Anime</button>
      <button className="btn-social">K-Drama Series</button>
      <button className="btn-social">WeB Series</button>
      <button className="btn-social">Hindi Series</button>
      <button className="btn-4k">
        <i className="fa fa-film pe-1" aria-hidden="true"></i>
        4K MOVIES
      </button>
    </div>
  );
};

export default Social;
