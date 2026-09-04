import "./Socialmini.css";

const Socialmini = () => {
  return (
    <div className="social body d-flex justify-content-center align-items-center">
      <button className="btn-telegram">
        <i className="fa fa-telegram pe-1" aria-hidden="true"></i>
        JOIN TELEGRAM
      </button>
      <button className="btn-social">Bollywood</button>
      <button className="btn-social">Animeflix</button>
      <button className="btn-social">Updates</button>
      <button className="btn-4k">
        <i className="fa fa-film pe-1" aria-hidden="true"></i>
        4K UHDMOVIES
      </button>
    </div>
  )
}

export default Socialmini
