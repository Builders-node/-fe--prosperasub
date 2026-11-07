import { useState, type ReactNode } from "react";
import { useTabParam } from "@/hooks/useTabParam";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, LayoutGrid, List, Plus, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QueryError } from "@/components/patterns/QueryError";
import { WorkspaceCard } from "@/components/provider/WorkspaceUI";
import { supabaseDb } from "@/integrations/supabase/client";
import { UnifiedBookingCalendar } from "@/components/provider/UnifiedBookingCalendar";
import { NewCalendarBookingDialog } from "@/components/provider/NewCalendarBookingDialog";
import { NewCleaningBookingDialog } from "@/components/cleaning/NewCleaningBookingDialog";
import { NewFoodSubscriptionDialog } from "@/components/food/NewFoodSubscriptionDialog";
import { NewBeachMembershipDialog } from "@/legacy/beach";

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
  // Which of the three, kept in the URL beside the workspace tab, so a reload
  // on "Customers" comes back on Customers rather than on today's list.
  const [view, setView] = useTabParam<View>(["today", "week", "customer"], {
    key: "view",
    fallback: today ? "today" : "week",
  });
  /** How the week is drawn; null means "whatever suits this business". */
  const [weekShape, setWeekShape] = useState<"grid" | "list" | null>(null);

  const calendarsId = universalProviderId ?? providerId;
  const {
    data: calendarCount = 0, isError: countError, error: countErr,
    refetch: refetchCount, isFetching: countFetching,
  } = useQuery({
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
  const isBeach = sourceKey === "beach" || sourceKey === "beach_club";
  const active = options.some((o) => o.key === view) ? view : options[0]?.key ?? "week";

  return (
    <div className="space-y-1">
      {/* The lens and the one action, on a card like every other tab's top.
          They used to float on the page background with no inset, so on a
          phone the text ran to the screen edge, and the lens switch was a
          yellow pill — the same fill as the button beside it, so two things
          shouted at once. The switch is the system's segment now. */}
      <WorkspaceCard className="space-y-3">
        {options.length > 1 && (
          <div className="flex rounded-radius-md bg-inset p-0.5">
            {options.map((o) => {
              const Icon = o.icon;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setView(o.key)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-radius-md px-3 py-2 text-body font-semibold transition-colors",
                    active === o.key ? "bg-segment text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" /> {o.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Every business gets the same button in the same place.
            It was cleaning's alone: a beach club taking a call had to book the
            court from the customer's own screen, under the staff member's
            name, and a provider with calendars had no way in at all.

            What it opens is what the business actually schedules — a cleaning
            booking is a visit against a paid subscription, everything else is
            an hour on a calendar — but the door is one door. Food keeps its
            subscription flow beside it, because adding a customer to a weekly
            meal plan is a different act, not a booking. */}
        <div className="flex flex-wrap items-center gap-2">
          {isCleaning
            ? <NewCleaningBookingDialog providerId={providerId} />
            : <NewCalendarBookingDialog providerId={calendarsId} />}
          {isFood && (
            <NewFoodSubscriptionDialog
              providerId={providerId}
              trigger={
                <Button variant="secondary" className="gap-2 rounded-full">
                  <Plus className="h-4 w-4" /> New subscription
                </Button>
              }
            />
          )}
          {isBeach && (
            <NewBeachMembershipDialog
              providerUniversalId={calendarsId}
              trigger={
                <Button variant="secondary" className="gap-2 rounded-full">
                  <Plus className="h-4 w-4" /> New membership
                </Button>
              }
            />
          )}

          {/* Only where both shapes make sense — with no calendars a grid has
              nothing to draw columns for. */}
          {active === "week" && hasCalendars && (
            <div className="ml-auto inline-flex rounded-radius-md bg-inset p-0.5">
              {([["grid", "Grid", LayoutGrid], ["list", "List", List]] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setWeekShape(key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-radius-md px-3 py-1.5 text-meta font-semibold transition-colors",
                    shape === key ? "bg-segment text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </WorkspaceCard>

      {/* Without the count the week falls back to a list — still usable, so
          say why the grid is missing rather than replace the view. */}
      {active === "week" && countError && (
        <QueryError
          compact
          title="Couldn't load your calendars"
          error={countErr}
          onRetry={() => refetchCount()}
          retrying={countFetching}
        />
      )}

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
