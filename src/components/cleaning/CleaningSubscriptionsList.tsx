import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, MoreHorizontal, PauseCircle, PlayCircle, XCircle, RefreshCcw } from "lucide-react";
import { format, isBefore } from "date-fns";
import { supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/ui/spinner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TabEmptyState, SectionGroup } from "@/components/subscriptions/MySubsPrimitives";
import { formatUSD } from "@/lib/pricing";
import { effectiveCleaningStatus } from "@/lib/subscriptionLifecycle";
import { todayHN, addDaysISO, addMonthsISO } from "@/lib/timezone";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Compact owner-facing subscriptions list for the cleaning provider workspace.
 * Replaces the full admin `Subscriptions.tsx` page (server-paginated, huge
 * filter bar, create-with-reservations wizard) with a scannable list grouped
 * by lifecycle: Active · Expiring soon · Past. Pause / Resume / Cancel via
 * the standard ⋯ menu.
 *
 * The rich admin page still lives at `/admin/subscriptions` for platform
 * admins; this component is what the *owner* sees.
 */
export function CleaningSubscriptionsList({ providerId }: { providerId: string }) {
  const qc = useQueryClient();

  // Fetch subs whose package belongs to this provider — cleaning packages
  // live in `cleaning_packages` and hang off the legacy provider row.
  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["provider-cleaning-subs", providerId],
    queryFn: async () => {
      const { data: pkgs } = await supabaseDb
        .from("cleaning_packages")
        .select("id,name")
        .eq("provider_id", providerId);
      const pkgMap = new Map((pkgs ?? []).map((p: any) => [p.id, p.name]));
      const pkgIds = Array.from(pkgMap.keys());
      if (!pkgIds.length) return [];
      const { data } = await supabaseDb
        .from("cleaning_subscriptions")
        .select("id,package_id,user_id,subscription_status,payment_status,monthly_price_cents,total_price_cents,billing_period_months,service_start_date,service_end_date,paid_until,end_date,apartment_note,cleaner_hint")
        .in("package_id", pkgIds)
        .order("service_start_date", { ascending: false });
      return (data ?? []).map((s: any) => ({
        ...s,
        package_name: pkgMap.get(s.package_id) ?? "Cleaning plan",
      }));
    },
  });

  // Look up display names for the customers who own these subs.
  const userIds = useMemo(() => Array.from(new Set(subs.map((s: any) => s.user_id).filter(Boolean))), [subs]);
  const { data: userMap = {} } = useQuery({
    queryKey: ["provider-cleaning-sub-users", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("users")
        .select("id,email,name,display_name")
        .in("id", userIds);
      const map: Record<string, { display_name?: string | null; name?: string | null; email?: string | null }> = {};
      (data ?? []).forEach((u: any) => { map[u.id] = u; });
      return map;
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: string }) => {
      const { error } = await supabaseDb
        .from("cleaning_subscriptions")
        .update({ subscription_status: next, is_active: next === "active" })
        .eq("id", id);
      if (error) throw error;
      // Cascade: cancelling a subscription must also cancel its future bookings —
      // otherwise the Google Calendar reconcile cron keeps them and the
      // Operations calendar still shows them as scheduled work. This is the same
      // behaviour the admin PATCH /admin/subscriptions/:id/cancel provides;
      // the owner path can't call admin endpoints, so we do the cascade here.
      if (next === "cancelled") {
        const today = todayHN();
        // Only booked (not-yet-happened) rows are affected — completed ones stay.
        const { data: futureBookings } = await supabaseDb
          .from("cleaning_bookings")
          .select("id, cleaning_available_slots!inner(date)")
          .eq("subscription_id", id)
          .eq("status", "booked")
          .gte("cleaning_available_slots.date", today);
        const ids = (futureBookings ?? []).map((b: any) => b.id);
        if (ids.length) {
          await supabaseDb.from("cleaning_bookings")
            .update({ status: "cancelled" })
            .in("id", ids);
        }
      }
    },
    onSuccess: () => {
      toast.success("Subscription updated");
      qc.invalidateQueries({ queryKey: ["provider-cleaning-subs", providerId] });
      // The KPI strip + Bookings calendar sit on the same page — invalidate so
      // Active/Upcoming counts and the calendar re-render without a full reload.
      qc.invalidateQueries({ queryKey: ["provider-analytics"] });
      qc.invalidateQueries({ queryKey: ["unified-bookings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Off-platform paid renewal — extend the sub continuously (next_start =
  // max(today, prev_end+1)) and mark it paid/manual. Mirrors the rich admin
  // Subscriptions page dialog so an owner isn't forced to jump to the admin
  // view for a common action.
  const renew = useMutation({
    mutationFn: async (sub: any) => {
      const months = Math.max(Number(sub.billing_period_months) || 1, 1);
      const today = todayHN();
      const prevEnd = (sub.paid_until || sub.service_end_date || sub.end_date || "").slice(0, 10);
      const nextStart = prevEnd && prevEnd >= today ? addDaysISO(prevEnd, 1) : today;
      const end = addMonthsISO(nextStart, months);
      const { error } = await supabaseDb
        .from("cleaning_subscriptions")
        .update({
          subscription_status: "active", is_active: true,
          payment_status: "paid", payment_method: "manual",
          service_start_date: nextStart, service_end_date: end,
          paid_until: end, end_date: end,
        })
        .eq("id", sub.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Renewed — payment recorded");
      qc.invalidateQueries({ queryKey: ["provider-cleaning-subs", providerId] });
      qc.invalidateQueries({ queryKey: ["provider-analytics"] });
      qc.invalidateQueries({ queryKey: ["unified-bookings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <PageLoader />;

  const today = new Date();
  const todayStr = todayHN();
  const groups = { active: [] as any[], expiring: [] as any[], past: [] as any[] };
  subs.forEach((s: any) => {
    // Use effective (end-date-aware) status so a DB-active row whose
    // service_end_date already passed lands in Past + renders as "expired"
    // without waiting for the daily cron sweep.
    const st = effectiveCleaningStatus(s, todayStr);
    const end = s.paid_until || s.service_end_date || s.end_date || null;
    const endDate = end ? new Date(`${end}T23:59:59`) : null;
    if (st === "active" && endDate) {
      const daysLeft = Math.round((endDate.getTime() - today.getTime()) / 86400_000);
      if (isBefore(endDate, today)) groups.past.push(s);
      else if (daysLeft <= 14) groups.expiring.push(s);
      else groups.active.push(s);
    } else if (st === "active") groups.active.push(s);
    else if (["cancelled", "expired"].includes(st)) groups.past.push(s);
    else groups.active.push(s);
  });

  if (!subs.length) {
    return (
      <TabEmptyState
        icon={Sparkles}
        title="No subscriptions yet"
        subtitle="When customers subscribe to one of your cleaning plans it will appear here."
      />
    );
  }

  const renderRow = (s: any) => {
    const user = userMap[s.user_id];
    const customer = user?.display_name ?? user?.name ?? user?.email ?? "Customer";
    const price = Number(s.total_price_cents || s.monthly_price_cents || 0);
    // Effective status for the badge + action gates. A paid-but-unpaid sub gets
    // an extra "Awaiting payment" chip so the owner isn't tricked into treating
    // it as revenue.
    const st = effectiveCleaningStatus(s, todayStr);
    const isPendingPayment = s.payment_status && s.payment_status !== "paid" && st !== "cancelled";
    const end = s.paid_until || s.service_end_date || s.end_date;
    const start = s.service_start_date;
    return (
      <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-card p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-foreground">{s.package_name}</p>
            <Badge className={cn("rounded-full text-[10px] capitalize", statusTone(st))}>{st}</Badge>
            {isPendingPayment && (
              <Badge className="rounded-full text-[10px] bg-amber-500/15 text-amber-500">Awaiting payment</Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {customer}
            {start && end && ` · ${format(new Date(`${start}T00:00:00`), "MMM d")} → ${format(new Date(`${end}T00:00:00`), "MMM d, yyyy")}`}
          </p>
          {(s.apartment_note || s.cleaner_hint) && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {s.apartment_note}
              {s.apartment_note && s.cleaner_hint && " · "}
              {s.cleaner_hint}
            </p>
          )}
        </div>
        {price > 0 && (
          <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
            {formatUSD(price)}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="iconSm" variant="ghost" aria-label="Actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {st === "active" && (
              <DropdownMenuItem onSelect={() => setStatus.mutate({ id: s.id, next: "paused" })}>
                <PauseCircle className="h-4 w-4" /> Pause
              </DropdownMenuItem>
            )}
            {st === "paused" && (
              <DropdownMenuItem onSelect={() => setStatus.mutate({ id: s.id, next: "active" })}>
                <PlayCircle className="h-4 w-4" /> Resume
              </DropdownMenuItem>
            )}
            {/* Renew is available on anything that's not cancelled — an active
                sub extends its end_date, an expired one comes back to life. */}
            {(st === "active" || st === "expired" || st === "paused") && (
              <DropdownMenuItem onSelect={() => renew.mutate(s)}>
                <RefreshCcw className="h-4 w-4" /> Renew (payment received)
              </DropdownMenuItem>
            )}
            {st !== "cancelled" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setStatus.mutate({ id: s.id, next: "cancelled" })}
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <XCircle className="h-4 w-4" /> Cancel
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {groups.active.length > 0 && (
        <SectionGroup label="Active" count={groups.active.length} tone="success">
          {groups.active.map(renderRow)}
        </SectionGroup>
      )}
      {groups.expiring.length > 0 && (
        <SectionGroup label="Expiring soon" count={groups.expiring.length} tone="warning">
          {groups.expiring.map(renderRow)}
        </SectionGroup>
      )}
      {groups.past.length > 0 && (
        <SectionGroup label="Past" count={groups.past.length}>
          {groups.past.map(renderRow)}
        </SectionGroup>
      )}
    </div>
  );
}

function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (["active"].includes(s)) return "bg-emerald-500/15 text-emerald-500";
  if (["paused", "pending", "pending_payment"].includes(s)) return "bg-amber-500/15 text-amber-500";
  if (["cancelled", "expired"].includes(s)) return "bg-destructive/15 text-destructive";
  return "bg-muted text-muted-foreground";
}
