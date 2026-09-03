import { ChevronRight, type LucideIcon } from "lucide-react";
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

/** The face of a business, or its initial where none was uploaded. */
function ProviderAvatar({ p, className }: { p: RailProvider; className?: string }) {
  return p.avatarUrl ? (
    <img src={p.avatarUrl} alt="" loading="lazy" className={cn("shrink-0 rounded-full object-cover", className)} />
  ) : (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-inset text-[14px] font-semibold text-muted-foreground", className)}
    >
      {(p.name ?? "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function ProviderRail({
  providers, onOpen, label = "Providers",
}: {
  providers: RailProvider[];
  /** Kept for the callers that pass one; the design's tile is text only. */
  icon?: LucideIcon;
  onOpen: (id: string) => void;
  label?: string;
}) {
  if (providers.length === 0) return null;

  /**
   * One business is not a rail. A lone half-width tile floating at the left
   * edge read as a broken carousel — and on most services today there IS one
   * provider per screen. So a single business gets a full-width row: same
   * door to the same page, drawn as a fact rather than as a choice of one.
   */
  if (providers.length === 1) {
    const p = providers[0];
    return (
      <section className="space-y-3">
        <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">{label}</h2>
        <button
          type="button"
          onClick={() => onOpen(p.id)}
          className="flex w-full items-center gap-3 rounded-radius-md bg-card p-4 text-left transition-colors hover:bg-muted/40"
        >
          <ProviderAvatar p={p} className="h-10 w-10" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-semibold tracking-[-0.32px] text-foreground">{p.name}</span>
            {p.meta && (
              <span className="block truncate text-[12px] tracking-[-0.24px] text-muted-foreground">{p.meta}</span>
            )}
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">{label}</h2>

      {/*
        Half-width tiles, two of them on a 375px screen with the third cut off
        — the standard affordance that there is more to swipe. `snap-x` makes
        the swipe settle on a tile instead of anywhere.
      */}
      <div className="-mx-space-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-space-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            title={p.meta ? `${p.name} — ${p.meta}` : p.name}
            className="flex h-20 w-[168px] shrink-0 snap-start items-center gap-3 rounded-radius-md bg-card p-4 text-left transition-colors hover:bg-muted/40"
          >
            <ProviderAvatar p={p} className="h-9 w-9" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 block text-[15px] font-semibold leading-tight tracking-[-0.32px] text-foreground">
                {p.name}
              </span>
            </span>
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
  const options: ChipCategory[] = [
    { key: ALL_CATEGORIES, label: allLabel, count: categories.reduce((n, c) => n + c.count, 0) },
    ...categories,
  ];

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
            // The count is gone: it was a number nobody acts on, and it made
            // every chip two words wide on the axis that is already scarce.
            className={cn(
              "shrink-0 whitespace-nowrap rounded-radius-md px-4 py-2 text-[16px] font-semibold tracking-[-0.32px] transition-colors",
              selected
                ? "bg-primary text-primary-foreground"
                : "bg-card text-foreground hover:bg-muted",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
