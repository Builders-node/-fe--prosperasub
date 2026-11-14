import type { ComponentType } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { todayHN } from "@/lib/timezone";

/**
 * What happens next, across every service, at the top of My subscriptions.
 *
 * The page used to answer "what do I own" and leave "when is the cleaner
 * coming / when is my court / when do I pick up the car" to be dug out of each
 * card's sheet — court bookings were not listed anywhere at all. A customer
 * opens this page to find out what is next; this is that answer.
 *
 * Callers build the items from data they already hold. Each item is one tap to
 * the place where it can be changed: the visit's reschedule dialog, the court
 * on that day, the rental, the renewal.
 */
export interface NextUpItem {
  key: string;
  /** Sortable local Roatán moment, "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM". */
  at: string;
  /** Shown after the day word — "10:00 AM", "Pickup". */
  time?: string | null;
  title: string;
  detail?: string | null;
  icon: ComponentType<{ className?: string }>;
  /** Something the customer has to act on (a plan about to end). */
  attention?: boolean;
  onClick: () => void;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function dayWord(at: string): string {
  const day = at.slice(0, 10);
  const today = todayHN();
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  const d = new Date(`${day}T12:00:00Z`);
  const inWeek = day <= addDays(today, 6);
  return new Intl.DateTimeFormat("en-US", inWeek
    ? { weekday: "long", timeZone: "UTC" }
    : { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}

export function NextUpStrip({ items, max = 8 }: { items: NextUpItem[]; max?: number }) {
  if (items.length === 0) return null;
  const shown = [...items].sort((a, b) => a.at.localeCompare(b.at)).slice(0, max);
  return (
    <section aria-labelledby="next-up" className="mb-5">
      <h2 id="next-up" className="mb-2 text-heading font-semibold text-foreground">Next up</h2>
      {/* A rail on a phone, a grid on a laptop — the same cards. */}
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-space-4 gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-3">
        {shown.map((it) => {
          const Icon = it.icon;
          return (
            <button
              key={it.key}
              type="button"
              onClick={it.onClick}
              className="flex w-[260px] shrink-0 snap-start items-center gap-3 rounded-radius-lg bg-card p-3 text-left transition-colors hover:bg-muted md:w-auto"
            >
              <span className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                it.attention ? "bg-attention/15 text-attention" : "bg-inset text-foreground",
              )}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-meta font-semibold", it.attention ? "text-attention" : "text-primary")}>
                  {dayWord(it.at)}{it.time ? ` · ${it.time}` : ""}
                </span>
                <span className="block truncate text-title font-semibold text-foreground">{it.title}</span>
                {it.detail && <span className="block truncate text-meta text-muted-foreground">{it.detail}</span>}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
