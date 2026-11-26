import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/integrations/supabase/config";
import { popularContext, popularFor, popularText, POPULAR_VISIBLE, type PopularGroup, type RowReader } from "@/lib/seo/popular";
import { LANG } from "@/lib/tr";
import { cn } from "@/lib/utils";

/**
 * "Popular on EverySub" — rows of link chips just above the site footer that
 * change with the page (see src/lib/seo/popular.ts for what each page gets and
 * why). The robot pages in middleware.ts draw the same rows from the same code.
 *
 * Every chip is a real <a href>, and the ones past the first 15 are in the
 * page too, only hidden until "Show more" — so a crawler reads all of them.
 * Pages the block has nothing to say about (account, checkout, admin) get
 * nothing, and so does any page while its rows load: no skeleton, because a
 * block at the foot of the page is not worth a layout jump.
 */

/** PostgREST over plain fetch, so a missing function (404) is an empty answer, not an error. */
const readRows: RowReader = async (path) => {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
};

export function PopularLinks() {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, "") || "/";
  const enabled = popularContext(path) !== null;
  const { data: groups = [] } = useQuery({
    queryKey: ["popular-links", path, LANG],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => popularFor(path, LANG, readRows),
  });
  if (!enabled || !groups.length) return null;
  const t = popularText(LANG);

  return (
    <section aria-labelledby="popular-links-title" className="border-b border-border">
      <div className="app-container py-6 md:py-10">
        <h2 id="popular-links-title" className="text-section-title text-foreground">{t.title}</h2>
        <div className="mt-4 space-y-6 md:mt-6 md:space-y-7">
          {groups.map((g) => <Row key={g.key} group={g} more={t.more} less={t.less} />)}
        </div>
      </div>
    </section>
  );
}

function Row({ group, more, less }: { group: PopularGroup; more: string; less: string }) {
  const [open, setOpen] = useState(false);
  const extra = group.links.length - POPULAR_VISIBLE;
  return (
    <nav aria-label={group.heading}>
      <h3 className="text-body font-semibold text-muted-foreground">{group.heading}</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {group.links.map((l, i) => (
          <li key={l.href} className={cn("min-w-0 max-w-full", !open && i >= POPULAR_VISIBLE && "hidden")}>
            <Link
              to={l.href}
              className="inline-flex h-8 max-w-full items-center rounded-full bg-inset px-3 text-sm font-medium md:h-9 md:max-w-[24rem] md:px-3.5 md:text-body text-foreground outline-none transition-colors hover:bg-primary/15 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate">{l.label}</span>
            </Link>
          </li>
        ))}
        {extra > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm font-semibold md:h-9 md:text-body text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {open ? less : `${more} (${extra})`}
              <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}
