import { useState } from "react";
import { ChevronRight, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();
  const summary = summarize(provider.booking_settings);

  return (
    <section className="mb-1 overflow-hidden rounded-radius-lg bg-card tracking-[-0.02em]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] leading-[22px] text-muted-foreground">Booking rules</p>
          <p className="mt-0.5 truncate text-[16px] leading-[22px] text-foreground">{summary}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {/* A sheet, not an accordion: these are a dozen fields — notice, window,
          limits, the week's hours — and unrolling them in place pushed the
          plans a screen and a half down the page. */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={isMobile ? "h-[92vh] rounded-t-radius-lg p-0" : "w-full max-w-xl p-0 sm:max-w-xl"}
        >
          <SheetHeader className="px-4 py-4">
            <SheetTitle className="text-[20px] font-semibold leading-[26px]">Booking rules</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100%-64px)] overflow-y-auto bg-background px-4 pb-8 pt-1">
            <BookingSettingsForm provider={provider} />
          </div>
        </SheetContent>
      </Sheet>
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
