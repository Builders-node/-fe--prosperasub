import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, LandPlot, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabaseDb } from "@/integrations/supabase/client";
import { UnifiedBookingCalendar } from "@/components/provider/UnifiedBookingCalendar";
import { NewCleaningBookingDialog } from "@/components/cleaning/NewCleaningBookingDialog";
import { NewFoodSubscriptionDialog } from "@/components/food/NewFoodSubscriptionDialog";

/**
 * "Who has booked what?" — one question, the same rows, three axes:
 *
 *   • By customer  → one row per active customer (service-specific body)
 *   • By day       → the week, cut into days
 *   • By calendar  → the week, cut into calendars
 *
 * The third exists because a club with three courts could not read "how busy is
 * court 2" off a list of days without counting. It offers itself only where
 * there are calendars to group by: a restaurant's deliveries have none, and a
 * toggle that reveals one bucket called "No calendar" is worse than no toggle.
 */
type View = "customer" | "day" | "calendar";

export function BookingsTab({
  providerId,
  universalProviderId,
  sourceKey,
  byCustomer,
}: {
  /** Legacy provider id — passed through to whatever service-specific views need it. */
  providerId: string;
  /** Universal `providers.id` — what `bookable_resources` is keyed by. */
  universalProviderId?: string;
  /** Legacy service key — drives the UnifiedBookingCalendar adapter selection. */
  sourceKey: string;
  /** Optional "By customer" body. Services without subscriptions omit it. */
  byCustomer?: ReactNode;
}) {
  const [view, setView] = useState<View>(byCustomer ? "customer" : "day");

  const calendarsId = universalProviderId ?? providerId;
  const { data: calendarCount = 0 } = useQuery({
    queryKey: ["provider-calendar-count", calendarsId],
    enabled: !!calendarsId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { count, error } = await supabaseDb
        .from("bookable_resources")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", calendarsId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const options: Array<{ key: View; label: string; icon: typeof Users }> = [
    ...(byCustomer ? [{ key: "customer" as View, label: "By customer", icon: Users }] : []),
    { key: "day", label: "By day", icon: CalendarDays },
    // One calendar groups into one section, which is the same list with a
    // heading — worth offering from two.
    ...(calendarCount > 1 ? [{ key: "calendar" as View, label: "By calendar", icon: LandPlot }] : []),
  ];

  const isCleaning = sourceKey === "cleaning";
  const isFood = sourceKey === "food";
  const active = options.some((o) => o.key === view) ? view : options[0]?.key ?? "day";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {options.length > 1 ? (
          <div className="inline-flex rounded-full bg-muted/40 p-0.5 text-xs font-semibold">
            {options.map((o) => {
              const Icon = o.icon;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setView(o.key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
                    active === o.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {o.label}
                </button>
              );
            })}
          </div>
        ) : <span />}

        {/* Cleaning-only: hand-schedule a one-off visit for an existing paid
            subscription. Food gets its own "New subscription" flow — an admin
            adds a customer to a weekly meal plan for N weeks, marked paid.
            Cars/beach have their own booking flows. */}
        {isCleaning && <NewCleaningBookingDialog providerId={providerId} />}
        {isFood && <NewFoodSubscriptionDialog providerId={providerId} />}
      </div>

      {active === "customer" && byCustomer
        ? byCustomer
        : (
          <UnifiedBookingCalendar
            providerId={providerId}
            sourceKey={sourceKey}
            groupBy={active === "calendar" ? "calendar" : "day"}
          />
        )}
    </div>
  );
}
