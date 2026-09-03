import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { StatusPill } from "@/components/patterns/StatusPill";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { approvePayment, isPendingPayment } from "@/lib/subscriptionApprove";
import { formatUSD } from "@/lib/pricing";
import { formatDateHN } from "@/lib/timezone";
import { subscriberSourceFor, type SubscriberRow } from "@/services/subscribers";
import { WorkspaceCard, WorkspaceEmpty, WorkspaceSection } from "@/components/provider/WorkspaceUI";
import { CustomerPhone } from "@/components/patterns/CustomerPhone";
import { SaleOriginBadge } from "@/components/patterns/SaleOrigin";
import { todayHN, addDaysISO, addMonthsISO } from "@/lib/timezone";
import { MoreHorizontal, PauseCircle, PlayCircle, RefreshCcw, XCircle } from "lucide-react";
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
  const KEY = ["provider-subscribers", providerId, legacyId ?? "", sourceKey] as const;
  const shape = subscriberSourceFor(sourceKey);

  const { data: rows = [], isLoading } = useQuery({
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
   * Three groups, because an owner reads this list with three questions: who
   * is running, whose period is about to lapse, and who is over. A flat list
   * hides the middle one, which is the only group that needs acting on.
   */
  const groups = useMemo(() => {
    const soon = addDaysISO(todayHN(), 7);
    const running: SubscriberRow[] = [];
    const ending: SubscriberRow[] = [];
    const past: SubscriberRow[] = [];
    for (const r of filtered) {
      if (r.status !== "active") { past.push(r); continue; }
      const end = (r.end ?? "").slice(0, 10);
      (end && end <= soon ? ending : running).push(r);
    }
    return [
      { key: "ending", label: "Ending within a week", rows: ending },
      { key: "active", label: "Active", rows: running },
      { key: "past", label: "Past", rows: past },
    ].filter((g) => g.rows.length);
  }, [filtered]);

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

  return (
    <div className="space-y-1">
      <WorkspaceSection
        title="Subscribers"
        subtitle={`${rows.length} in total · ${rows.filter((r) => r.status === "active").length} active`}
        action={
          <div className="relative w-[200px] shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="h-9 pl-9"
            />
          </div>
        }
      />

      {filtered.length === 0 ? (
        <WorkspaceCard>
          <WorkspaceEmpty>
            {rows.length === 0 ? "Nobody has subscribed yet." : "Nobody matches that."}
          </WorkspaceEmpty>
        </WorkspaceCard>
      ) : (
        groups.flatMap((g) => [
          <p key={g.key} className="px-1 pt-3 text-[14px] font-semibold uppercase tracking-wide text-muted-foreground">
            {g.label} · {g.rows.length}
          </p>,
          ...g.rows.map((r) => (
          <article key={r.id} className="flex items-center gap-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[16px] font-semibold leading-[22px] text-foreground">
                  {r.customerName || r.customerEmail || "Customer"}
                </span>
                <StatusPill status={r.status} />
                <SaleOriginBadge paymentReference={r.paymentReference ?? null} />
                {isPendingPayment({ payment_status: r.paymentStatus }) && (
                  <Button size="sm" variant="outline" className="h-7 rounded-full px-3 text-[12px]"
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
                <p className="mt-0.5 text-[14px] leading-[18px] text-muted-foreground">{r.detail}</p>
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
                  <DropdownMenuItem className="text-destructive" onClick={() => setStatus(r, "cancelled")}>
                    <XCircle className="mr-2 h-4 w-4" /> Cancel
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </article>
          )),
        ])
      )}
    </div>
  );
}
