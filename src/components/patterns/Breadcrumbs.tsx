import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  /** Omit for the current page — drawn in ink, not a link. */
  href?: string;
}

/**
 * The one breadcrumb: a quiet line of text above the content, the way big
 * shops print it — "Home › Food › Meal Subscription › Elias Cuisine › Meal
 * Plan". Small muted links, a thin chevron between them, the current page in
 * ink and medium weight. No pills, no fills: the trail is wayfinding, not a
 * row of buttons competing with the page's real actions.
 *
 * One row at every width. On a narrow screen a long crumb truncates and the
 * row scrolls sideways; it opens scrolled to the end so the current page,
 * the part you care about, is the part you see.
 */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  const ref = useRef<HTMLOListElement>(null);
  const key = items.map((c) => c.label).join("\u0000");
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [key]);

  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol
        ref={ref}
        className="flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap text-[13px] leading-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${i}-${c.label}`} className="flex min-w-0 shrink-0 items-center gap-1.5">
              {c.href && !last ? (
                <Link
                  to={c.href}
                  className="block max-w-[40vw] truncate text-muted-foreground transition-colors hover:text-foreground md:max-w-[240px]"
                >
                  {c.label}
                </Link>
              ) : c.href ? (
                <Link
                  to={c.href}
                  className="block max-w-[60vw] truncate font-medium text-foreground md:max-w-[360px]"
                >
                  {c.label}
                </Link>
              ) : (
                <span aria-current="page" className="block max-w-[60vw] truncate font-medium text-foreground md:max-w-[360px]">
                  {c.label}
                </span>
              )}
              {!last && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
