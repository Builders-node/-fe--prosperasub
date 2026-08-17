import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, LayoutGrid, List, Users, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabaseDb } from "@/integrations/supabase/client";
import { UnifiedBookingCalendar } from "@/components/provider/UnifiedBookingCalendar";
import { NewCleaningBookingDialog } from "@/components/cleaning/NewCleaningBookingDialog";
import { NewFoodSubscriptionDialog } from "@/components/food/NewFoodSubscriptionDialog";

/**
 * The schedule — one tab, three questions.
 *
 *   • Today      → the day's work: address, access, who is doing it, done/failed
 *   • Week       → what is booked, as a grid or as a list
 *   • Customers  → who is subscribed
 *
 * Operations used to be a tab of its own sitting next to one called Bookings,
 * and both were lists of the same occurrences an hour apart. The split people
 * actually make is not between two screens of times — it is between LOOKING at
 * what is booked and DOING today's work, which is why "Today" keeps its list
 * shape and its verbs while the week is a calendar.
 *
 * The week has two shapes because not everything is an hour: a court is a slot
 * and reads well on a grid; twelve cleaning visits between 8 and 10 are a
 * legible list and an unreadable grid. That switch lives inside the week rather
 * than becoming a fourth lens — it is one question drawn two ways.
 */
type View = "today" | "week" | "customer";

export function BookingsTab({
  providerId,
  universalProviderId,
  sourceKey,
  byCustomer,
  today,
}: {
  /** Legacy provider id — passed through to whatever service-specific views need it. */
  providerId: string;
  /** Universal `providers.id` — what `bookable_resources` is keyed by. */
  universalProviderId?: string;
  /** Legacy service key — drives the UnifiedBookingCalendar adapter selection. */
  sourceKey: string;
  /** The subscriber list. */
  byCustomer?: ReactNode;
  /** The day's work — what used to be the Operations tab. */
  today?: ReactNode;
}) {
  const [view, setView] = useState<View>(today ? "today" : "week");
  /** How the week is drawn; null means "whatever suits this business". */
  const [weekShape, setWeekShape] = useState<"grid" | "list" | null>(null);

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

  // A business with calendars gets asked "is court 2 free at six", so it opens
  // on the grid; one without them has nothing to position and opens on a list.
  const hasCalendars = calendarCount > 0;
  const shape = weekShape ?? (hasCalendars ? "grid" : "list");

  const options: Array<{ key: View; label: string; icon: typeof Users }> = [
    ...(today ? [{ key: "today" as View, label: "Today", icon: Wrench }] : []),
    { key: "week", label: "Week", icon: CalendarDays },
    ...(byCustomer ? [{ key: "customer" as View, label: "Customers", icon: Users }] : []),
  ];

  const isCleaning = sourceKey === "cleaning";
  const isFood = sourceKey === "food";
  const active = options.some((o) => o.key === view) ? view : options[0]?.key ?? "week";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {options.length > 1 && (
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
          )}

          {/* Only where both shapes make sense — with no calendars a grid has
              nothing to draw columns for. */}
          {active === "week" && hasCalendars && (
            <div className="inline-flex rounded-full bg-muted/40 p-0.5 text-xs font-semibold">
              {([["grid", "Grid", LayoutGrid], ["list", "List", List]] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setWeekShape(key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
                    shape === key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cleaning-only: hand-schedule a one-off visit for an existing paid
            subscription. Food gets its own "New subscription" flow — an admin
            adds a customer to a weekly meal plan for N weeks, marked paid. */}
        {isCleaning && <NewCleaningBookingDialog providerId={providerId} />}
        {isFood && <NewFoodSubscriptionDialog providerId={providerId} />}
      </div>

      {active === "today" && today ? today
        : active === "customer" && byCustomer ? byCustomer
        : (
          <UnifiedBookingCalendar
            providerId={providerId}
            calendarsProviderId={calendarsId}
            sourceKey={sourceKey}
            groupBy={shape === "grid" ? "calendar" : "day"}
          />
        )}
    </div>
  );
}
