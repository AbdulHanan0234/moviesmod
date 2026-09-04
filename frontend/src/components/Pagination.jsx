import { useMemo } from "react";
import "./Pagination.css";

/**
 * Computes the array of page items to display based on total pages and current page.
 */
const getPageItems = (total, current) => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  let startPage = Math.max(2, current - 2);
  let endPage = Math.min(total - 1, current + 2);

  if (current <= 4) {
    startPage = 2;
    endPage = 6;
  } else if (current >= total - 3) {
    startPage = total - 5;
    endPage = total - 1;
  }

  if (startPage === 3) {
    startPage = 2;
  }
  if (endPage === total - 2) {
    endPage = total - 1;
  }

  const pages = [1];

  if (startPage > 2) {
    pages.push("...");
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  if (endPage < total - 1) {
    pages.push("...");
  }

  pages.push(total);

  return pages;
};

const Pagination = ({ totalPages, page, onPageChange }) => {
  const pageItems = useMemo(
    () => getPageItems(totalPages, page),
    [totalPages, page]
  );

  if (totalPages <= 1) return null;

  return (
    <nav
      className="pagination-nav rounded-bottom-3"
      aria-label="Page navigation"
    >
      <ul className="pagination">
        {page > 1 && (
          <li className="page-item">
            <button
              type="button"
              className="page-link"
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
            >
              PREVIOUS
            </button>
          </li>
        )}
        {pageItems.map((item, idx) =>
          item === "..." ? (
            <li key={`dots-${idx}`} className="page-item disabled">
              <span className="page-link dots">...</span>
            </li>
          ) : (
            <li
              key={item}
              className={`page-item ${item === page ? "active" : ""}`}
            >
              <button
                type="button"
                className="page-link"
                onClick={() => onPageChange(item)}
                aria-current={item === page ? "page" : undefined}
              >
                {item}
              </button>
            </li>
          ),
        )}
        {page < totalPages && (
          <li className="page-item">
            <button
              type="button"
              className="page-link"
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
            >
              NEXT
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
};

export default Pagination;
