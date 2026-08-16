import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, X } from "lucide-react";
import { toast } from "sonner";
import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TimeSlotPicker } from "@/components/booking/TimePickers";
import { supabaseDb, accountApi } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { useGoBack } from "@/hooks/useGoBack";
import { todayHN, addDaysISO } from "@/lib/timezone";
import { bookingErrorMessage } from "@/lib/booking/errors";
import { cn } from "@/lib/utils";

/**
 * Book a time on one of a provider's calendars — any provider.
 *
 * The beach club has had this screen for a while and it is already engine-
 * driven; what made it the beach's own was where it read the list of things to
 * book (`beach_club_courts`) and who it let in (`beach_club_subscriptions`).
 * Both are general now: the calendars come from `bookable_resources`, and
 * whether this customer may hold a slot is the server's answer, given the plan
 * they hold — asked by trying, rather than guessed at by the page.
 */

interface Calendar { id: string; name: string; type: string }
interface Slot { from: string; to: string; capacity?: number }
interface EngineBooking {
  id: string; resource_id: string; subject_ref: string | null;
  start_at: string; end_at: string; slot_key: string; status: string;
}

const timeLabel = (hhmm: string): string => {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
};

/** The wall-clock start the engine assigned, however the row records it. */
const startKeyOf = (b: EngineBooking): string => {
  const fromKey = String(b.slot_key ?? "").split("|")[2];
  if (/^\d{2}:\d{2}$/.test(fromKey ?? "")) return fromKey;
  // Falling back to the browser's clock would put a booking on the wrong row
  // for anyone not sitting in Honduras — their own reservation would read as
  // free. Resolve the instant in the provider's zone instead.
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Tegucigalpa", hour12: false, hour: "2-digit", minute: "2-digit",
  }).format(new Date(b.start_at));
};

export default function BookCalendar() {
  const { providerId = "" } = useParams<{ providerId: string }>();
  const goBack = useGoBack("/discovery");
  const qc = useQueryClient();
  const { userData } = useAuth();
  const userUuid = useUserUuid();
  const myRefs = useMemo(
    () => [userUuid, userData?.id].filter(Boolean).map((id) => `user:${id}`),
    [userUuid, userData?.id],
  );

  const [calendarId, setCalendarId] = useState("");
  const [date, setDate] = useState(todayHN());

  const { data: provider } = useQuery({
    queryKey: ["book-provider", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers").select("id, name").eq("id", providerId).maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string } | null;
    },
  });

  const { data: calendars = [], isLoading: calendarsLoading } = useQuery({
    queryKey: ["book-calendars", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("bookable_resources")
        .select("id, name, type")
        .eq("provider_id", providerId)
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Calendar[];
    },
  });

  const activeId = calendarId || calendars[0]?.id || "";

  const { data: availability, isLoading: slotsLoading } = useQuery({
    queryKey: ["book-availability", activeId, date],
    enabled: !!activeId,
    queryFn: async () => {
      const { data, error } = await accountApi(
        `/booking/availability?resourceId=${encodeURIComponent(activeId)}&date=${date}`,
      );
      if (error) throw error;
      return (data ?? { slots: [] }) as { slots: Slot[]; reason?: string };
    },
  });

  const bookingsKey = ["book-bookings", activeId, date] as const;
  const { data: bookings = [] } = useQuery({
    queryKey: bookingsKey,
    enabled: !!activeId,
    queryFn: async () => {
      const { data, error } = await accountApi(
        `/booking/bookings?resourceId=${encodeURIComponent(activeId)}&date=${date}`,
      );
      if (error) throw error;
      return (data ?? []) as EngineBooking[];
    },
  });

  const takenBy = useMemo(() => {
    const m = new Map<string, EngineBooking>();
    bookings.forEach((b) => m.set(startKeyOf(b), b));
    return m;
  }, [bookings]);

  const book = useMutation({
    mutationFn: async (from: string) => {
      const hold = await accountApi("/booking/hold", {
        method: "POST",
        body: JSON.stringify({ resource_id: activeId, date, from }),
      });
      if (hold.error) throw new Error(bookingErrorMessage(hold.error.message));
      const held = hold.data as { held?: boolean; bookingId?: string; reason?: string } | null;
      if (!held?.held || !held.bookingId) throw new Error(bookingErrorMessage(held?.reason));
      const confirm = await accountApi(`/booking/holds/${held.bookingId}/confirm`, {
        method: "POST", body: JSON.stringify({}),
      });
      if (confirm.error) throw new Error(bookingErrorMessage(confirm.error.message, "Could not confirm the booking"));
    },
    onSuccess: () => {
      toast.success("Booked");
      qc.invalidateQueries({ queryKey: bookingsKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await accountApi(`/booking/bookings/${id}/cancel`, {
        method: "POST", body: JSON.stringify({}),
      });
      if (error) throw new Error(bookingErrorMessage(error.message, "Could not cancel"));
    },
    onSuccess: () => {
      toast.success("Cancelled");
      qc.invalidateQueries({ queryKey: bookingsKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const options = (availability?.slots ?? []).map((s) => {
    const taken = takenBy.get(s.from);
    return {
      start: s.from,
      label: `${timeLabel(s.from)} – ${timeLabel(s.to)}`,
      disabled: !!taken,
    };
  });

  const mine = bookings.filter((b) => myRefs.includes(String(b.subject_ref)));
  const days = Array.from({ length: 14 }, (_, i) => addDaysISO(todayHN(), i));

  return (
    <UserLayout title="Book a time">
      <div className="mx-auto w-full max-w-[1280px] space-y-1 pb-8 pt-1 md:px-space-4">
        <section className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
          <button type="button" onClick={goBack}
            className="mb-2 flex items-center gap-1 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-[24px] font-semibold leading-[29px] text-foreground">
            {provider?.name ?? "Book a time"}
          </h1>
          <p className="mt-1 text-[16px] leading-[22px] text-muted-foreground">
            Pick what you're booking, then a day and a time.
          </p>
        </section>

        {calendarsLoading ? (
          <div className="h-24 animate-pulse rounded-radius-lg bg-card" />
        ) : calendars.length === 0 ? (
          <section className="rounded-radius-lg bg-card p-8 text-center tracking-[-0.02em]">
            <p className="text-[16px] leading-[22px] text-muted-foreground">
              This business doesn't take bookings on a calendar yet.
            </p>
          </section>
        ) : (
          <>
            {calendars.length > 1 && (
              <section className="rounded-radius-lg bg-card p-4">
                <div className="flex flex-wrap gap-2">
                  {calendars.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCalendarId(c.id)}
                      className={cn(
                        "rounded-full px-3.5 py-2 text-[14px] font-semibold transition-colors",
                        c.id === activeId ? "bg-foreground text-background" : "bg-inset text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Two weeks ahead: far enough for a plan's month, short enough
                that the row is scannable. The engine refuses anything beyond
                the provider's own advance window anyway. */}
            <section className="rounded-radius-lg bg-card p-4">
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {days.map((d) => {
                  const [, month, day] = d.split("-");
                  const weekday = new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDate(d)}
                      className={cn(
                        "flex shrink-0 flex-col items-center rounded-radius-md px-3 py-2 transition-colors",
                        d === date ? "bg-foreground text-background" : "bg-inset text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span className="text-[12px] uppercase">{weekday}</span>
                      <span className="text-[16px] font-semibold tabular-nums">{day}</span>
                      <span className="text-[12px]">{month}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {mine.length > 0 && (
              <section className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
                <h2 className="text-[20px] font-semibold leading-[26px] text-foreground">Yours, this day</h2>
                <div className="mt-3 space-y-2">
                  {mine.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 rounded-radius-md bg-inset p-3">
                      <span className="flex-1 text-[16px] font-semibold leading-[22px] text-foreground">
                        {timeLabel(startKeyOf(b))}
                      </span>
                      <Button
                        size="sm" variant="ghost"
                        className="h-8 gap-1.5 rounded-full px-3 text-destructive hover:text-destructive"
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate(b.id)}
                      >
                        <X className="h-4 w-4" /> Cancel
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {slotsLoading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : options.length === 0 ? (
              <section className="rounded-radius-lg bg-card p-8 text-center tracking-[-0.02em]">
                <p className="text-[16px] leading-[22px] text-muted-foreground">
                  Nothing bookable on this day. Try another — or the business may not have opened
                  this calendar yet.
                </p>
              </section>
            ) : (
              <TimeSlotPicker
                options={options}
                selected=""
                onSelect={(start) => { if (!book.isPending) book.mutate(start); }}
                className="rounded-radius-lg border-0"
              />
            )}
          </>
        )}
      </div>
    </UserLayout>
  );
}
