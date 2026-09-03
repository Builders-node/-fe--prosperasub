import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, RotateCcw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { accountApi } from "@/integrations/supabase/client";
import { todayHN } from "@/lib/timezone";
import { itemLabel, useProviderItems } from "@/lib/services/providerItems";
import { cn } from "@/lib/utils";

/**
 * The provider's day — one screen, whatever they sell.
 *
 * There were three: a delivery run for food that could only mark a meal
 * delivered or failed, a bookings-and-reports page for cleaning, and a court
 * grid for the beach. They answered the same question in three vocabularies,
 * and whichever one you learned did not transfer.
 *
 * This reads `service_occurrences`, so a visit, a delivery and a booked hour
 * are rows in one list. What differs between them is which columns carry
 * meaning, not which screen you are on: a delivery shows its meal, a visit
 * shows who is doing it.
 *
 * Everything goes through NestJS. The table is service-role only — it holds
 * home addresses and access instructions — and the writes still land on the
 * legacy row where one exists, so this screen and the older ones cannot drift.
 */

interface Occurrence {
  id: string;
  source_service_key: string | null;
  source_record_id: string | null;
  item_key: string | null;
  starts_at: string;
  status: string;
  status_reason: string | null;
  assignee: string | null;
  notes: string | null;
  access_instructions: string | null;
  completion: { photo_url?: string | null; issue?: string | null; completed_by?: string | null } | null;
  slot_id: string | null;
  /** Who the work is for. Resolved by the API from the row's user id. */
  customer_name?: string | null;
  customer_email?: string | null;
}

const STATUS_META: Record<string, { label: string; tint: string }> = {
  scheduled: { label: "Scheduled", tint: "bg-muted text-muted-foreground" },
  done:      { label: "Done",      tint: "bg-emerald-500/15 text-emerald-500" },
  failed:    { label: "Failed",    tint: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Cancelled", tint: "bg-muted text-muted-foreground" },
  rescheduled: { label: "Moved",   tint: "bg-amber-500/15 text-amber-500" },
};


const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function OperationsTab({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const KEY = ["provider-occurrences", providerId] as const;

  const [day, setDay] = useState(todayHN());
  // What this provider calls the things it delivers in a day. A key with no
  // row shows itself, which is what the beach's court names rely on.
  const { items } = useProviderItems(providerId);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [failing, setFailing] = useState<Occurrence | null>(null);
  const [reason, setReason] = useState("");
  const [moving, setMoving] = useState<Occurrence | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [removing, setRemoving] = useState<Occurrence | null>(null);

  // A day at a time, in Honduras time — the same boundary every other figure
  // on the platform uses.
  const { from, to } = useMemo(() => ({
    from: `${day}T00:00:00-06:00`,
    to:   `${day}T23:59:59-06:00`,
  }), [day]);

  const { data: rows = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: [...KEY, day, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const { data, error } = await accountApi(
        `/account/providers/${providerId}/occurrences?${params.toString()}`,
      );
      if (error) throw new Error(String(error));
      return (Array.isArray(data) ? data : []) as Occurrence[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });

  const setStatus = useMutation({
    mutationFn: async ({ id, status, why }: { id: string; status: string; why?: string }) => {
      const { error } = await accountApi(`/account/occurrences/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason: why ?? null }),
      });
      if (error) throw new Error(String(error));
    },
    onSuccess: () => { invalidate(); setFailing(null); setReason(""); },
    onError: (e: any) => toast.error(e?.message || "Couldn't update it"),
  });

  /**
   * Take a row off the list for good.
   *
   * The server cancels whatever it holds before deleting it, so removing a
   * court booking actually frees the hour rather than leaving it held by a
   * row nobody can see any more. For something that genuinely did not happen,
   * Failed is the right button — it stays on the record.
   */
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await accountApi(`/account/occurrences/${id}`, { method: "DELETE" });
      if (error) throw new Error(String(error));
    },
    onSuccess: () => { toast.success("Removed"); invalidate(); setRemoving(null); },
    onError: (e: Error) => toast.error(e.message || "Could not remove it"),
  });

  const reschedule = useMutation({
    mutationFn: async ({ id, startsAt }: { id: string; startsAt: string }) => {
      const { error } = await accountApi(`/account/occurrences/${id}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ startsAt }),
      });
      if (error) throw new Error(String(error));
    },
    onSuccess: () => { toast.success("Moved"); invalidate(); setMoving(null); setMoveTo(""); },
    onError: (e: any) => toast.error(e?.message || "Couldn't move it"),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await accountApi(
        `/account/providers/${providerId}/occurrences/generate`, { method: "POST" },
      );
      if (error) throw new Error(String(error));
      return data as { created: number };
    },
    onSuccess: (d) => {
      toast.success(d?.created ? `Scheduled ${d.created} more` : "Everything ahead is already scheduled");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't schedule ahead"),
  });

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: rows.filter((r) => r.status !== "cancelled").length };
    rows.forEach((r) => { out[r.status] = (out[r.status] ?? 0) + 1; });
    return out;
  }, [rows]);

  /**
   * What the day's list shows.
   *
   * "All" means everything that still stands. A cancelled booking is not work
   * — the club showed one at 9am today, offered to mark it Done, and left the
   * owner wondering whether somebody was coming. It keeps its own chip, so
   * nothing is hidden from whoever goes looking.
   */
  const visible = useMemo(
    () => (statusFilter === "all" ? rows.filter((r) => r.status !== "cancelled") : rows),
    [rows, statusFilter],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold leading-[26px] text-foreground">Today's work</h2>
          <p className="mt-1 text-[16px] leading-[22px] text-muted-foreground">
            Every visit, delivery and booking for this day — mark it or move it.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-[14px] text-muted-foreground">Day</Label>
            <div className="mt-1 flex items-center gap-2">
       <Input inputSize="sm" type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-[170px]" />
              {day !== todayHN() && (
                <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground"
                  onClick={() => setDay(todayHN())}>Today</Button>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full"
            disabled={generate.isPending} onClick={() => generate.mutate()}>
            <CalendarClock className="h-4 w-4" />
            {generate.isPending ? "Scheduling…" : "Schedule ahead"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "scheduled", "done", "failed", ...(counts.cancelled ? ["cancelled"] as const : [])] as const).map((key) => (
          <button key={key} type="button" onClick={() => setStatusFilter(key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
              statusFilter === key ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:text-foreground",
            )}>
            {key === "all" ? "All" : STATUS_META[key]?.label ?? key}
            {counts[key] ? <span className="ml-1.5 opacity-60">{counts[key]}</span> : null}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : isError ? (
        /* A failed read used to render as "nothing on this day", which is
           indistinguishable from a quiet day — a provider would go looking for
           work the screen had simply failed to fetch. */
        <div className="space-y-3 rounded-radius-lg bg-destructive/10 p-6 text-center">
          <p className="text-sm font-semibold text-destructive">Couldn't load this day</p>
          <p className="text-xs text-muted-foreground">
            {(error as Error)?.message || "The day's work could not be read."}
          </p>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-radius-lg bg-card p-8 text-center">
          <p className="text-[16px] leading-[22px] text-muted-foreground">
            Nothing on this day. If work should be here, use <b>Schedule ahead</b> — deliveries are
            planned in advance rather than appearing when they are marked.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.scheduled;
            return (
              <li key={r.id} className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[16px] font-semibold tracking-[-0.32px] text-foreground">
                      <span className="tabular-nums">{timeOf(r.starts_at)}</span>
                      {/* Whose it is. The one question the person doing the
                          work asks, and the only one this screen could not
                          answer — it sent them to the customer list to match
                          by time. */}
                      {r.customer_name && <span>{r.customer_name}</span>}
                      {r.item_key && (
                        <span className="rounded-full bg-inset px-2 py-0.5 text-[12px] font-medium">
                          {itemLabel(r.item_key, items)}
                        </span>
                      )}
                      <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold", meta.tint)}>
                        {meta.label}
                      </span>
                    </p>
                    {r.customer_email && (
                      <p className="mt-0.5 text-[12px] tracking-[-0.24px] text-muted-foreground">
                        {r.customer_email}
                      </p>
                    )}
                    {(r.notes || r.status_reason || r.access_instructions) && (
                      <p className="mt-1 text-[12px] tracking-[-0.24px] text-muted-foreground">
                        {[r.status_reason, r.notes, r.access_instructions].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* A cancelled booking is not something anybody finishes:
                        the only move left is putting it back. */}
                    {r.status !== "done" && r.status !== "cancelled" && (
                      <Button size="sm" className="gap-1.5 rounded-full"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: r.id, status: "done" })}>
                        <CheckCircle2 className="h-4 w-4" /> Done
                      </Button>
                    )}
                    {r.status !== "failed" && r.status !== "cancelled" && (
                      <Button size="sm" variant="outline" className="gap-1.5 rounded-full"
                        onClick={() => { setFailing(r); setReason(""); }}>
                        <XCircle className="h-4 w-4" /> Failed
                      </Button>
                    )}
                    {r.status !== "scheduled" && (
                      <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground"
                        onClick={() => setStatus.mutate({ id: r.id, status: "scheduled" })}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                    {/* A visit holds a booked slot; moving it has to release
                        that slot, which is the booking screen's job. */}
                    {!r.slot_id && (
                      <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground"
                        onClick={() => { setMoving(r); setMoveTo(r.starts_at.slice(0, 10)); }}>
                        Move
                      </Button>
                    )}
                    <Button size="sm" variant="ghost"
                      className="h-8 w-8 rounded-full p-0 text-muted-foreground hover:text-destructive"
                      aria-label="Remove"
                      onClick={() => setRemoving(r)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ResponsiveDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Remove this?">
        <div className="space-y-3 pb-2">
          <p className="text-[16px] leading-[22px] text-muted-foreground">
            {removing?.customer_name || removing?.item_key
              ? <>It disappears from the day and whatever it was holding — a court, a slot — is freed.</>
              : <>It disappears from the day.</>}
          </p>
          <p className="text-xs text-muted-foreground">
            For something that was supposed to happen and didn't, use Failed instead — that stays on
            the record with its reason.
          </p>
          <Button variant="destructive" className="w-full"
            disabled={remove.isPending}
            onClick={() => removing && remove.mutate(removing.id)}>
            {remove.isPending ? "Removing…" : "Remove"}
          </Button>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog open={!!failing} onOpenChange={(o) => !o && setFailing(null)} title="What went wrong?">
        <div className="space-y-3 pb-2">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            placeholder="Nobody home · address wrong · kitchen delay" />
          <p className="text-xs text-muted-foreground">
            The reason is kept on the day's record, so a pattern is visible later.
          </p>
          <Button className="w-full" disabled={setStatus.isPending}
            onClick={() => failing && setStatus.mutate({ id: failing.id, status: "failed", why: reason.trim() || undefined })}>
            {setStatus.isPending ? "Saving…" : "Mark failed"}
          </Button>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)} title="Move it to">
        <div className="space-y-3 pb-2">
          <Input type="date" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} />
          <Button className="w-full" disabled={reschedule.isPending || !moveTo}
            onClick={() => moving && reschedule.mutate({
              id: moving.id,
              // Keep the time of day it already had; only the date moves.
              startsAt: new Date(`${moveTo}T${moving.starts_at.slice(11, 19)}Z`).toISOString(),
            })}>
            {reschedule.isPending ? "Moving…" : "Move"}
          </Button>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
