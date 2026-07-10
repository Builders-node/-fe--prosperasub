import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { Waves, ChevronLeft, ChevronRight, Clock, X, Plus, CalendarDays, CircleDot, Lock } from "lucide-react";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { supabaseDb, accountApi } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { todayHN } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Opening hours — keep in sync with the admin courts page (8 AM–7 PM).
const START_HOUR = 8;
const END_HOUR = 19;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h >= 12 ? "PM" : "AM"}`;
const slotLabel = (h: number) => `${hourLabel(h)} - ${hourLabel(h + 1)}`;

interface Court { id: string; name: string; type: string; }
/** Booking as returned by the new engine (`/booking/bookings`). */
interface EngineBooking {
  id: string; resource_id: string; subject_ref: string | null;
  start_at: string; end_at: string; slot_key: string; status: string;
}

const BeachCourts = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { userData, isAuthenticated, isLoading: authLoading } = useAuth();
  const userUuid = useUserUuid();
  const myIds = [userUuid, userData?.id].filter(Boolean) as string[];

  const [courtId, setCourtId] = useState("");
  const [date, setDate] = useState(todayHN());

  // ── Active membership gate ───────────────────────────────────────────────
  const { data: membership, isLoading: membershipLoading } = useQuery({
    queryKey: ["my-beach-membership", userUuid, userData?.id],
    queryFn: async () => {
      if (!myIds.length) return null;
      const { data, error } = await supabaseDb
        .from("beach_club_subscriptions")
        .select("id, plan_name, status, end_date")
        .in("user_id", myIds)
        .eq("status", "active")
        .order("end_date", { ascending: false });
      if (error) throw error;
      const today = todayHN();
      return (data ?? []).find((s: any) => !s.end_date || s.end_date >= today) ?? null;
    },
    enabled: isAuthenticated && myIds.length > 0,
  });

  const { data: courts = [] } = useQuery({
    queryKey: ["beach-courts-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("beach_club_courts").select("id, name, type").eq("is_active", true).order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Court[];
    },
    enabled: !!membership,
  });

  const activeCourtId = courtId || courts[0]?.id || "";

  // DDD Step 4+5 cutover — bookings now go through the domain Booking engine.
  // Bridge: courtId (legacy) → bookable_resources.id (engine key).
  const { data: resourceId = "" } = useQuery({
    queryKey: ["beach-court-resource-id", activeCourtId],
    enabled: !!activeCourtId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("bookable_resources").select("id")
        .eq("source_service_key", "beach")
        .eq("source_resource_id", activeCourtId).maybeSingle();
      if (error) throw error;
      return (data?.id ?? "") as string;
    },
  });

  const bookingsQueryKey = ["beach-engine-bookings", resourceId, date] as const;
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: bookingsQueryKey,
    enabled: !!resourceId,
    queryFn: async () => {
      const { data, error } = await accountApi(`/booking/bookings?resourceId=${encodeURIComponent(resourceId)}&date=${date}`);
      if (error) throw error;
      return (data ?? []) as EngineBooking[];
    },
  });

  const bookingByHour = useMemo(() => {
    const m = new Map<number, EngineBooking>();
    for (const b of bookings) {
      const h = new Date(b.start_at).getHours();
      m.set(h, b);
    }
    return m;
  }, [bookings]);

  const mySubjectRefs = useMemo(() => myIds.map((id) => `user:${id}`), [myIds]);
  const isMine = (b?: EngineBooking) => !!b && mySubjectRefs.includes(String(b.subject_ref));

  const book = useMutation({
    mutationFn: async (hour: number) => {
      const from = `${String(hour).padStart(2, "0")}:00`;
      const hold = await accountApi("/booking/hold", {
        method: "POST",
        body: JSON.stringify({ resource_id: resourceId, date, from }),
      });
      if (hold.error) throw new Error(hold.error.message || "Could not hold slot");
      const held = hold.data as { held?: boolean; bookingId?: string; reason?: string } | null;
      if (!held?.held || !held.bookingId) {
        throw new Error(held?.reason === "slot_taken" ? "That slot was just taken." : "Slot unavailable");
      }
      const confirm = await accountApi(`/booking/holds/${held.bookingId}/confirm`, {
        method: "POST", body: JSON.stringify({}),
      });
      if (confirm.error) throw new Error(confirm.error.message || "Could not confirm booking");
    },
    onSuccess: () => {
      toast.success("Court booked");
      qc.invalidateQueries({ queryKey: bookingsQueryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await accountApi(`/booking/bookings/${id}/cancel`, {
        method: "POST", body: JSON.stringify({}),
      });
      if (error) throw new Error(error.message || "Could not cancel");
    },
    onSuccess: () => { toast.success("Booking cancelled"); qc.invalidateQueries({ queryKey: bookingsQueryKey }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const shiftDay = (n: number) => setDate(format(addDays(new Date(`${date}T00:00:00`), n), "yyyy-MM-dd"));

  const content = () => {
    if (authLoading || membershipLoading) return <PageLoader />;
    if (!isAuthenticated) {
      return (
        <YdEmptyState
          icon={Lock}
          title="Sign in to book courts"
          subtitle="Log in to your account to reserve a court."
        />
      );
    }
    if (!membership) {
      return (
        <div className="rounded-3xl border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <p className="text-lg font-black text-foreground">Membership required</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Court booking is included with an active Beach Club membership. Subscribe to reserve courts any time.
          </p>
          <Button className="mt-5 rounded-full bg-primary text-black hover:bg-[hsl(var(--brand-accent-hover))]" onClick={() => navigate("/services/beach-club")}>
            View membership plans
          </Button>
        </div>
      );
    }

    const activeCourt = courts.find((c) => c.id === activeCourtId);
    return (
      <>
        {/* Court tabs */}
        <div className="mb-space-4 flex flex-wrap gap-2">
          {courts.map((c) => (
            <button key={c.id} type="button" onClick={() => setCourtId(c.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                c.id === activeCourtId ? "bg-primary text-black" : "bg-muted/50 text-muted-foreground hover:text-foreground",
              )}>
              <CircleDot className="h-4 w-4" />
              {c.name}
              <span className="text-[10px] font-bold uppercase opacity-70">{c.type}</span>
            </button>
          ))}
        </div>

        {/* Date controls */}
        <div className="mb-space-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-space-4">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="iconSm" className="rounded-full" onClick={() => shiftDay(-1)} aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <input type="date" value={date} min={todayHN()} onChange={(e) => setDate(e.target.value || todayHN())}
                className="h-9 w-[160px] rounded-xl border border-border bg-card px-3 text-sm text-foreground" />
            </div>
            <Button variant="secondary" size="iconSm" className="rounded-full" onClick={() => shiftDay(1)} aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={() => setDate(todayHN())}>Today</Button>
          </div>
          <p className="text-sm text-muted-foreground"><span className="font-bold text-foreground">{activeCourt?.name}</span></p>
        </div>

        {/* Hourly slots */}
        <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3", bookingsLoading && "opacity-50")}>
          {HOURS.map((h) => {
            const b = bookingByHour.get(h);
            const mine = isMine(b);
            return (
              <div key={h}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
                  b ? (mine ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30") : "border-border bg-card",
                )}>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-foreground"><Clock className="h-3.5 w-3.5 text-muted-foreground" />{slotLabel(h)}</p>
                  <p className={cn("mt-0.5 text-xs", mine ? "text-primary" : "text-muted-foreground")}>
                    {b ? (mine ? "Your booking" : "Booked") : "Available"}
                  </p>
                </div>
                {b ? (
                  mine ? (
                    <button type="button" onClick={() => cancel.mutate(b.id)} disabled={cancel.isPending}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Cancel booking" title="Cancel">
                      <X className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">Taken</span>
                  )
                ) : (
                  <Button size="sm" className="shrink-0 gap-1 rounded-full bg-primary text-black hover:bg-[hsl(var(--brand-accent-hover))]"
                    disabled={book.isPending} onClick={() => book.mutate(h)}>
                    <Plus className="h-3.5 w-3.5" /> Book
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <HomeHeader title="Beach Club Courts" showBackButton onBack={() => navigate("/services/beach-club")} />
      <DesktopHeader />
      <main className="market-content py-space-4 md:py-space-8">
        <div className="mb-space-4">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Waves className="h-6 w-6 text-primary" /> Book a court
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Reserve a tennis or pickleball court by the hour — included with your membership.</p>
        </div>
        {content()}
      </main>
      <BottomNav />
    </div>
  );
};

export default BeachCourts;
