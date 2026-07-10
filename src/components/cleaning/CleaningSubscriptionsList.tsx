import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, MoreHorizontal, PauseCircle, PlayCircle, XCircle } from "lucide-react";
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
        .select("id,package_id,user_id,subscription_status,payment_status,monthly_price_cents,total_price_cents,service_start_date,service_end_date,paid_until,end_date,apartment_note,cleaner_hint")
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
    },
    onSuccess: () => {
      toast.success("Subscription updated");
      qc.invalidateQueries({ queryKey: ["provider-cleaning-subs", providerId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <PageLoader />;

  const today = new Date();
  const groups = { active: [] as any[], expiring: [] as any[], past: [] as any[] };
  subs.forEach((s: any) => {
    const st = s.subscription_status || (s.is_active ? "active" : "inactive");
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
    const st = s.subscription_status || (s.is_active ? "active" : "inactive");
    const end = s.paid_until || s.service_end_date || s.end_date;
    const start = s.service_start_date;
    return (
      <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-card p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-foreground">{s.package_name}</p>
            <Badge className={cn("rounded-full text-[10px] capitalize", statusTone(st))}>{st}</Badge>
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
          <DropdownMenuContent align="end" className="w-52">
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
