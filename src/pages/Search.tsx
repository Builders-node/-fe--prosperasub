import { useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import { BottomNav } from "@/components/layout/BottomNav";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { Spinner } from "@/components/ui/spinner";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { SEARCH_GROUPS, useGlobalSearch, type SearchHit } from "@/hooks/useGlobalSearch";
import { KeyboardArrowRightIcon, SearchIcon } from "@/components/icons/FigmaIcons";
import { useCategoryHighlights } from "@/hooks/useCategoryHighlights";

/**
 * "Search on Everysub".
 *
 * The query lives in the URL so a search can be shared, reloaded, and left by
 * pressing Back — the same rule the listing search follows.
 *
 * With an empty field this is not a blank screen: it offers the categories,
 * which is what someone opening a search box is usually looking for the name
 * of.
 */
const SearchPage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const inputRef = useRef<HTMLInputElement>(null);

  const { results, isLoading } = useGlobalSearch(query);
  const { highlights } = useCategoryHighlights();

  // Opening the search means wanting to type.
  useEffect(() => { inputRef.current?.focus(); }, []);

  const setQuery = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("q", value);
    else next.delete("q");
    setParams(next, { replace: true });
  };

  const grouped = SEARCH_GROUPS
    .map((g) => ({ ...g, items: results.filter((r) => r.kind === g.kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <DesktopHeader />

      {/* The field itself is the header on this screen — the same shape as the
          one on the home screen, so tapping there and arriving here feels like
          one control rather than two. */}
      <header className="sticky top-0 z-40 bg-card md:hidden">
        <div className="flex h-16 items-center gap-2 px-2">
          <button
            type="button"
            aria-label="Back"
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-radius-md bg-background px-3 py-2">
            <SearchIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search on EverySub"
              aria-label="Search on EverySub"
              className="min-w-0 flex-1 bg-transparent text-[16px] tracking-[-0.32px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="app-container space-y-6 py-4 md:py-space-8">
        {/* Desktop has no search header of its own, so the field repeats here. */}
        <div className="hidden items-center gap-2 rounded-radius-md bg-card px-3 py-2 md:flex">
          <SearchIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search on EverySub"
            aria-label="Search on EverySub"
            className="min-w-0 flex-1 bg-transparent py-1 text-[16px] tracking-[-0.32px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        {!query.trim() ? (
          <section className="space-y-3">
            <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">
              Browse categories
            </h2>
            <div className="overflow-hidden rounded-radius-md bg-card">
              {highlights.map((h, i) => (
                <Link
                  key={h.key}
                  to={h.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40",
                    i > 0 && "border-t border-border",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold tracking-[-0.32px] text-foreground">
                      {h.label}
                    </span>
                    {h.archetype && (
                      <span className="block truncate text-[12px] tracking-[-0.24px] text-muted-foreground">
                        {h.archetype.label}
                      </span>
                    )}
                  </span>
                  {h.fromCents !== null && (
                    <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                      from {formatUSD(h.fromCents)}
                    </span>
                  )}
                  <KeyboardArrowRightIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </section>
        ) : isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : grouped.length === 0 ? (
          <div className="rounded-radius-md bg-card p-8 text-center">
            <p className="text-[16px] font-semibold text-foreground">Nothing matches "{query.trim()}"</p>
            <p className="mt-1 text-[12px] tracking-[-0.24px] text-muted-foreground">
              Try a shorter word — a service, a business or the name of a plan.
            </p>
          </div>
        ) : (
          grouped.map((group) => (
            <section key={group.kind} className="space-y-2">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {group.label}
              </h2>
              <div className="overflow-hidden rounded-radius-md bg-card">
                {group.items.map((hit, i) => (
                  <ResultRow key={`${hit.kind}-${hit.id}`} hit={hit} divided={i > 0} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <BottomNav />
    </div>
  );
};

function ResultRow({ hit, divided }: { hit: SearchHit; divided: boolean }) {
  return (
    <Link
      to={hit.href}
      className={cn(
        "flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40",
        divided && "border-t border-border",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold tracking-[-0.32px] text-foreground">
          {hit.title}
        </span>
        {hit.subtitle && (
          <span className="block truncate text-[12px] tracking-[-0.24px] text-muted-foreground">
            {hit.subtitle}
          </span>
        )}
      </span>
      {hit.priceCents !== null && (
        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
          {hit.priceFrom ? "from " : ""}{formatUSD(hit.priceCents)}{hit.priceUnit ? ` ${hit.priceUnit}` : ""}
        </span>
      )}
      <KeyboardArrowRightIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default SearchPage;
