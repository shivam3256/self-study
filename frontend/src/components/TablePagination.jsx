import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function TablePagination({
  currentPage = 1,
  totalItems = 0,
  pageSize = 25,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [15, 25, 50, 100],
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, currentPage * pageSize);

  // Generate page numbers with sliding window around current page
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, start + maxVisible - 1);

      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    return pages;
  };

  if (totalItems === 0) return null;

  return (
    <div
      className="table-pagination"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 18px',
        borderTop: '1px solid var(--color-border)',
        backgroundColor: '#FFFFFF',
        flexWrap: 'wrap',
        gap: 12,
        fontSize: '0.85rem',
      }}
    >
      <div style={{ color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span>
          Showing <strong style={{ color: 'var(--color-heading)' }}>{startItem}</strong> to{' '}
          <strong style={{ color: 'var(--color-heading)' }}>{endItem}</strong> of{' '}
          <strong style={{ color: 'var(--color-heading)' }}>{totalItems}</strong> entries
        </span>

        {onPageSizeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.8rem' }}>Rows:</span>
            <select
              aria-label="Rows per page"
              className="form-select"
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              style={{
                padding: '3px 8px',
                fontSize: '0.8rem',
                height: 28,
                borderRadius: 'var(--radius-sm)',
                width: 'auto',
              }}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          style={{ padding: '4px 8px', height: 30 }}
        >
          <ChevronLeft size={15} />
          <span style={{ display: 'none', '@media (min-width: 480px)': { display: 'inline' } }}>Prev</span>
        </button>

        {getPageNumbers().map((pageNum) => {
          const isActive = pageNum === currentPage;
          return (
            <button
              key={pageNum}
              type="button"
              className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onPageChange(pageNum)}
              aria-label={`Go to page ${pageNum}`}
              aria-current={isActive ? 'page' : undefined}
              style={{
                minWidth: 30,
                height: 30,
                padding: '0 8px',
                fontWeight: isActive ? 600 : 500,
              }}
            >
              {pageNum}
            </button>
          );
        })}

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          style={{ padding: '4px 8px', height: 30 }}
        >
          <span style={{ display: 'none', '@media (min-width: 480px)': { display: 'inline' } }}>Next</span>
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
