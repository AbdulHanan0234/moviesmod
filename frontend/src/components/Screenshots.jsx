import "./Screenshots.css"

const Screenshots = ({ images, title }) => (
  <>
    <h2 className="section-heading">
      <i className="fa fa-image" aria-hidden="true" /> Screenshots
    </h2>
    <div className="screenshots">
      {images.map((src, i) => (
        <img key={i} src={src} alt={`${title} screenshot ${i + 1}`} />
      ))}
    </div>
  </>
);

export default Screenshots;