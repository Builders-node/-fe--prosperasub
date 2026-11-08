import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { StatusPill, statusLabel as statusWord } from "@/components/patterns/StatusPill";
import { accountApi, supabaseDb } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { approvePayment, isPendingPayment } from "@/lib/subscriptionApprove";
import { formatUSD } from "@/lib/pricing";
import { formatDateHN } from "@/lib/timezone";
import {
  subscriberSourceFor, fetchDelivery, saveDelivery,
  type SubscriberRow, type SubscriberSource,
} from "@/services/subscribers";
import { DeliveryDialog } from "@/components/account/DeliveryDialog";
import { WorkspaceSection } from "@/components/provider/WorkspaceUI";
import { QueryError } from "@/components/patterns/QueryError";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { CustomerPhone } from "@/components/patterns/CustomerPhone";
import { SaleOriginBadge } from "@/components/patterns/SaleOrigin";
import { todayHN, addDaysISO, addMonthsISO } from "@/lib/timezone";
import { CalendarClock, CalendarPlus, MapPin, Megaphone, MoreHorizontal, PauseCircle, PlayCircle, RefreshCcw, XCircle } from "lucide-react";
import { NewCleaningBookingDialog } from "@/components/cleaning/NewCleaningBookingDialog";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Who is subscribed to this business.
 *
 * The three services answered this question with three different screens: two
 * compact card lists written for the workspace, and — for the beach club — a
 * whole admin page with a data table, its own search and its own pagination
 * mounted inside a tab. Same question, same tab, colossally different answer
 * depending on which business an admin happened to open.
 *
 * One list for all of them. What differs per service is where the rows are
 * and what its status column is called — a table below, not a screen.
 */

export function SubscribersList({ providerId, legacyId, sourceKey }: {
  /** Universal `providers.id` — where beach and universal rows hang. */
  providerId: string;
  /** Per-service id, for the services whose subscriptions still hang off it. */
  legacyId?: string;
  sourceKey: string;
}) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [q, setQ] = useState("");
  const [deliveryFor, setDeliveryFor] = useState<SubscriberRow | null>(null);
  const [datesFor, setDatesFor] = useState<SubscriberRow | null>(null);
  const [cancelFor, setCancelFor] = useState<SubscriberRow | null>(null);
  const [messaging, setMessaging] = useState(false);
  const KEY = ["provider-subscribers", providerId, legacyId ?? "", sourceKey] as const;
  const shape = subscriberSourceFor(sourceKey);

  const { data: rows = [], isLoading, isError, error: loadError, refetch, isFetching } = useQuery({
    queryKey: KEY,
    enabled: !!providerId,
    queryFn: () => shape.fetch({ providerId, legacyId: legacyId ?? providerId, sourceKey }),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.customerName, r.customerEmail, r.plan].some((v) => (v ?? "").toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  /**
   * A cleaning subscription that is paid and running with not one visit on the
   * books. Its status is `active`, not `pending_schedule`, so nothing flagged
   * it: the customer had paid, the period was starting, and the schedule was
   * empty — found only when they asked where the cleaner was.
   */
  const isCleaning = shape.table === "cleaning_subscriptions";
  const runningPaidIds = useMemo(
    () => rows.filter((r) => r.status === "active" && !isPendingPayment({ payment_status: r.paymentStatus })).map((r) => r.id),
    [rows],
  );
  const { data: withVisits } = useQuery({
    queryKey: [...KEY, "has-visits", runningPaidIds.join(",")],
    enabled: isCleaning && runningPaidIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("cleaning_bookings")
        .select("subscription_id")
        .in("subscription_id", runningPaidIds)
        .neq("status", "cancelled");
      if (error) throw error;
      return new Set((data ?? []).map((b: { subscription_id: string | null }) => String(b.subscription_id)));
    },
  });
  const needsTime = (r: SubscriberRow) =>
    isCleaning && !!withVisits && runningPaidIds.includes(r.id) && !withVisits.has(r.id);

  /**
   * Groups, because an owner reads this list with questions: who is waiting
   * for a time, who is running, whose period is about to lapse, and who is
   * over. A flat list hides the ones that need acting on.
   */
  const groups = useMemo(() => {
    const soon = addDaysISO(todayHN(), 7);
    const waiting: SubscriberRow[] = [];
    const running: SubscriberRow[] = [];
    const ending: SubscriberRow[] = [];
    const past: SubscriberRow[] = [];
    for (const r of filtered) {
      if (r.status !== "active") { past.push(r); continue; }
      if (needsTime(r)) { waiting.push(r); continue; }
      const end = (r.end ?? "").slice(0, 10);
      (end && end <= soon ? ending : running).push(r);
    }
    return [
      { key: "waiting", label: "Needs a visit scheduled", rows: waiting },
      { key: "ending", label: "Ending within a week", rows: ending },
      { key: "active", label: "Active", rows: running },
      { key: "past", label: "Past", rows: past },
    ].filter((g) => g.rows.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, withVisits]);

  const approve = async (row: SubscriberRow) => {
    try {
      await approvePayment(shape.approve, row.id, { adminUserId: userData?.id });
      toast.success("Marked as paid");
      qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      toast.error((e as Error).message || "Could not mark it paid");
    }
  };

  /**
   * Off-platform renewal: somebody paid outside the platform and the period
   * has to move. Continuous by construction — the next period starts the day
   * after the last one ended, or today if that is already past, so a late
   * renewal never silently backdates access.
   *
   * It was written twice, once per service, differing only in which columns
   * carry the period.
   */
  const renew = async (row: SubscriberRow) => {
    const today = todayHN();
    const prevEnd = (row.end ?? "").slice(0, 10);
    const start = prevEnd && prevEnd >= today ? addDaysISO(prevEnd, 1) : today;
    const length = Math.max(row.periodLength || 1, 1);

    const patch = shape.renewPatch(row, { start, length });

    const { error } = await supabaseDb.from(shape.table).update(patch).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Renewed — payment recorded",
      shape.renewNote ? { description: shape.renewNote } : undefined);
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ["provider-analytics"] });
    qc.invalidateQueries({ queryKey: ["unified-bookings"] });
  };

  /**
   * Pause, resume, cancel. The word for "running" is `active` in every one of
   * these tables; only the column it sits in differs, which is why this is one
   * function and not three screens.
   */
  /**
   * Cancelling is not a column write any more: the API tells the customer
   * (with the reason) and, if asked, sends EverySub a refund request. The
   * service's own clean-up (cleaning frees its booked slots) still runs here.
   */
  const cancelViaApi = async (row: SubscriberRow, reason: string, refund: boolean) => {
    const { error } = await accountApi(
      `/account/providers/${providerId}/subscriptions/${shape.table}/${row.id}/cancel`,
      { method: "POST", body: JSON.stringify({ reason, refund }) },
    );
    if (error) { toast.error((error as Error).message || "Could not cancel"); return false; }
    await shape.onCancelled?.(row.id);
    toast.success(refund ? "Cancelled — the customer was told, and EverySub got the refund request" : "Cancelled — the customer was told");
    qc.invalidateQueries({ queryKey: KEY });
    return true;
  };

  const setStatus = async (row: SubscriberRow, next: "active" | "paused" | "cancelled") => {
    const patch: Record<string, unknown> = {
      [shape.statusColumn]: next,
      updated_at: new Date().toISOString(),
    };
    Object.assign(patch, shape.statusPatch?.(next) ?? {});

    const { error } = await supabaseDb.from(shape.table).update(patch).eq("id", row.id);
    if (error) { toast.error(error.message); return; }

    // Whatever else a cancellation means for this service — cleaning has to
    // cancel the visits it booked, or those slots stay full for ever.
    if (next === "cancelled") await shape.onCancelled?.(row.id);
    toast.success(next === "cancelled" ? "Cancelled" : next === "paused" ? "Paused" : "Resumed");
    qc.invalidateQueries({ queryKey: KEY });
  };

  if (isLoading) return <PageLoader />;
  // "0 in total" over an empty list would read as a business nobody buys from.
  if (isError) {
    return (
      <QueryError
        title="Couldn't load your subscribers"
        error={loadError}
        onRetry={() => refetch()}
        retrying={isFetching}
      />
    );
  }

  return (
    <div className="space-y-1">
      <WorkspaceSection
        title="Subscribers"
        subtitle={`${rows.length} in total · ${rows.filter((r) => r.status === "active").length} active`}
        action={
          <div className="flex shrink-0 items-center gap-2">
          {rows.some((r) => r.status === "active") && (
            <Button size="sm" variant="secondary" className="gap-2" onClick={() => setMessaging(true)}>
              <Megaphone /> <span className="hidden sm:inline">Message all</span>
            </Button>
          )}
          <div className="relative w-[160px] shrink-0 sm:w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="pl-9"
              inputSize="sm"
            />
          </div>
          </div>
        }
      />

      {filtered.length === 0 ? (
        rows.length === 0 ? (
          <YdEmptyState
            icon={Users}
            title="Nobody has subscribed yet"
            subtitle="Customers appear here as soon as they buy one of your plans."
          />
        ) : (
          <YdEmptyState
            icon={Search}
            title="Nobody matches that"
            subtitle="Try a different name, email or plan."
            action={
              <Button variant="secondary" onClick={() => setQ("")}>
                Clear search
              </Button>
            }
          />
        )
      ) : (
        groups.flatMap((g) => [
          <p key={g.key} className="px-1 pt-3 text-[14px] font-semibold uppercase tracking-wide text-muted-foreground">
            {g.label} · {g.rows.length}
          </p>,
          ...g.rows.map((r) => {
          const past = g.key === "past";
          return (
          <article key={r.id} className="flex items-center gap-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[16px] font-semibold leading-[22px] text-foreground">
                  {/* An account with no name still has a way to be called. */}
                  {r.customerName || r.customerEmail || r.phone || "Customer"}
                </span>
                {/* Past rows say how it ended in grey: they are history, and a
                    column of red EXPIRED read as a list of problems. */}
                {past
                  ? <span className="text-meta text-muted-foreground">{statusWord(r.status)}</span>
                  : g.key === "waiting"
                    ? <StatusPill status="pending_schedule" />
                    : <StatusPill status={r.status} />}
                <SaleOriginBadge paymentReference={r.paymentReference ?? null} />
                {isPendingPayment({ payment_status: r.paymentStatus }) && (
                  <Button size="sm" variant="outline" className="px-3"
                    onClick={() => approve(r)}>
                    Mark paid
                  </Button>
                )}
              </div>
              <p className="mt-0.5 text-[14px] leading-[18px] text-muted-foreground">
                {r.plan}
                {r.start && r.end && ` · ${formatDateHN(r.start)} → ${formatDateHN(r.end)}`}
              </p>
              {r.phone && <CustomerPhone phone={r.phone} className="mt-0.5" />}
              {r.detail && (
                <p className="mt-0.5 flex items-center gap-1 text-[14px] leading-[18px] text-muted-foreground">
                  {/* What the service calls the place (apartment, address)
                      — a bare "207" said nothing. */}
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{r.detail}</span>
                </p>
              )}
              {g.key === "waiting" && legacyId && (
                <div className="mt-2">
                  <NewCleaningBookingDialog
                    providerId={legacyId}
                    defaultSubscriptionId={r.id}
                    trigger={
                      <Button size="sm" className="gap-1.5">
                        <CalendarPlus className="h-4 w-4" /> Schedule visits
                      </Button>
                    }
                  />
                </div>
              )}
            </div>
            <span className="shrink-0 text-right">
              <span className="block text-[16px] font-semibold tabular-nums text-foreground">
                {formatUSD(r.amountCents)}
              </span>
              {/* Renewals, said once: the period above, the relationship here. */}
              {(r.periodsPaid ?? 1) > 1 && (
                <span className="block text-[12px] leading-[16px] tabular-nums text-muted-foreground">
                  ×{r.periodsPaid} · {formatUSD(r.lifetimeCents ?? r.amountCents * (r.periodsPaid ?? 1))} total
                </span>
              )}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0" aria-label="Actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* Where it goes and who to reach. Shown first: a customer
                    who moved is the change an owner makes most, and until now
                    the only way to make it was to cancel and re-sell. */}
                {shape.deliveryFields?.length ? (
                  <DropdownMenuItem onClick={() => setDeliveryFor(r)}>
                    <MapPin className="mr-2 h-4 w-4" /> Edit {(shape.deliveryLabel ?? "delivery").toLowerCase()}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => setDatesFor(r)}>
                  <CalendarClock className="mr-2 h-4 w-4" /> Change dates
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => renew(r)}>
                  <RefreshCcw className="mr-2 h-4 w-4" /> Renew — paid off platform
                </DropdownMenuItem>
                {r.status === "active" && (
                  <DropdownMenuItem onClick={() => setStatus(r, "paused")}>
                    <PauseCircle className="mr-2 h-4 w-4" /> Pause
                  </DropdownMenuItem>
                )}
                {r.status === "paused" && (
                  <DropdownMenuItem onClick={() => setStatus(r, "active")}>
                    <PlayCircle className="mr-2 h-4 w-4" /> Resume
                  </DropdownMenuItem>
                )}
                {r.status !== "cancelled" && (
                  <DropdownMenuItem className="text-destructive" onClick={() => setCancelFor(r)}>
                    <XCircle className="mr-2 h-4 w-4" /> Cancel
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </article>
          );
          }),
        ])
      )}

      <DatesDialog
        row={datesFor}
        shape={shape}
        onClose={() => setDatesFor(null)}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: KEY });
          qc.invalidateQueries({ queryKey: ["provider-analytics"] });
          qc.invalidateQueries({ queryKey: ["unified-bookings"] });
          setDatesFor(null);
        }}
      />

      <DeliveryDialog
        open={!!deliveryFor}
        shape={shape}
        subscriptionId={deliveryFor?.id ?? null}
        title={deliveryFor ? (deliveryFor.customerName || deliveryFor.customerEmail || "Customer") : null}
        onClose={() => setDeliveryFor(null)}
        onSaved={() => { void qc.invalidateQueries({ queryKey: KEY }); setDeliveryFor(null); }}
      />
      <CancelDialog row={cancelFor} onClose={() => setCancelFor(null)} onConfirm={cancelViaApi} />
      <BroadcastDialog
        open={messaging}
        providerId={providerId}
        activeCount={rows.filter((r) => r.status === "active").length}
        onClose={() => setMessaging(false)}
      />
    </div>
  );
}

/** Why, and whether EverySub should refund — the customer is told either way. */
function CancelDialog({ row, onClose, onConfirm }: {
  row: SubscriberRow | null;
  onClose: () => void;
  onConfirm: (row: SubscriberRow, reason: string, refund: boolean) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (row) { setReason(""); setRefund(false); } }, [row]);
  const paid = String(row?.paymentStatus ?? "").toLowerCase() === "paid";
  return (
    <ResponsiveDialog
      open={!!row}
      onOpenChange={(o) => !o && onClose()}
      title="Cancel this subscription?"
      description={row ? `${row.customerName || row.customerEmail || "The customer"} · ${row.plan}` : undefined}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Keep it</Button>
          <Button variant="destructive" loading={busy} onClick={async () => {
            if (!row) return;
            setBusy(true);
            const ok = await onConfirm(row, reason.trim(), paid && refund);
            setBusy(false);
            if (ok) onClose();
          }}>Cancel subscription</Button>
        </div>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="cancel-reason">Reason (the customer sees it)</Label>
        <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
          placeholder="We are closed for renovation until March…" />
      </div>
      {paid && (
        <label className="flex items-start gap-3 rounded-radius-md bg-inset p-3">
          <input type="checkbox" className="mt-1" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
          <span className="min-w-0">
            <span className="block text-body font-semibold text-foreground">Ask EverySub to refund the customer</span>
            <span className="block text-meta text-muted-foreground">
              Refunds move money, so EverySub makes them. The refunded amount comes off your earnings.
            </span>
          </span>
        </label>
      )}
      <p className="text-meta text-muted-foreground">The customer gets an email and a notification.</p>
    </ResponsiveDialog>
  );
}

/** One message to every active subscriber — email and in-app, once a day. */
function BroadcastDialog({ open, providerId, activeCount, onClose }: {
  open: boolean; providerId: string; activeCount: number; onClose: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    const { data, error } = await accountApi(`/account/providers/${providerId}/broadcast`, {
      method: "POST", body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
    });
    setBusy(false);
    if (error) { toast.error((error as Error).message || "Could not send"); return; }
    const r = data as { recipients?: number } | null;
    toast.success(`Sent to ${r?.recipients ?? activeCount} subscriber${(r?.recipients ?? activeCount) === 1 ? "" : "s"}`);
    setSubject(""); setMessage("");
    onClose();
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Message your subscribers"
      description={`Goes to ${activeCount} active subscriber${activeCount === 1 ? "" : "s"} by email and in the app. One message a day.`}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={subject.trim().length < 3 || message.trim().length < 10} onClick={() => void send()}>
            Send
          </Button>
        </div>
      }
    >
      <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Holiday schedule" maxLength={120} />
      <div className="space-y-1.5">
        <Label htmlFor="bc-msg">Message</Label>
        <Textarea id="bc-msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={2000}
          placeholder="No deliveries on December 25 — your plan is extended by one day." />
      </div>
    </ResponsiveDialog>
  );
}

/**
 * Change where a subscription goes.
 *
 * Renders whatever the service declared in `deliveryFields` — an address and a
 * WhatsApp number for every one of them, plus the residence and the name on
 * the order for food, plus access notes for cleaning. Nothing here knows which
 * vertical it is looking at, which is the point: a new service that names its
 * columns gets this form for free.
 */

/**
 * Move a subscription's current period — a customer who started late, or a
 * date typed wrong at sale. Changing the start shifts the end by the same
 * length, so the customer keeps exactly what they paid for; the end can still
 * be set by hand. Price and payment are not touched.
 */
function DatesDialog({ row, shape, onClose, onSaved }: {
  row: SubscriberRow | null;
  shape: SubscriberSource;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);

  const origStart = (row?.start ?? "").slice(0, 10);
  const origEnd = (row?.end ?? "").slice(0, 10);
  const lengthDays = origStart && origEnd
    ? Math.max(1, Math.round((Date.parse(`${origEnd}T00:00:00Z`) - Date.parse(`${origStart}T00:00:00Z`)) / 86_400_000))
    : 7;

  useEffect(() => {
    setStart(origStart || todayHN());
    setEnd(origEnd || addDaysISO(origStart || todayHN(), lengthDays));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id]);

  const onStart = (v: string) => {
    setStart(v);
    if (v) setEnd(addDaysISO(v, lengthDays));
  };

  const invalid = !start || !end || end < start;

  const save = async () => {
    if (!row || invalid) return;
    setSaving(true);
    const { error } = await supabaseDb.from(shape.table).update(shape.datesPatch({ start, end })).eq("id", row.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Dates updated", shape.datesNote ? { description: shape.datesNote } : undefined);
    onSaved();
  };

  return (
    <ResponsiveDialog
      open={!!row}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={row ? `Dates · ${row.customerName || row.customerEmail || "Customer"}` : "Dates"}
    >
      <div className="space-y-4 pb-2">
        <div className="space-y-1.5">
          <Label htmlFor="sub-start">Starts</Label>
          <Input id="sub-start" type="date" value={start} onChange={(e) => onStart(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sub-end">Ends</Label>
          <Input id="sub-end" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          <p className="text-[13px] text-muted-foreground">
            Moves with the start so the length stays {lengthDays} day{lengthDays === 1 ? "" : "s"}. Price and payment don't change.
          </p>
        </div>
        {shape.datesNote && <p className="text-[13px] text-muted-foreground">{shape.datesNote}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={invalid || saving}>{saving ? "Saving…" : "Save dates"}</Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
