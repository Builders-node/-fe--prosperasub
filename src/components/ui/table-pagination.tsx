import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Client-side pagination helper. Pass the already-filtered/sorted array and get
 * back the current page slice plus controls. Resets to the first page whenever
 * the result count changes (e.g. a filter/search is applied).
 */
export function usePagination<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(0);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages - 1);

  useEffect(() => { setPage(0); }, [total, pageSize]);

  const paged = items.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  return {
    paged,
    page: currentPage,
    setPage,
    totalPages,
    total,
    from: total === 0 ? 0 : currentPage * pageSize + 1,
    to: Math.min((currentPage + 1) * pageSize, total),
  };
}

export function TablePagination({
  page,
  totalPages,
  from,
  to,
  total,
  onPage,
  className,
}: {
  page: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  onPage: (p: number) => void;
  className?: string;
}) {
  if (total === 0) return null;
  return (
    <div className={cn("flex items-center justify-between gap-3 border-t border-border/60 px-1 pt-4 mt-2 text-sm text-muted-foreground", className)}>
      <span className="tabular-nums">{from}–{to} of {total}</span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="tertiary" size="iconSm" className="rounded-full" disabled={page === 0} onClick={() => onPage(Math.max(0, page - 1))} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">Page {page + 1} / {totalPages}</span>
          <Button variant="tertiary" size="iconSm" className="rounded-full" disabled={page >= totalPages - 1} onClick={() => onPage(Math.min(totalPages - 1, page + 1))} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
