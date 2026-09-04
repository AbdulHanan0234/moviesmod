import "./RelatedPosts.css";
import { PostCard } from "./Postcards";

const RelatedPosts = ({ related }) => (
  <>
    <h2 className="relatedpost-heading">RELATED POSTS</h2>
    {related.length === 0 ? (
      <p className="note">No related posts yet.</p>
    ) : (
      <div className="related-cards">
        {related.map((r) => (
          <PostCard key={r.id} movie={r} />
        ))}
      </div>
    )}
  </>
);

export default RelatedPosts;