import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookingSettingsForm } from "@/components/provider/BookingSettingsForm";
import { normalizeBookingSettings } from "@/lib/booking/bookingSettings";
import type { UniversalProviderRow } from "@/components/provider/UniversalInfoTab";

/**
 * Provider-level booking rules folded into the Offerings tab.
 *
 * Rationale (Batch 3): the standalone "Schedule" tab confused providers
 * (Schedule vs Calendar was the top complaint). The rules apply to every
 * offering, so they belong right above the offerings body — collapsed by
 * default with a one-line summary, expandable when the provider wants to tune.
 *
 * Batch 5 will add per-plan overrides at the plan-card level; this accordion
 * stays as the provider default.
 */
export function ScheduleAccordion({ provider }: { provider: UniversalProviderRow }) {
  const [open, setOpen] = useState(false);
  const summary = summarize(provider.booking_settings);

  return (
    <section className="mb-4 overflow-hidden rounded-2xl bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Booking rules</p>
          <p className="mt-0.5 truncate text-sm text-foreground">{summary}</p>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border/40 px-4 py-4">
          <BookingSettingsForm provider={provider} />
        </div>
      )}
    </section>
  );
}

/**
 * "Same-day booking · 30 days ahead" — three most-scannable knobs turned into
 * a single one-line hint. Fine to keep dumb: the user opens the accordion to
 * see the full picture, this is just orientation.
 */
function summarize(raw: unknown): string {
  const s = normalizeBookingSettings(raw);
  const parts: string[] = [];
  if (typeof s.minNoticeHours === "number") {
    if (s.minNoticeHours <= 0) parts.push("Same-day booking");
    else if (s.minNoticeHours < 24) parts.push(`${s.minNoticeHours}h notice`);
    else parts.push(`${Math.round(s.minNoticeHours / 24)}d notice`);
  }
  if (typeof s.maxAdvanceDays === "number" && s.maxAdvanceDays > 0) {
    parts.push(`${s.maxAdvanceDays} days ahead`);
  }
  if (Array.isArray(s.blockedRanges) && s.blockedRanges.length > 0) {
    parts.push(`${s.blockedRanges.length} blocked range${s.blockedRanges.length === 1 ? "" : "s"}`);
  }
  return parts.length ? parts.join(" · ") : "Using platform defaults";
}
