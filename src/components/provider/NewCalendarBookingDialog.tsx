import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserPicker } from "@/components/patterns/UserPicker";
import { accountApi, supabaseDb } from "@/integrations/supabase/client";
import { todayHN } from "@/lib/timezone";
import { cn } from "@/lib/utils";

/**
 * A booking taken by the business, on one of its own calendars.
 *
 * The counter case: somebody phones, or walks up, and the desk puts them on a
 * court. Until now the only way in was the customer's own screen, which books
 * under whoever is signed in — so a provider taking a call could either book
 * it under their own name or write it on paper.
 *
 * Slots come from the same `/booking/availability` the customer sees, so the
 * desk cannot invent an hour the calendar doesn't sell, and the double-booking
 * guard is the DB's partial unique index rather than anything trusted here.
 * The membership rules are skipped on purpose (see `bookForCustomer`): a
 * walk-in paying cash has no membership, and that is the business's call.
 */

interface Slot { from: string; to: string }
interface Resource { id: string; name: string; type: string | null }

export function NewCalendarBookingDialog({
  providerId,
  trigger,
}: {
  /** Universal `providers.id` — what `bookable_resources` is keyed by. */
  providerId: string;
  trigger?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [resourceId, setResourceId] = useState("");
  const [date, setDate] = useState(todayHN());
  const [from, setFrom] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const { data: resources = [], isLoading: loadingResources } = useQuery({
    queryKey: ["provider-calendars", providerId],
    enabled: open && !!providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("bookable_resources")
        .select("id, name, type")
        .eq("provider_id", providerId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Resource[];
    },
  });

  // Open on the first calendar rather than an empty select — a business with
  // one court should not have to choose it.
  useEffect(() => {
    if (!resourceId && resources.length) setResourceId(resources[0].id);
  }, [resources, resourceId]);

  const { data: availability, isFetching: loadingSlots } = useQuery({
    queryKey: ["desk-availability", resourceId, date],
    enabled: open && !!resourceId && !!date,
    queryFn: async () => {
      const { data, error } = await accountApi(
        `/booking/availability?resourceId=${encodeURIComponent(resourceId)}&date=${date}`,
      );
      if (error) throw error;
      return (data ?? { slots: [] }) as { slots: Slot[]; reason?: string };
    },
  });
  const slots = availability?.slots ?? [];

  // A calendar that is closed says so; one that is open but full says something
  // different, and the desk needs to tell those apart before ringing back.
  const noSlotsReason = useMemo(() => {
    if (loadingSlots || slots.length) return null;
    if (availability?.reason) return availability.reason.replace(/_/g, " ");
    return "Nothing free on this day.";
  }, [availability, loadingSlots, slots.length]);

  useEffect(() => { setFrom(""); }, [resourceId, date]);

  const reset = () => {
    setOpen(false);
    setFrom(""); setUserId(null); setName(""); setNotes("");
  };

  const book = useMutation({
    mutationFn: async () => {
      const { data, error } = await accountApi("/booking/bookings/for-customer", {
        method: "POST",
        body: JSON.stringify({
          resource_id: resourceId,
          date,
          from,
          customer_user_id: userId ?? undefined,
          customer_name: name.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (error) throw new Error(error.message || "Could not book that slot");
      return data;
    },
    onSuccess: () => {
      toast.success("Booked");
      qc.invalidateQueries({ queryKey: ["provider-bookings"] });
      qc.invalidateQueries({ queryKey: ["desk-availability"] });
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canBook = !!resourceId && !!date && !!from && (!!userId || !!name.trim());

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <Button onClick={() => setOpen(true)} className="gap-2 rounded-full">
          <CalendarDays className="h-4 w-4" /> New booking
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : reset())}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" /> New booking
            </DialogTitle>
            <DialogDescription>
              An hour on one of your calendars, taken for a customer.
            </DialogDescription>
          </DialogHeader>

          {loadingResources ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : resources.length === 0 ? (
            <p className="rounded-radius-md bg-inset p-4 text-sm text-muted-foreground">
              This business has no calendars yet. Add one in the Calendars tab and it becomes
              bookable here and for customers.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Calendar</Label>
                  <Select value={resourceId} onValueChange={setResourceId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Pick one" /></SelectTrigger>
                    <SelectContent>
                      {resources.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Day</Label>
                  <Input type="date" className="mt-1" value={date} min={todayHN()}
                    onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>

              <div>
                <Label>Time</Label>
                {loadingSlots ? (
                  <div className="mt-2 flex gap-2">
                    {[1, 2, 3, 4].map((i) => <div key={i} className="h-9 w-20 animate-pulse rounded-full bg-inset" />)}
                  </div>
                ) : noSlotsReason ? (
                  <p className="mt-2 rounded-radius-md bg-inset p-3 text-sm text-muted-foreground first-letter:uppercase">
                    {noSlotsReason}
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {slots.map((s) => (
                      <button
                        key={s.from} type="button" onClick={() => setFrom(s.from)}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                          from === s.from
                            ? "bg-primary text-primary-foreground"
                            : "bg-inset text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {s.from}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label>Customer</Label>
                <div className="mt-1">
                  <UserPicker
                    value={userId ?? ""}
                    onSelect={(u) => {
                      setUserId(u?.id ?? null);
                      // Keep the name the booking will carry in step with the
                      // person picked, so the desk sees who it is about to book
                      // rather than an id it cannot read.
                      setName(u ? (u.display_name || u.name || u.email || "") : "");
                    }}
                    placeholder="Search platform users…"
                    allowClear
                    clearLabel="Not a platform user"
                  />
                </div>
                {/* A walk-in has no account. The name is then all the booking
                    knows about them, which is why one of the two is required. */}
                {!userId && (
                  <Input className="mt-2" placeholder="…or type the name for a walk-in"
                    value={name} onChange={(e) => setName(e.target.value)} />
                )}
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea className="mt-1" rows={2} value={notes}
                  placeholder="Anything the person on shift should know"
                  onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={reset}>Cancel</Button>
            <Button
              className="rounded-full"
              disabled={!canBook || book.isPending}
              onClick={() => book.mutate()}
            >
              {book.isPending ? "Booking…" : "Book it"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
