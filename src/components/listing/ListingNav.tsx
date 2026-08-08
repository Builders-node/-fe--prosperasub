import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The shared top of every service listing page.
 *
 * All four listings used to open straight into category sections, with each
 * provider buried *inside* its category next to its own plans. So the page read
 * "Apartment Cleaning → EverySub Cleaning → 3 cards → Car Wash → EverySub
 * Car Wash → 1 card", and you could not tell at a glance who was on the
 * platform or what kinds of service existed — the two questions a customer
 * actually arrives with.
 *
 * Now every listing reads the same way, top to bottom:
 *
 *   1. ProviderRail   — who is on the platform (swipeable)
 *   2. CategoryChips  — what kinds of service exist, and how many of each
 *   3. the offerings   — the full list, grouped by category
 *
 * Cars, Food, Cleaning and Beach previously had three different provider tiles
 * and two different category-heading styles between them. One component each,
 * used by all four.
 */

// ─── Provider rail ──────────────────────────────────────────────────────────

export interface RailProvider {
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** Up to three thumbnails; the rail shows one as a backdrop when present. */
  gallery?: string[];
  /** Small line under the name — "3 plans", "Apartment Cleaning", … */
  meta?: string;
}

export function ProviderRail({
  providers, icon: FallbackIcon, onOpen, label = "Providers",
}: {
  providers: RailProvider[];
  icon: LucideIcon;
  onOpen: (id: string) => void;
  label?: string;
}) {
  if (providers.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-xl font-black tracking-tight text-foreground">{label}</h2>
        <span className="text-caption tabular-nums text-muted-foreground">{providers.length}</span>
      </div>

      {/*
        Horizontal rail. `-mx-*` + matching padding lets cards bleed to the
        screen edge on mobile so the last one is visibly cut off — the standard
        affordance that there is more to swipe. `snap-x` makes the swipe settle
        on a card instead of anywhere.
      */}
      <div className="-mx-space-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-space-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            className="group w-[260px] shrink-0 snap-start overflow-hidden rounded-2xl bg-card text-left transition-colors hover:bg-muted/40"
          >
            {p.gallery?.[0] ? (
              <div className="aspect-[16/9] overflow-hidden bg-muted">
                <img
                  src={p.gallery[0]}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}
            <div className="flex items-center gap-3 p-4">
              {p.avatarUrl ? (
                <img
                  src={p.avatarUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-11 w-11 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <FallbackIcon className="h-5 w-5 text-primary" />
                </span>
              )}
              <div className="min-w-0">
                <p className="line-clamp-2 font-black leading-tight tracking-tight text-foreground">{p.name}</p>
                {p.meta && <p className="mt-0.5 truncate text-caption text-muted-foreground">{p.meta}</p>}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── Category chips ─────────────────────────────────────────────────────────

export const ALL_CATEGORIES = "__all__";

export interface ChipCategory {
  key: string;
  label: string;
  count: number;
}

export function CategoryChips({
  categories, value, onChange, allLabel = "All",
}: {
  categories: ChipCategory[];
  value: string;
  onChange: (key: string) => void;
  allLabel?: string;
}) {
  // One category is not a choice — showing a lone chip next to "All" is noise.
  if (categories.length < 2) return null;
  const total = categories.reduce((n, c) => n + c.count, 0);
  const options: ChipCategory[] = [{ key: ALL_CATEGORIES, label: allLabel, count: total }, ...categories];

  return (
    <div
      role="tablist"
      aria-label="Categories"
      className="-mx-space-4 flex gap-2 overflow-x-auto px-space-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((c) => {
        const selected = value === c.key;
        return (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(c.key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
              selected
                ? "bg-foreground text-background"
                : "bg-muted/50 text-muted-foreground hover:text-foreground",
            )}
          >
            {c.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                selected ? "bg-background/20" : "bg-muted-foreground/15",
              )}
            >
              {c.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
