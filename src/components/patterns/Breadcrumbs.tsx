import { Link } from "react-router-dom";
import { Store } from "lucide-react";
import { KeyboardArrowRightIcon } from "@/components/icons/FigmaIcons";
import { Photo } from "@/components/patterns/Photo";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  /** Omit for the current page — drawn the same, in ink, with no arrow. */
  href?: string;
  /** A business's face beside its name. `null` = draw the placeholder. */
  avatar?: string | null;
}

/**
 * The one breadcrumb.
 *
 * There were five: the admin header and the site header each drew a text
 * trail of their own (13px vs 14px, 16px vs 14px chevrons, semibold vs
 * medium for the current page), and the product, vehicle and business pages
 * each drew chips — three sets of classes that drifted (h-7 vs py-1,
 * items-center vs items-start, a Figma arrow vs a lucide one, 12px literal vs
 * the type token, a link vs a dead span, wrap vs scroll).
 *
 * Now one look everywhere: chips on the inset fill, 28px tall, `text-meta`
 * medium, the design-system arrow inside each link; the current page (when a
 * trail names it) is the same chip in ink without the arrow. One row that
 * scrolls sideways on a narrow screen rather than wrapping into two.
 */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (!items.length) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((c, i) => {
        const current = !c.href;
        const body = (
          <>
            {c.avatar !== undefined && (
              <Photo
                src={c.avatar}
                alt=""
                icon={Store}
                className="h-5 w-5 shrink-0 rounded-full object-cover"
                iconClassName="h-3 w-3 min-h-3 min-w-3"
              />
            )}
            <span className="max-w-[45vw] truncate">{c.label}</span>
            {!current && <KeyboardArrowRightIcon className="-ml-0.5 h-4 w-4 shrink-0" />}
          </>
        );
        const chip = cn(
          "flex h-7 shrink-0 items-center gap-1 rounded-radius-md bg-inset text-meta font-medium leading-4 transition-colors",
          c.avatar !== undefined ? "pl-1" : "pl-2",
          current ? "pr-2 text-foreground" : "pr-1 text-muted-foreground hover:text-foreground",
        );
        return current ? (
          <span key={`${i}-${c.label}`} aria-current="page" className={chip}>{body}</span>
        ) : (
          <Link key={`${i}-${c.label}`} to={c.href!} className={chip}>{body}</Link>
        );
      })}
    </nav>
  );
}
