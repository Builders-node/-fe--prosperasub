import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Home, LayoutList, Megaphone } from "lucide-react";
import { toast } from "sonner";

import { WorkspaceEmpty, WorkspaceSection, WorkspaceStat } from "@/components/provider/WorkspaceUI";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { accountApi, adminApi, supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/patterns/ConfirmDialog";
import { tr, dfLocale } from "@/lib/tr";

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

type Placement = "home" | "service";
const PLACES = [
  { key: "home" as const, label: tr("Home screen"), Icon: Home },
  { key: "service" as const, label: tr("Your service"), Icon: LayoutList },
];

const statsLine = (s?: Stats) => s ?? { impressions: 0, clicks: 0, orders: 0, revenueCents: 0 };

function StatsGrid({ s }: { s?: Stats }) {
  const v = statsLine(s);
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <WorkspaceStat label={tr("Views")} value={String(v.impressions)} />
      <WorkspaceStat label={tr("Taps")} value={String(v.clicks)} />
      <WorkspaceStat label={tr("Orders")} value={String(v.orders)} />
      <WorkspaceStat label={tr("Revenue")} value={formatUSD(v.revenueCents)} />
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
    onSuccess: (on) => { toast.success(on ? tr("Boost is on") : tr("Boost is off")); void qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e: Error) => toast.error(e.message || tr("Could not change the boost")),
  });

  const { isAdmin } = useAuth();
  const end = useMutation({
    mutationFn: async (promoId: string) => {
      const { error } = await adminApi(`/admin/promotions/${promoId}/end`, { method: "POST" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(tr("Ad ended")); void qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e: Error) => toast.error(e.message || tr("Could not end it")),
  });

  const [confirm, confirmDialog] = useConfirm();
  if (isLoading || isError || !data) return null;

  const s = data.settings;
  const boostOn = data.boost?.status === "active";
  const featured = data.promotions;
  const isLive = (p: PromoRow) => p.status === "active" && (!p.ends_at || new Date(p.ends_at) > new Date());
  const liveCount = featured.filter(isLive).length;

  return (
    <div className="space-y-1">
      {confirmDialog}
      <WorkspaceSection
        title={tr("Boost")}
        subtitle={tr("Show up under Featured on the home screen and in your service. Nothing up front — you pay {value}% extra commission only on orders that came from it.", { value: data.boost && boostOn ? data.boost.extra_commission_pct : s.boostPct })}
        action={
          <Switch
            checked={boostOn}
            disabled={!data.canBuy || boost.isPending || !data.enabled}
            onCheckedChange={(on) => boost.mutate({ on, planId: data.boost?.plan_id ?? null })}
            aria-label={boostOn ? tr("Turn boost off") : tr("Turn boost on")}
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
            label={tr("Boost shows")}
          />
        )}
        {data.boost ? <StatsGrid s={data.boost.stats} /> : (
          <WorkspaceEmpty>{data.canBuy ? tr("Switch it on and the numbers appear here.") : tr("Only the owner can switch this on.")}</WorkspaceEmpty>
        )}
      </WorkspaceSection>

      <WorkspaceSection
        title={tr("Featured")}
        subtitle={tr("A guaranteed place at the top, for as many weeks as you choose. Run several at once — on the home screen, in your service, or both.")}
        bodyClassName="space-y-4"
      >
        {/* 1 — what is running. Live first, then the ones that ended. */}
        {featured.length > 0 && (
          <div className="space-y-2">
            <p className="text-body font-semibold text-foreground">{tr("Your ads")}{liveCount > 0 ? tr(" · {liveCount} live", { liveCount }) : ""}
            </p>
            {[...featured].sort((a, b) => Number(isLive(b)) - Number(isLive(a))).map((p) => {
              const live = isLive(p);
              const offer = p.plan_id ? plans.find((x) => x.id === p.plan_id)?.name : null;
              return (
                <div key={p.id} className="space-y-2 rounded-radius-md bg-inset p-3">
                  <div className="flex items-center gap-2">
                    {p.placement === "home" ? <Home className="h-4 w-4 shrink-0 text-muted-foreground" /> : <LayoutList className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1 truncate text-title font-semibold text-foreground">
                      {p.placement === "home" ? tr("Home screen") : tr("Your service")} · {offer ?? tr("The business")}
                    </span>
                    <span className={cn("shrink-0 text-meta font-semibold", live ? "text-success" : "text-muted-foreground")}>
                      {live ? tr("Live") : tr("Ended")}
                    </span>
                    {live && isAdmin && (
                      <Button size="sm" variant="secondary" disabled={end.isPending}
                        onClick={async () => { if (await confirm({ title: tr("End this ad now?"), description: tr("It stops showing straight away."), confirmLabel: tr("End ad") })) end.mutate(p.id); }}>{tr("End")}</Button>
                    )}
                  </div>
                  <p className="text-meta text-muted-foreground">
                    {format(new Date(p.starts_at), "MMM d", { locale: dfLocale })} → {p.ends_at ? format(new Date(p.ends_at), "MMM d", { locale: dfLocale }) : "—"} · {p.price_cents > 0 ? formatUSD(p.price_cents) : tr("Free")}
                  </p>
                  <StatsGrid s={p.stats} />
                </div>
              );
            })}
          </div>
        )}

        {/* 2 — a new one. */}
        {data.enabled && (data.canBuy || isAdmin) ? (
          <NewAd providerId={providerId} state={data} plans={plans} isAdmin={isAdmin}
            onDone={() => void qc.invalidateQueries({ queryKey: KEY })} />
        ) : featured.length === 0 ? (
          <WorkspaceEmpty>{data.canBuy ? tr("No ads yet.") : tr("Only the owner can place an ad.")}</WorkspaceEmpty>
        ) : null}
      </WorkspaceSection>
    </div>
  );
}

function OfferPicker({ plans, value, onChange, disabled, label = tr("What to show"), onInset = false }: {
  plans: Array<{ id: string; name: string }>; value: string | null; onChange: (id: string | null) => void; disabled?: boolean; label?: string;
  /** Sitting on an inset panel already — the field takes the card colour to show. */
  onInset?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-body font-medium text-foreground">{label}</span>
      <select
        className={cn("h-10 w-full rounded-full px-4 text-body text-foreground disabled:opacity-50", onInset ? "bg-card" : "bg-inset")}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{tr("The business")}</option>
        {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  );
}

/**
 * A new ad: where (one place or both — each becomes its own ad), what (the
 * business or one offer), how long. The owner pays from the earned balance;
 * an EverySub admin can also place it free (Edge /admin/promotions/grant).
 */
function NewAd({ providerId, state, plans, isAdmin, onDone }: {
  providerId: string; state: PromoState; plans: Array<{ id: string; name: string }>; isAdmin: boolean; onDone: () => void;
}) {
  const s = state.settings;
  const [where, setWhere] = useState<Set<Placement>>(new Set(state.slotsLeft.service > 0 ? ["service"] : state.slotsLeft.home > 0 ? ["home"] : []));
  const [weeks, setWeeks] = useState(1);
  const [planId, setPlanId] = useState<string | null>(null);
  // An admin who is not the owner can only give it free.
  const [free, setFree] = useState(isAdmin && !state.canBuy);
  const weekOptions = free ? [1, 2, 4, 8, 12] : [1, 2, 3, 4];
  const chosen = PLACES.filter((p) => where.has(p.key));
  const price = free ? 0 : chosen.reduce((sum, p) => sum + (p.key === "home" ? s.homeWeekCents : s.serviceWeekCents) * weeks, 0);
  const full = chosen.filter((p) => state.slotsLeft[p.key] === 0);
  const short = !free && state.availableCents < price;

  const toggle = (k: Placement) => setWhere((cur) => {
    const n = new Set(cur);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  const place = useMutation({
    mutationFn: async () => {
      const done: string[] = [];
      for (const p of chosen) {
        const { error } = free
          ? await adminApi("/admin/promotions/grant", {
              method: "POST", body: JSON.stringify({ providerId, planId, placement: p.key, weeks }),
            })
          : await accountApi(`/account/providers/${providerId}/promotions/featured`, {
              method: "POST", body: JSON.stringify({ placement: p.key, weeks, planId }),
            });
        if (error) {
          // Some may already be placed — say exactly which.
          throw new Error(done.length ? `${done.join(tr(" and "))} placed; ${p.label}: ${error.message}` : error.message);
        }
        done.push(p.label);
      }
      return done;
    },
    onSuccess: (done) => { toast.success((weeks > 1 ? tr("{join} — live now for {weeks} weeks", { join: done.join(tr(" and ")), weeks }) : tr("{join} — live now for {weeks} week", { join: done.join(tr(" and ")), weeks }))); onDone(); },
    onError: (e: Error) => { toast.error(e.message || tr("Could not place the ad")); onDone(); },
  });

  return (
    <div className="space-y-4 rounded-radius-md bg-inset p-3 md:p-4">
      <p className="text-title font-semibold text-foreground">{tr("New ad")}</p>

      {isAdmin && state.canBuy && (
        <div className="flex rounded-full bg-card p-0.5">
          {([[false, tr("From the balance")], [true, tr("Free · EverySub")]] as const).map(([v, label]) => (
            <button key={label} type="button" onClick={() => { setFree(v); if (!v && weeks > 4) setWeeks(4); }}
              className={cn("h-9 flex-1 rounded-full text-[14px] font-semibold transition-colors",
                free === v ? "bg-segment text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-body font-medium text-foreground">{tr("Where")}{" "}<span className="font-normal text-muted-foreground">{tr("— pick one or both")}</span></p>
        <div className="grid grid-cols-2 gap-2">
          {PLACES.map(({ key, label, Icon }) => {
            const on = where.has(key);
            const left = state.slotsLeft[key];
            const cents = key === "home" ? s.homeWeekCents : s.serviceWeekCents;
            return (
              <button key={key} type="button" onClick={() => toggle(key)} aria-pressed={on}
                className={cn("flex flex-col items-start gap-1 rounded-radius-md p-3 text-left transition-colors",
                  on ? "bg-foreground text-background" : "bg-card text-foreground hover:bg-muted")}>
                <span className="flex w-full items-center justify-between">
                  <Icon className="h-5 w-5" />
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-[6px]", on ? "bg-background text-foreground" : "outline outline-1 -outline-offset-1 outline-muted-foreground/40")}>
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                </span>
                <span className="text-title font-semibold">{label}</span>
                <span className={cn("text-meta", on ? "text-background/70" : "text-muted-foreground")}>
                  {free ? tr("Free") : `${formatUSD(cents)} / week`} · {left === 0 ? "full" : tr("{left} of {value} free", { left, value: key === "home" ? s.slotsHome : s.slotsService })}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {plans.length > 0 && <OfferPicker plans={plans} value={planId} onChange={setPlanId} label={tr("What it shows")} onInset />}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body font-medium text-foreground">{tr("How long")}</span>
        <div className="flex rounded-full bg-card p-1">
          {weekOptions.map((w) => (
            <button key={w} type="button" onClick={() => setWeeks(w)}
              className={cn("h-8 min-w-8 rounded-full px-3 text-body font-semibold tabular-nums", weeks === w ? "bg-foreground text-background" : "text-muted-foreground")}>
              {w}
            </button>
          ))}
        </div>
        <span className="text-body text-muted-foreground">{weeks > 1 ? tr("weeks") : tr("week")}</span>
      </div>

      <Button className="w-full gap-2" loading={place.isPending}
        disabled={!chosen.length || full.length > 0 || short || (!free && price === 0)}
        onClick={() => place.mutate()}>
        <Megaphone />
        {!chosen.length ? tr("Pick where to show it")
          : `${chosen.length > 1 ? tr("Place {length} ads", { length: chosen.length }) : tr("Place the ad")} · ${free ? "free" : formatUSD(price)}`}
      </Button>
      <p className="text-meta text-muted-foreground">
        {full.length
          ? (full.length > 1 ? tr("{join} are full this week — untick it, or wait for a slot to end{value2}.", { join: full.map((p) => p.label).join(tr(" and ")), value2: isAdmin ? tr(" (or raise the slot count in Admin → Promotions)") : "" }) : tr("{join} is full this week — untick it, or wait for a slot to end{value2}.", { join: full.map((p) => p.label).join(tr(" and ")), value2: isAdmin ? tr(" (or raise the slot count in Admin → Promotions)") : "" }))
          : free
            ? tr("Free — nothing is taken from the balance. Starts now.")
            : short
              ? tr("That's {price}; the balance is {availableCents}. It's paid from what was earned on EverySub.", { price: formatUSD(price), availableCents: formatUSD(state.availableCents) })
              : tr("Taken from the balance ({availableCents}). Starts now.", { availableCents: formatUSD(state.availableCents) })}
      </p>
    </div>
  );
}
