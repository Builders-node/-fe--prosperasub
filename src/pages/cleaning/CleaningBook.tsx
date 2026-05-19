import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserLayout } from "@/components/layout/UserLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Clock, CalendarDays, CheckCircle2, Info, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format, isSameDay, startOfWeek, endOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";

const MAX_PER_DAY = 3;

const CleaningBook = () => {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [selectedSubId, setSelectedSubId] = useState<string>("");
  const [notes, setNotes] = useState("");

  const { data: subscriptions } = useQuery({
    queryKey: ["my-cleaning-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_subscriptions")
        .select("*, cleaning_packages(name, cleanings_per_month)")
        .eq("is_active", true)
        .gt("cleanings_remaining", 0);
      if (error) throw error;
      return data;
    },
  });

  const { data: slots } = useQuery({
    queryKey: ["cleaning-slots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_available_slots")
        .select("*")
        .gte("date", format(new Date(), "yyyy-MM-dd"))
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // User's existing bookings (to enforce 1/week)
  const { data: myBookings } = useQuery({
    queryKey: ["my-cleaning-bookings-week"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_bookings")
        .select("id, status, cleaning_available_slots(date)")
        .eq("status", "booked");
      if (error) throw error;
      return data;
    },
  });

  // Weeks (Mon-Sun) the user already has a booking in
  const bookedWeekKeys = useMemo(() => {
    const set = new Set<string>();
    myBookings?.forEach((b: any) => {
      const dateStr = b.cleaning_available_slots?.date;
      if (!dateStr) return;
      const d = new Date(dateStr + "T00:00:00");
      const weekStart = startOfWeek(d, { weekStartsOn: 1 });
      set.add(format(weekStart, "yyyy-MM-dd"));
    });
    return set;
  }, [myBookings]);

  // Per-day totals across all slots
  const dayTotals = useMemo(() => {
    const map = new Map<string, number>();
    slots?.forEach((s) => {
      map.set(s.date, (map.get(s.date) || 0) + s.current_bookings);
    });
    return map;
  }, [slots]);

  const isDateDisabled = (date: Date) => {
    // Past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return true;
    // Sunday
    if (date.getDay() === 0) return true;
    // No slots configured
    const dateKey = format(date, "yyyy-MM-dd");
    const hasSlot = slots?.some(
      (s) => s.date === dateKey && s.current_bookings < s.max_bookings
    );
    if (!hasSlot) return true;
    // Day full (3/day cap)
    if ((dayTotals.get(dateKey) || 0) >= MAX_PER_DAY) return true;
    // Already booked this week
    const weekKey = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
    if (bookedWeekKeys.has(weekKey)) return true;
    return false;
  };

  const slotsForDate = selectedDate
    ? slots?.filter(
        (s) =>
          isSameDay(new Date(s.date + "T00:00:00"), selectedDate) &&
          s.current_bookings < s.max_bookings
      )
    : [];

  const bookMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("book_cleaning_slot", {
        p_subscription_id: selectedSubId,
        p_slot_id: selectedSlotId,
        p_notes: notes || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Cleaning booked!");
      queryClient.invalidateQueries({ queryKey: ["my-cleaning-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["cleaning-slots"] });
      queryClient.invalidateQueries({ queryKey: ["my-cleaning-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["my-cleaning-bookings-week"] });
      setSelectedSlotId("");
      setNotes("");
      setSelectedDate(undefined);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not book this slot");
    },
  });

  const hasSubscriptions = subscriptions && subscriptions.length > 0;
  const selectedSubscription = subscriptions?.find((subscription) => subscription.id === selectedSubId);

  useEffect(() => {
    if (hasSubscriptions && !selectedSubId && subscriptions.length === 1) {
      setSelectedSubId(subscriptions[0].id);
    }
  }, [hasSubscriptions, selectedSubId, subscriptions]);

  return (
    <UserLayout title="Book Cleaning" showBackButton backTo="/cleaning">
      <div className="market-content py-space-6 md:py-space-10">
        {!hasSubscriptions ? (
          <Card className="mx-auto max-w-xl p-space-8 text-center">
            <div className="mx-auto mb-space-4 flex h-16 w-16 items-center justify-center rounded-radius-full bg-primary/15 text-primary">
              <CalendarDays className="h-8 w-8" />
            </div>
            <h2 className="mb-space-2 text-panel-title">No Active Subscription</h2>
            <p className="mb-space-5 text-muted-foreground">
              Subscribe to a cleaning package first to start booking.
            </p>
            <Button onClick={() => window.location.href = "/cleaning"}>View Packages</Button>
          </Card>
        ) : (
          <div className="mx-auto max-w-6xl">
            <section className="mb-space-5 rounded-radius-xl bg-card p-space-6 md:p-space-8">
              <div className="flex flex-col gap-space-6 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="mb-space-4 inline-flex items-center gap-space-2 rounded-radius-full bg-primary/15 px-space-4 py-space-2 text-control text-primary">
                    <Sparkles className="h-4 w-4" />
                    Professional Cleaning
                  </div>
                  <h1 className="type-page-title">Book cleaning</h1>
                  <p className="mt-space-3 max-w-2xl text-body text-muted-foreground">
                    Pick an available weekday slot for your active cleaning plan.
                  </p>
                </div>

                <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4 md:min-w-[280px]">
                  <div className="flex items-center justify-between gap-space-4">
                    <div>
                      <p className="text-control text-muted-foreground">Cleanings remaining</p>
                      <p className="mt-space-1 text-panel-title">
                        {selectedSubscription?.cleanings_remaining || 0}
                      </p>
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-radius-full bg-primary text-lg font-black text-primary-foreground">
                      {selectedSubscription?.cleanings_remaining || 0}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {subscriptions.length > 1 && (
              <Card className="mb-space-5 p-space-5">
                <div className="grid gap-space-4 md:grid-cols-[240px_1fr] md:items-center">
                  <div>
                    <h2 className="text-card-title">Select plan</h2>
                    <p className="mt-space-1 text-body text-muted-foreground">
                      Choose which active plan to use.
                    </p>
                  </div>
                  <Select value={selectedSubId} onValueChange={setSelectedSubId}>
                    <SelectTrigger><SelectValue placeholder="Choose subscription" /></SelectTrigger>
                    <SelectContent>
                      {subscriptions.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          {(sub as any).cleaning_packages?.name} — {sub.cleanings_remaining} remaining
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </Card>
            )}

            <div className="grid gap-space-5 lg:grid-cols-[minmax(0,1fr)_390px]">
              <div className="space-y-space-5">
                <Card className="p-space-5 md:p-space-6">
                  <div className="mb-space-5 flex flex-col gap-space-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <CardTitle>Pick a date</CardTitle>
                      <p className="mt-space-2 text-body text-muted-foreground">
                        Available days are highlighted. Sundays and full days are disabled.
                      </p>
                    </div>
                    <div className="inline-flex items-start gap-space-2 rounded-radius-lg bg-[hsl(var(--app-control))] px-space-4 py-space-3 text-body text-muted-foreground">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>
                        <strong className="text-foreground">Rules:</strong> 1 cleaning per week, max 3 per day. Mon-Sat, 8 AM-4 PM.
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-center rounded-radius-xl bg-background p-space-4 md:p-space-6">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        setSelectedDate(date);
                        setSelectedSlotId("");
                      }}
                      disabled={isDateDisabled}
                      weekStartsOn={1}
                      className={cn("pointer-events-auto w-full max-w-[420px] p-0")}
                      classNames={{
                        months: "flex w-full flex-col",
                        month: "space-y-space-5",
                        caption: "relative flex items-center justify-center",
                        caption_label: "text-card-title",
                        nav_button: "h-10 w-10 rounded-radius-full bg-card text-foreground opacity-100 hover:bg-[hsl(var(--app-control))]",
                        nav_button_previous: "absolute left-0",
                        nav_button_next: "absolute right-0",
                        table: "w-full border-collapse",
                        head_row: "grid grid-cols-7",
                        head_cell: "text-center text-control text-muted-foreground",
                        row: "mt-space-3 grid grid-cols-7",
                        cell: "flex h-11 items-center justify-center p-0",
                        day: "h-10 w-10 rounded-radius-md p-0 text-body font-bold text-foreground hover:bg-[hsl(var(--app-control))]",
                        day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                        day_today: "bg-primary/15 text-foreground",
                        day_outside: "text-muted-foreground opacity-35",
                        day_disabled: "text-muted-foreground opacity-35",
                      }}
                    />
                  </div>
                </Card>

                <Card className="p-space-5 md:p-space-6">
                  <CardTitle>
                    {selectedDate ? `Available slots — ${format(selectedDate, "EEEE, MMM d")}` : "Available slots"}
                  </CardTitle>
                  <div className="mt-space-5">
                    {!selectedDate ? (
                      <EmptyState
                        title="Select a date"
                        description="Choose an available date above to see cleaning time slots."
                        compact
                        className="bg-background"
                      />
                    ) : !slotsForDate || slotsForDate.length === 0 ? (
                      <EmptyState
                        title="No available slots"
                        description="Try another date for cleaning availability."
                        compact
                        className="bg-background"
                      />
                    ) : (
                      <div className="grid gap-space-3 sm:grid-cols-2">
                        {slotsForDate.map((slot) => (
                          <Button
                            key={slot.id}
                            variant={selectedSlotId === slot.id ? "primary" : "secondary"}
                            size="lg"
                            onClick={() => setSelectedSlotId(slot.id)}
                            className="justify-center"
                          >
                            <Clock className="h-4 w-4" />
                            {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              <aside className="space-y-space-5">
                <Card className="p-space-5 md:p-space-6">
                  <CardTitle>Booking summary</CardTitle>
                  <div className="mt-space-5 space-y-space-4 text-body">
                    <div className="flex items-center justify-between gap-space-4">
                      <span className="text-muted-foreground">Plan</span>
                      <span className="font-bold text-right">{(selectedSubscription as any)?.cleaning_packages?.name || "Cleaning plan"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-space-4">
                      <span className="text-muted-foreground">Date</span>
                      <span className="font-bold text-right">{selectedDate ? format(selectedDate, "MMM d, yyyy") : "Not selected"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-space-4">
                      <span className="text-muted-foreground">Time</span>
                      <span className="font-bold text-right">
                        {slotsForDate?.find((slot) => slot.id === selectedSlotId)
                          ? `${slotsForDate.find((slot) => slot.id === selectedSlotId)?.start_time.slice(0, 5)} - ${slotsForDate.find((slot) => slot.id === selectedSlotId)?.end_time.slice(0, 5)}`
                          : "Not selected"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-space-4 rounded-radius-lg bg-primary/10 p-space-4">
                      <span className="font-bold">Remaining after booking</span>
                      <Badge variant="default" className="text-base">
                        {Math.max((selectedSubscription?.cleanings_remaining || 0) - (selectedSlotId ? 1 : 0), 0)}
                      </Badge>
                    </div>
                  </div>
                </Card>

                <Card className="p-space-5 md:p-space-6">
                  <div className="space-y-space-4">
                    <div>
                      <Label>Notes (optional)</Label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Any special instructions..."
                        className="mt-space-2"
                        disabled={!selectedSlotId}
                      />
                    </div>
                  <Button
                    className="w-full"
                    size="xl"
                    onClick={() => bookMutation.mutate()}
                    loading={bookMutation.isPending}
                    disabled={!selectedSubId || !selectedSlotId}
                  >
                    {!bookMutation.isPending && <CheckCircle2 className="h-5 w-5" />}
                    Confirm Booking
                  </Button>
                  </div>
                </Card>
              </aside>
            </div>
          </div>
        )}
      </div>
    </UserLayout>
  );
};

export default CleaningBook;
