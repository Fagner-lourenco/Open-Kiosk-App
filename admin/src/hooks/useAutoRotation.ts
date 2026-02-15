import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useAutoRotation — Auto-paginate an array of items with configurable interval.
 *
 * @param items      Full list of items
 * @param pageSize   How many items per page
 * @param intervalMs Rotation interval in ms (default 10000)
 * @returns          { visibleItems, currentPage, totalPages, isPaused }
 */
export function useAutoRotation<T>(
  items: T[],
  pageSize: number,
  intervalMs = 10_000,
) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const [currentPage, setCurrentPage] = useState(0);
  const prevLengthRef = useRef(items.length);

  // Reset page when item count changes significantly
  useEffect(() => {
    if (items.length !== prevLengthRef.current) {
      prevLengthRef.current = items.length;
      setCurrentPage(0);
    }
  }, [items.length]);

  // Clamp page if totalPages shrinks
  useEffect(() => {
    if (currentPage >= totalPages) {
      setCurrentPage(0);
    }
  }, [currentPage, totalPages]);

  // Auto-rotate (only if more than 1 page)
  useEffect(() => {
    if (totalPages <= 1) return;

    const timer = setInterval(() => {
      setCurrentPage((p) => (p + 1) % totalPages);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [totalPages, intervalMs]);

  const start = currentPage * pageSize;
  const visibleItems = items.slice(start, start + pageSize);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(0, Math.min(page, totalPages - 1)));
  }, [totalPages]);

  return {
    visibleItems,
    currentPage,
    totalPages,
    goToPage,
    /** True if rotation is active (more than 1 page) */
    isRotating: totalPages > 1,
  };
}
