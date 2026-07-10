import { useState, type ReactNode } from "react";
import { CalendarDays, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { UnifiedBookingCalendar } from "@/components/provider/UnifiedBookingCalendar";

/**
 * The single Bookings tab that replaces the old per-service Subscriptions tab
 * AND the injected Calendar tab. Same question — "who has booked what?" —
 * answered two ways by the same data:
 *
 *   • By day       → week calendar, one row per booking (UnifiedBookingCalendar)
 *   • By customer  → subscription list, one row per active customer (service-specific)
 *
 * Cars don't have subscriptions (booking-per-rental model), so they get the
 * calendar view only — the toggle is hidden.
 */
export function BookingsTab({
  providerId,
  sourceKey,
  byCustomer,
}: {
  /** Legacy provider id — passed through to whatever service-specific views need it. */
  providerId: string;
  /** Legacy service key — drives the UnifiedBookingCalendar adapter selection. */
  sourceKey: string;
  /** Optional "By customer" body. Cars omit it and only the calendar renders. */
  byCustomer?: ReactNode;
}) {
  const [view, setView] = useState<"day" | "customer">(byCustomer ? "customer" : "day");
  const showToggle = !!byCustomer;

  return (
    <div className="space-y-4">
      {showToggle && (
        <div className="inline-flex rounded-full bg-muted/40 p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setView("customer")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
              view === "customer" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Users className="h-3.5 w-3.5" /> By customer
          </button>
          <button
            type="button"
            onClick={() => setView("day")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
              view === "day" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" /> By day
          </button>
        </div>
      )}

      {view === "day" || !byCustomer ? (
        <UnifiedBookingCalendar providerId={providerId} sourceKey={sourceKey} />
      ) : (
        byCustomer
      )}
    </div>
  );
}
