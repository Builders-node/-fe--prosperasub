import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Home, LayoutList, Megaphone } from "lucide-react";
import { toast } from "sonner";

import { WorkspaceEmpty, WorkspaceSection, WorkspaceStat } from "@/components/provider/WorkspaceUI";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { accountApi, supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Promote — paid placements for a business (Edge routes/promotions.ts).
 *
 * Two ways, side by side, because they suit different businesses:
 *  - Boost: nothing up front; a few extra percent on the orders it brings.
 *  - Featured: a guaranteed slot for a week, paid from the earned balance.
 * The numbers under each are the only reason to keep paying, so they sit
 * right there — views, taps, orders, revenue, last 30 days.
 */

interface Stats { impressions: number; clicks: number; orders: number; revenueCents: number }
interface PromoRow {
  id: string; kind: "boost" | "featured"; placement: "home" | "service" | null; plan_id: string | null;
  starts_at: string; ends_at: string | null; price_cents: number; extra_commission_pct: number;
  status: "active" | "paused" | "ended"; stats?: Stats;
}
interface PromoState {
  enabled: boolean; canBuy: boolean; availableCents: number;
  settings: { homeWeekCents: number; serviceWeekCents: number; boostPct: number; slotsHome: number; slotsService: number };
  slotsLeft: { home: number; service: number };
  boost: PromoRow | null;
  promotions: PromoRow[];
}

const statsLine = (s?: Stats) => s ?? { impressions: 0, clicks: 0, orders: 0, revenueCents: 0 };

function StatsGrid({ s }: { s?: Stats }) {
  const v = statsLine(s);
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <WorkspaceStat label="Views" value={String(v.impressions)} />
      <WorkspaceStat label="Taps" value={String(v.clicks)} />
      <WorkspaceStat label="Orders" value={String(v.orders)} />
      <WorkspaceStat label="Revenue" value={formatUSD(v.revenueCents)} />
    </div>
  );
}

export function ProviderPromotions({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const KEY = ["provider-promotions", providerId];

  const { data, isLoading, isError } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await accountApi(`/account/providers/${providerId}/promotions`);
      if (error) throw error;
      return data as PromoState;
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["provider-promotable-plans", providerId],
    queryFn: async () => {
      const { data } = await supabaseDb.from("provider_plans").select("id,name")
        .eq("provider_id", providerId).eq("status", "active").order("name");
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const boost = useMutation({
    mutationFn: async (body: { on: boolean; planId: string | null }) => {
      const { error } = await accountApi(`/account/providers/${providerId}/promotions/boost`, {
        method: "POST", body: JSON.stringify(body),
      });
      if (error) throw error;
      return body.on;
    },
    onSuccess: (on) => { toast.success(on ? "Boost is on" : "Boost is off"); void qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e: Error) => toast.error(e.message || "Could not change the boost"),
  });

  if (isLoading || isError || !data) return null;

  const s = data.settings;
  const boostOn = data.boost?.status === "active";
  const featured = data.promotions;

  return (
    <div className="space-y-1">
      <WorkspaceSection
        title="Boost"
        subtitle={`Show up under Featured on the home screen and in your service. Nothing up front — you pay ${data.boost && boostOn ? data.boost.extra_commission_pct : s.boostPct}% extra commission only on orders that came from it.`}
        action={
          <Switch
            checked={boostOn}
            disabled={!data.canBuy || boost.isPending || !data.enabled}
            onCheckedChange={(on) => boost.mutate({ on, planId: data.boost?.plan_id ?? null })}
            aria-label={boostOn ? "Turn boost off" : "Turn boost on"}
          />
        }
        bodyClassName="space-y-3"
      >
        {plans.length > 0 && (
          <OfferPicker
            plans={plans}
            value={data.boost?.plan_id ?? null}
            disabled={!data.canBuy || !boostOn || boost.isPending}
            onChange={(planId) => boost.mutate({ on: true, planId })}
          />
        )}
        {data.boost ? <StatsGrid s={data.boost.stats} /> : (
          <WorkspaceEmpty>{data.canBuy ? "Switch it on and the numbers appear here." : "Only the owner can switch this on."}</WorkspaceEmpty>
        )}
      </WorkspaceSection>

      <WorkspaceSection
        title="Featured"
        subtitle="A guaranteed place at the top for a week. Paid from what you've earned — no card needed."
        bodyClassName="space-y-3"
      >
        {data.canBuy && data.enabled && <BuyFeatured providerId={providerId} state={data} plans={plans} onDone={() => void qc.invalidateQueries({ queryKey: KEY })} />}
        {featured.length === 0 ? (
          <WorkspaceEmpty>No featured weeks yet.</WorkspaceEmpty>
        ) : (
          featured.map((p) => {
            const live = p.status === "active" && (!p.ends_at || new Date(p.ends_at) > new Date());
            return (
              <div key={p.id} className="space-y-2 rounded-radius-md bg-inset p-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-title font-semibold text-foreground">
                    {p.placement === "home" ? "Home screen" : "Your service"}
                    {p.plan_id && plans.find((x) => x.id === p.plan_id) ? ` · ${plans.find((x) => x.id === p.plan_id)!.name}` : ""}
                  </span>
                  <span className={cn("shrink-0 text-meta font-semibold", live ? "text-success" : "text-muted-foreground")}>
                    {live ? "Live" : "Ended"}
                  </span>
                </div>
                <p className="text-meta text-muted-foreground">
                  {format(new Date(p.starts_at), "MMM d")} → {p.ends_at ? format(new Date(p.ends_at), "MMM d") : "—"} · {formatUSD(p.price_cents)}
                </p>
                <StatsGrid s={p.stats} />
              </div>
            );
          })
        )}
      </WorkspaceSection>
    </div>
  );
}

function OfferPicker({ plans, value, onChange, disabled }: {
  plans: Array<{ id: string; name: string }>; value: string | null; onChange: (id: string | null) => void; disabled?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-body font-medium text-foreground">What to show</span>
      <select
        className="h-10 w-full rounded-full bg-inset px-4 text-body text-foreground disabled:opacity-50"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">The business</option>
        {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  );
}

function BuyFeatured({ providerId, state, plans, onDone }: {
  providerId: string; state: PromoState; plans: Array<{ id: string; name: string }>; onDone: () => void;
}) {
  const [placement, setPlacement] = useState<"home" | "service">("service");
  const [weeks, setWeeks] = useState(1);
  const [planId, setPlanId] = useState<string | null>(null);
  const s = state.settings;
  const price = (placement === "home" ? s.homeWeekCents : s.serviceWeekCents) * weeks;
  const slots = state.slotsLeft[placement];
  const short = state.availableCents < price;

  const buy = useMutation({
    mutationFn: async () => {
      const { error } = await accountApi(`/account/providers/${providerId}/promotions/featured`, {
        method: "POST", body: JSON.stringify({ placement, weeks, planId }),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`Featured for ${weeks} week${weeks > 1 ? "s" : ""} — live now`); onDone(); },
    onError: (e: Error) => toast.error(e.message || "Could not book the slot"),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {([["service", "Your service", LayoutList, s.serviceWeekCents], ["home", "Home screen", Home, s.homeWeekCents]] as const).map(([key, label, Icon, cents]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPlacement(key)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-radius-md p-3 text-left transition-colors",
              placement === key ? "bg-foreground text-background" : "bg-inset text-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="text-title font-semibold">{label}</span>
            <span className={cn("text-meta", placement === key ? "text-background/70" : "text-muted-foreground")}>
              {formatUSD(cents)} / week · {state.slotsLeft[key]} left
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-body text-muted-foreground">Weeks</span>
        <div className="flex rounded-full bg-inset p-1">
          {[1, 2, 3, 4].map((w) => (
            <button key={w} type="button" onClick={() => setWeeks(w)}
              className={cn("h-8 min-w-8 rounded-full px-3 text-body font-semibold tabular-nums", weeks === w ? "bg-foreground text-background" : "text-muted-foreground")}>
              {w}
            </button>
          ))}
        </div>
      </div>

      {plans.length > 0 && <OfferPicker plans={plans} value={planId} onChange={setPlanId} />}

      <Button
        className="w-full gap-2"
        loading={buy.isPending}
        disabled={short || slots === 0 || price === 0}
        onClick={() => buy.mutate()}
      >
        <Megaphone /> Feature for {formatUSD(price)}
      </Button>
      <p className="text-meta text-muted-foreground">
        {slots === 0
          ? "Every slot here is taken this week — try the other placement."
          : short
            ? `Your balance is ${formatUSD(state.availableCents)}. It's paid from what you've earned on EverySub.`
            : `Taken from your balance (${formatUSD(state.availableCents)}). Starts now.`}
      </p>
    </div>
  );
}
