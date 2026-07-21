import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UtensilsCrossed, MoreHorizontal, PauseCircle, PlayCircle, XCircle, RefreshCcw, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { approvePayment, isPendingPayment } from "@/lib/subscriptionApprove";
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
import { effectiveFoodStatus } from "@/lib/subscriptionLifecycle";
import { todayHN, addDaysISO } from "@/lib/timezone";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Compact owner-facing subscriptions list for the Food (Restaurant) provider
 * workspace. Same visual grammar as CleaningSubscriptionsList (grouped by
 * lifecycle, ⋯ menu actions, one row per subscription) so a provider switching
 * between the two services doesn't have to re-learn the surface.
 *
 * The full admin subscription editor still lives at /admin/marketplace/subscriptions —
 * this component is what the *owner* sees under Bookings → By customer.
 */
export function FoodSubscriptionsList({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const { userData } = useAuth();

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["provider-food-subs", providerId],
    queryFn: async () => {
      // Meal-plan lookup so each subscription row can carry a human plan name
      // without an extra per-row query.
      const { data: plans } = await supabaseDb
        .from("food_meal_plans").select("id,name").eq("provider_id", providerId);
      const planMap = new Map((plans ?? []).map((p: any) => [p.id, p.name]));

      const { data } = await supabaseDb
        .from("food_subscriptions")
        .select("id,user_id,customer_name,meal_plan_id,status,payment_status,started_at,end_date,commitment_weeks,weekly_price_cents,delivery_address")
        .eq("provider_id", providerId)
        .order("started_at", { ascending: false });
      const today = new Date().toISOString().slice(0, 10);
      return (data ?? []).map((s: any) => ({
        ...s,
        // Derive effective status the same way the rest of the app does — the
        // daily cron lags by up to 24h, so end_date is the source of truth.
        status: effectiveFoodStatus(s, today),
        plan_name: s.meal_plan_id ? planMap.get(s.meal_plan_id) ?? "Meal plan" : "Meal plan",
      }));
    },
  });

  const userIds = useMemo(
    () => Array.from(new Set(subs.map((s: any) => s.user_id).filter(Boolean))),
    [subs],
  );
  const { data: userMap = {} } = useQuery({
    queryKey: ["provider-food-sub-users", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("users").select("id,email,name,display_name").in("id", userIds);
      const map: Record<string, { display_name?: string | null; name?: string | null; email?: string | null }> = {};
      (data ?? []).forEach((u: any) => { map[u.id] = u; });
      return map;
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: string }) => {
      const patch: Record<string, unknown> = { status: next, updated_at: new Date().toISOString() };
      if (next === "paused") patch.paused_at = new Date().toISOString().slice(0, 10);
      if (next === "cancelled") patch.cancelled_at = new Date().toISOString().slice(0, 10);
      if (next === "active") patch.paused_at = null;
      const { error } = await supabaseDb.from("food_subscriptions").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Subscription updated");
      qc.invalidateQueries({ queryKey: ["provider-food-subs", providerId] });
      // The KPI strip + Bookings calendar sit on the same page — invalidate so
      // Active/Upcoming counts and the calendar re-render without a full reload.
      qc.invalidateQueries({ queryKey: ["provider-analytics"] });
      qc.invalidateQueries({ queryKey: ["unified-bookings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Mark payment received without touching end_date — for cash / off-platform
  // captures the owner recorded manually. Renew (below) is separate.
  const approve = useMutation({
    mutationFn: async (sub: any) => {
      await approvePayment("food", sub.id, { adminUserId: userData?.id });
    },
    onSuccess: () => {
      toast.success("Payment approved");
      qc.invalidateQueries({ queryKey: ["provider-food-subs", providerId] });
      qc.invalidateQueries({ queryKey: ["provider-analytics"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Off-platform paid renewal for a food sub — mirrors RestaurantSubscriptionsTab.
  // Extends continuously (next_start = max(today, prev_end+1)), commits N more
  // weeks, marks paid/manual, bumps periods_paid so revenue math stays honest.
  const renew = useMutation({
    mutationFn: async (sub: any) => {
      const weeks = Math.max(Number(sub.commitment_weeks) || 1, 1);
      const today = todayHN();
      const prevEnd = (sub.end_date || "").slice(0, 10);
      const nextStart = prevEnd && prevEnd >= today ? addDaysISO(prevEnd, 1) : today;
      const nextEnd = addDaysISO(nextStart, weeks * 7);
      const { error } = await supabaseDb
        .from("food_subscriptions")
        .update({
          status: "active", paused_at: null, cancelled_at: null,
          started_at: nextStart, end_date: nextEnd,
          payment_status: "paid", payment_method: "manual",
          periods_paid: (Number(sub.periods_paid) || 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Renewed — payment recorded");
      qc.invalidateQueries({ queryKey: ["provider-food-subs", providerId] });
      qc.invalidateQueries({ queryKey: ["provider-analytics"] });
      qc.invalidateQueries({ queryKey: ["unified-bookings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <PageLoader />;

  const today = new Date();
  const groups = { active: [] as any[], expiring: [] as any[], past: [] as any[] };
  subs.forEach((s: any) => {
    const st = String(s.status || "").toLowerCase();
    const endDate = s.end_date ? new Date(`${s.end_date}T23:59:59`) : null;
    if (st === "active" && endDate) {
      const daysLeft = Math.round((endDate.getTime() - today.getTime()) / 86400_000);
      if (isBefore(endDate, today)) groups.past.push(s);
      else if (daysLeft <= 14) groups.expiring.push(s);
      else groups.active.push(s);
    } else if (st === "active" || st === "paused" || st === "pending") {
      // Paused / pending sit under "Active" so an owner can find them without
      // hunting through Past — same behaviour as CleaningSubscriptionsList.
      groups.active.push(s);
    } else if (["cancelled", "expired"].includes(st)) {
      groups.past.push(s);
    } else {
      groups.active.push(s);
    }
  });

  if (!subs.length) {
    return (
      <TabEmptyState
        icon={UtensilsCrossed}
        title="No subscriptions yet"
        subtitle="When customers subscribe to one of your meal plans it will appear here."
      />
    );
  }

  const renderRow = (s: any) => {
    const user = userMap[s.user_id];
    const customer = user?.display_name ?? user?.name ?? s.customer_name ?? user?.email ?? "Customer";
    const period = Math.max(Number(s.commitment_weeks) || 1, 1);
    const totalCents = Number(s.weekly_price_cents || 0) * period;
    const st = String(s.status || "").toLowerCase();
    // A row can be status='active' but payment_status='pending' (e.g. Infinita
    // paid, awaiting reconcile). Surface it so owners don't think it's revenue.
    const isPendingPayment = s.payment_status && s.payment_status !== "paid" && st !== "cancelled";
    return (
      <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-card p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-foreground">{s.plan_name}</p>
            <Badge className={cn("rounded-full text-[10px] capitalize", statusTone(st))}>{st}</Badge>
            {isPendingPayment && (
              <Badge className="rounded-full text-[10px] bg-amber-500/15 text-amber-500">Awaiting payment</Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {customer}
            {s.started_at && s.end_date &&
              ` · ${format(new Date(`${s.started_at}T00:00:00`), "MMM d")} → ${format(new Date(`${s.end_date}T00:00:00`), "MMM d, yyyy")}`}
          </p>
          {s.delivery_address && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{s.delivery_address}</p>
          )}
        </div>
        {totalCents > 0 && (
          <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
            {formatUSD(totalCents)}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="iconSm" variant="ghost" aria-label="Actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {isPendingPayment(s) && st !== "cancelled" && (
              <DropdownMenuItem onSelect={() => approve.mutate(s)}>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Mark as paid
              </DropdownMenuItem>
            )}
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
