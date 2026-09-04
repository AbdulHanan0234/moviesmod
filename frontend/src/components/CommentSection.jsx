import "./CommentSection.css";

const CommentSection = () => (
  <div className="comment-section">
    <h2 className="comments-heading">
     ADD COMMENT
    </h2>
    <form
      className="comment-form"
      onSubmit={(e) => e.preventDefault()}
    >
      <textarea
        id="comment-text"
        rows="5"
        name="comment"
        placeholder="Comment Text* "
      ></textarea>
      <div className="form-row">
        <div className="form-field">
          <input id="cname" type="text" name="author" placeholder="Name*" />
        </div>
        <div className="form-field">
          <input id="cemail" type="email" name="email" placeholder="Email*" />
        </div>
      </div>
      <label className="check-label">
        <input type="checkbox" name="save-info" />
        Save my name, email, and website in this browser for the next time I
        comment.
      </label>
      <button type="submit" className="comment-btn">
        SUBMIT COMMENT
      </button>
    </form>
  </div>
);

export default CommentSection;