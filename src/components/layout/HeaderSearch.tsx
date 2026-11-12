import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { SearchIcon } from "@/components/icons/FigmaIcons";
import { Spinner } from "@/components/ui/spinner";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { SEARCH_GROUPS, useGlobalSearch, type SearchHit } from "@/hooks/useGlobalSearch";

const MAX_HITS = 8;
const KIND_LABEL: Record<SearchHit["kind"], string> = { category: "Category", service: "Service", provider: "Business", plan: "Plan" };

/**
 * Search on EverySub, in the desktop header.
 *
 * The phone has its search in the tab bar; on a laptop the only way in was to
 * know /search existed. This is the same search (useGlobalSearch, the whole
 * catalogue filtered in the browser): type and the best few hits drop down
 * under the field, Enter or "See all" opens the full results page.
 *
 * The catalogue is fetched only once the field is used — the results list is
 * its own component, mounted on demand — so the header costs nothing on pages
 * where nobody searches. ⌘K / Ctrl+K focuses it from anywhere.
 */
export function HeaderSearch({ initialQuery = "" }: {
  /** The states sheet opens it mid-search; the live header starts empty. */
  initialQuery?: string;
} = {}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(!!initialQuery);
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // A new page closes the dropdown and forgets the query.
  useEffect(() => { if (!initialQuery) { setOpen(false); setQuery(""); } }, [pathname, initialQuery]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  const q = query.trim();
  const seeAll = () => {
    if (!q) return;
    setOpen(false);
    inputRef.current?.blur();
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active];
      if (hit && active < hits.length) { setOpen(false); navigate(hit.href); }
      else seeAll();
    }
  };

  // The search page has its own, larger field.
  if (pathname === "/search") return null;

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex h-12 items-center gap-3 rounded-radius-md bg-muted px-4 transition-shadow focus-within:ring-2 focus-within:ring-primary/50">
        <SearchIcon className="h-6 w-6 shrink-0 text-foreground" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search on EverySub"
          aria-label="Search on EverySub"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded-radius-sm bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground lg:inline">⌘K</kbd>
        )}
      </div>

      {open && q && (
        <SearchDropdown
          query={q}
          active={active}
          onHits={setHits}
          onPick={() => setOpen(false)}
          onSeeAll={seeAll}
        />
      )}
    </div>
  );
}

function SearchDropdown({
  query, active, onHits, onPick, onSeeAll,
}: {
  query: string;
  active: number;
  onHits: (hits: SearchHit[]) => void;
  onPick: () => void;
  onSeeAll: () => void;
}) {
  const { results, isLoading, isError } = useGlobalSearch(query);
  // Broadest first, the same order the full page uses.
  const order = SEARCH_GROUPS.map((g) => g.kind);
  const hits = [...results]
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .slice(0, MAX_HITS);
  const key = hits.map((h) => `${h.kind}:${h.id}`).join("|");
  useEffect(() => { onHits(hits); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-radius-md bg-card py-1">
      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : isError ? (
        <p className="px-4 py-4 text-meta text-muted-foreground">Couldn't search right now.</p>
      ) : hits.length === 0 ? (
        <p className="px-4 py-4 text-meta text-muted-foreground">Nothing matches “{query}”.</p>
      ) : (
        hits.map((hit, i) => (
          <Link
            key={`${hit.kind}-${hit.id}`}
            to={hit.href}
            onClick={onPick}
            className={cn("flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted", i === active && "bg-muted")}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-foreground">{hit.title}</span>
              <span className="block truncate text-meta text-muted-foreground">
                {[KIND_LABEL[hit.kind], hit.subtitle].filter(Boolean).join(" · ")}
              </span>
            </span>
            {hit.priceCents !== null && (
              <span className="shrink-0 text-meta tabular-nums text-muted-foreground">
                {hit.priceFrom ? "from " : ""}{formatUSD(hit.priceCents)}
              </span>
            )}
          </Link>
        ))
      )}
      {!isLoading && !isError && (
        <button
          type="button"
          onClick={onSeeAll}
          className={cn(
            "flex w-full items-center gap-2 px-4 py-2.5 text-left text-[14px] font-semibold text-primary transition-colors hover:bg-muted",
            active === hits.length && hits.length > 0 && "bg-muted",
          )}
        >
          <SearchIcon className="h-4 w-4" /> See all results for “{query}”
        </button>
      )}
    </div>
  );
}
