import { ReactNode } from "react";
import { Search, X, Inbox } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  /** Search box value + handler (omit to hide search). */
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  /** Optional filter controls rendered next to the search box. */
  filters?: ReactNode;
  /** Optional action (e.g. a "New" button) rendered on the far right. */
  actions?: ReactNode;

  isLoading?: boolean;
  /** No records exist at all (before filtering). */
  isEmpty?: boolean;
  /** Records exist but the current search/filters match none. */
  isNoResults?: boolean;
  /** Result count shown next to the toolbar. */
  count?: number;

  emptyTitle?: string;
  emptySubtitle?: string;
  /** Skeleton style while loading. */
  skeleton?: "rows" | "cards";
  /** Clears search + filters (shown on the no-results state). */
  onClearFilters?: () => void;

  children: ReactNode;
  className?: string;
}

/**
 * Consistent admin list scaffold: search + filters toolbar, loading skeletons,
 * and empty / no-results states. Wrap any list/table to get a uniform UX.
 */
export function AdminListShell({
  search, onSearch, searchPlaceholder = "Search…",
  filters, actions, isLoading, isEmpty, isNoResults, count,
  emptyTitle = "Nothing here yet", emptySubtitle = "Records will appear here.",
  skeleton = "rows", onClearFilters, children, className,
}: Props) {
  const showSearch = onSearch !== undefined;
  return (
    <div className={cn("space-y-space-4", className)}>
      {/* Toolbar */}
      {(showSearch || filters || actions) && (
        <div className="flex flex-wrap items-center gap-space-2">
          {showSearch && (
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search ?? ""}
                onChange={(e) => onSearch!(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 rounded-full pl-9 pr-9"
              />
              {!!search && (
                <button
                  type="button"
                  onClick={() => onSearch!("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          {filters}
          {typeof count === "number" && !isLoading && (
            <span className="text-xs text-muted-foreground">{count} result{count !== 1 ? "s" : ""}</span>
          )}
          {actions && <div className="ml-auto flex items-center gap-space-2">{actions}</div>}
        </div>
      )}

      {/* Body */}
      {isLoading ? (
        <div className={skeleton === "cards" ? "grid gap-space-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-space-2"}>
          {Array.from({ length: skeleton === "cards" ? 6 : 5 }).map((_, i) => (
            <div key={i} className={cn("animate-pulse rounded-2xl bg-muted", skeleton === "cards" ? "h-40" : "h-16")} />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-14 text-center">
          <Inbox className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="font-semibold text-foreground">{emptyTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">{emptySubtitle}</p>
        </div>
      ) : isNoResults ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-14 text-center">
          <Search className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="font-semibold text-foreground">No matches</p>
          <p className="mt-1 text-sm text-muted-foreground">Nothing matches the current search or filters.</p>
          {onClearFilters && (
            <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={onClearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
