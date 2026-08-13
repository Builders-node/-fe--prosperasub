import { useState } from "react";
import { useGoBack } from "@/hooks/useGoBack";
import { HomeHeader } from "@/components/HomeHeader";
import { LocationSelector } from "@/components/LocationSelector";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { FilterListIcon, SearchIcon } from "@/components/icons/FigmaIcons";
import { SORT_LABELS, type SortKey } from "@/hooks/useListingSearch";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

/**
 * The top of every service listing: title bar, search, sort, location — one
 * white panel rounded off at the bottom.
 *
 * The search box used to sit in the middle of the page, under the provider
 * rail and the category chips, which put it below the fold on a phone: you
 * had to scroll past the whole shop to find the way to narrow it down. The
 * design lifts it into the header, next to the title of the thing being
 * searched, and puts the sort behind the filter button rather than spending a
 * third of the row on a dropdown that is on its default value nine times in
 * ten.
 */
export function ListingHeader({
  title,
  onBack,
  query,
  onQueryChange,
  placeholder,
  sort,
  onSortChange,
  sorts = [],
  showLocation = true,
}: {
  title: string;
  onBack?: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  /** "Search Cleaning" — the design names the service being searched. */
  placeholder: string;
  sort?: SortKey;
  onSortChange?: (value: SortKey) => void;
  sorts?: SortKey[];
  /** Off where the choice changes nothing — the beach has one address. */
  showLocation?: boolean;
}) {
  const goBack = useGoBack();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const canSort = sorts.length > 1 && !!onSortChange && !!sort;
  // A dot, not a count: there is one setting behind the button, and it is
  // either the default or it is not.
  const sortIsCustom = canSort && sort !== sorts[0];

  const searchField = (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-radius-md bg-background px-3 py-2 md:bg-card">
      <SearchIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[16px] tracking-[-0.32px] text-foreground outline-none placeholder:text-muted-foreground"
      />
      {query && (
        <button
          type="button"
          onClick={() => onQueryChange("")}
          aria-label="Clear search"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  const sortButton = canSort && (
    <button
      type="button"
      aria-label="Sort"
      onClick={() => setFiltersOpen(true)}
      className={cn(
        "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted",
        sortIsCustom ? "text-primary" : "text-foreground",
      )}
    >
      <FilterListIcon className="h-6 w-6" />
      {sortIsCustom && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />}
    </button>
  );

  return (
    <>
      {/* Desktop keeps its own header, so the panel is a mobile shape; there
          the same two controls sit at the top of the content column. */}
      <div className="market-content hidden items-center gap-2 pt-space-8 md:flex">
        {searchField}
        {sortButton}
      </div>

      <div className="sticky top-0 z-40 md:hidden">
      <HomeHeader title={title} showBackButton onBack={onBack ?? goBack} bare />

      {/* `overflow-hidden` because the location row is a full-width button with
          a background of its own: without it that square background fills the
          panel's two rounded corners and the curve disappears on press. */}
      <div className="flex flex-col gap-2 overflow-hidden rounded-b-radius-lg bg-card pb-2">
        <div className="flex items-center gap-2 pl-4 pr-2">
          {searchField}
          {sortButton}
        </div>

        {showLocation && <LocationSelector variant="row" className="py-2" />}
      </div>

      {canSort && (
        <ResponsiveDialog open={filtersOpen} onOpenChange={setFiltersOpen} title="Sort by">
          <div className="flex flex-col pb-2">
            {sorts.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => { onSortChange!(key); setFiltersOpen(false); }}
                className={cn(
                  "flex items-center justify-between rounded-radius-md px-4 py-3.5 text-left text-[16px] tracking-[-0.32px] transition-colors hover:bg-muted",
                  key === sort ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {SORT_LABELS[key]}
                {key === sort && <span className="h-2 w-2 rounded-full bg-primary" />}
              </button>
            ))}
          </div>
        </ResponsiveDialog>
      )}
      </div>
    </>
  );
}
