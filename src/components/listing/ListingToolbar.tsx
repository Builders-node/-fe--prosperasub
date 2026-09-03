import { Search, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SORT_LABELS, type SortKey } from "@/hooks/useListingSearch";
import { cn } from "@/lib/utils";

/**
 * Search box + sort picker, shared by every service listing.
 *
 * Sits directly above the results and below the provider rail and category
 * chips, so the page reads: who is here → what kinds → narrow it down →
 * the list.
 */
export function ListingToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  sorts,
  placeholder = "Search",
  resultCount,
  className,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  sort: SortKey;
  onSortChange: (value: SortKey) => void;
  sorts: SortKey[];
  placeholder?: string;
  /** Shown only while a search is running — silence is right when nothing is filtered. */
  resultCount?: number | null;
  className?: string;
}) {
  const showCount = query.trim().length > 0 && typeof resultCount === "number";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-11 w-full rounded-2xl bg-muted/50 pl-9 pr-9 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:bg-muted"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {sorts.length > 1 && (
          <Select value={sort} onValueChange={(v) => onSortChange(v as SortKey)}>
      <SelectTrigger inputSize="sm" className="w-auto min-w-[150px] rounded-full border-0 bg-muted/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sorts.map((key) => (
                <SelectItem key={key} value={key}>{SORT_LABELS[key]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {showCount && (
        <p className="text-xs font-medium text-muted-foreground">
          {resultCount === 0
            ? `Nothing matches "${query.trim()}"`
            : `${resultCount} result${resultCount === 1 ? "" : "s"} for "${query.trim()}"`}
        </p>
      )}
    </div>
  );
}
