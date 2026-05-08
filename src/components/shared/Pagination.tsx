import './Pagination.css';

export interface PageInfo {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

interface Props {
  meta: PageInfo | null;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

const PAGE_WINDOW = 5; // how many numbered buttons to render around the current page

const Pagination = ({ meta, onPageChange, onPageSizeChange, pageSizeOptions = [5, 10, 15, 20, 50] }: Props) => {
  // Always render the bar so the page-size selector is visible even on a single page
  if (!meta) return null;

  const singlePage = meta.totalPages <= 1;

  const { page, pageSize, totalCount, totalPages, hasPrevious, hasNext } = meta;
  const firstItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalCount);

  // build a window of page numbers around the current page
  const start = Math.max(1, page - Math.floor(PAGE_WINDOW / 2));
  const end = Math.min(totalPages, start + PAGE_WINDOW - 1);
  const adjustedStart = Math.max(1, end - PAGE_WINDOW + 1);
  const pages: number[] = [];
  for (let p = adjustedStart; p <= end; p++) pages.push(p);

  return (
    <div className="pagination">
      <span className="pagination-summary">
        {totalCount === 0 ? (
          'No results'
        ) : (
          <>Showing <strong>{firstItem}</strong>–<strong>{lastItem}</strong> of <strong>{totalCount}</strong></>
        )}
      </span>

      <div className="pagination-controls">
        {onPageSizeChange && (
          <select
            className="pagination-size"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Items per page"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        )}

        {!singlePage && (
          <>
            <button
              className="pagination-btn"
              onClick={() => onPageChange(page - 1)}
              disabled={!hasPrevious}
              aria-label="Previous page"
            >
              ‹
            </button>

            {adjustedStart > 1 && (
              <>
                <button className="pagination-btn" onClick={() => onPageChange(1)}>1</button>
                {adjustedStart > 2 && <span className="pagination-ellipsis">…</span>}
              </>
            )}

            {pages.map((p) => (
              <button
                key={p}
                className={`pagination-btn ${p === page ? 'active' : ''}`}
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
            ))}

            {end < totalPages && (
              <>
                {end < totalPages - 1 && <span className="pagination-ellipsis">…</span>}
                <button className="pagination-btn" onClick={() => onPageChange(totalPages)}>{totalPages}</button>
              </>
            )}

            <button
              className="pagination-btn"
              onClick={() => onPageChange(page + 1)}
              disabled={!hasNext}
              aria-label="Next page"
            >
              ›
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Pagination;
