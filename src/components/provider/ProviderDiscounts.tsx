import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, CalendarRange, Copy, Pause, Play, Plus, Sparkles, Square, UserPlus, Wallet } from "lucide-react";
import { toast } from "sonner";

import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { WorkspaceSection } from "@/components/provider/WorkspaceUI";
import { DealNote, DealPill, DealPrice } from "@/components/discounts/DealBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { accountApi } from "@/integrations/supabase/client";
import { displayDiscount, type ActiveDiscount, type DiscountKind } from "@/lib/discounts";
import { formatUSD } from "@/lib/pricing";
import { periodNoun } from "@/lib/services/planPeriod";
import { addDaysISO, formatDateHN, todayHN } from "@/lib/timezone";
import { cn } from "@/lib/utils";

/**
 * A business's own discounts (Edge routes/discounts.ts): a sale with an end
 * date, a price for new customers, and a reward for paying ahead.
 *
 * Built so an owner can set one up in under a minute: three questions (what
 * kind, how much and on what, when), presets instead of blank fields, and the
 * customer's card and the owner's own take shown live while they choose. The
 * server re-validates every field and the order trigger re-prices every sale,
 * so nothing here decides money.
 */

interface Plan { id: string; name: string; priceCents: number; period: string; perPerson: boolean; parentId: string | null; status: string }
interface Vehicle { id: string; name: string; dailyPriceCents: number; status: string; imageUrl: string | null }
interface Stats { orders: number; revenueCents: number; discountCents: number; newCustomers: number }
interface Discount {
  id: string; campaign_id: string | null; kind: DiscountKind; title: string | null;
  value_type: "percent" | "fixed"; percent_off: number | null; amount_off_cents: number | null;
  tiers: Array<{ periods: number; percent_off: number }> | null; intro_periods: number;
  target_ids: string[] | null; min_order_cents: number; max_redemptions: number | null;
  starts_at: string; ends_at: string | null; status: string; admin_note: string | null;
  platform_share_pct: number; state: "live" | "scheduled" | "paused" | "ended" | "hidden"; stats: Stats;
}
interface Campaign {
  id: string; title: string; description: string | null; min_percent_off: number;
  platform_share_pct: number; starts_at: string; ends_at: string; joined: boolean;
}
interface Payload {
  settings: { maxPct: number; maxLive: number };
  commissionPct: number;
  plans: Plan[];
  vehicles: Vehicle[];
  discounts: Discount[];
  campaigns: Campaign[];
}

const KIND_META: Record<DiscountKind, { label: string; blurb: string; icon: typeof BadgePercent }> = {
  sale: { label: "Sale", blurb: "A lower price for everyone, for a few days. Shown crossed out on your cards.", icon: BadgePercent },
  intro: { label: "New customers", blurb: "A first-period price for people who never bought from you.", icon: UserPlus },
  prepay: { label: "Pay ahead", blurb: "Less per period when someone buys 3, 6 or 12 at once.", icon: Wallet },
};

const STATE_LABEL: Record<Discount["state"], string> = {
  live: "Live", scheduled: "Scheduled", paused: "Paused", ended: "Ended", hidden: "Hidden by Prospera",
};

function valueText(d: Pick<Discount, "kind" | "value_type" | "percent_off" | "amount_off_cents" | "tiers" | "intro_periods">): string {
  if (d.kind === "prepay") return (d.tiers ?? []).map((t) => `${t.periods}+ → ${t.percent_off}%`).join(" · ");
  const v = d.value_type === "percent" ? `${d.percent_off}% off` : `${formatUSD(d.amount_off_cents ?? 0)} off`;
  return d.kind === "intro" ? `${v} the first ${d.intro_periods > 1 ? `${d.intro_periods} periods` : "period"}` : v;
}

export function ProviderDiscounts({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const KEY = ["provider-discounts", providerId];
  const [wizard, setWizard] = useState<{ kind?: DiscountKind; from?: Discount } | null>(null);
  const [view, setView] = useState<"current" | "ended">("current");

  const q = useQuery({
    queryKey: KEY,
    retry: false,
    queryFn: async () => {
      const { data, error } = await accountApi(`/account/providers/${providerId}/discounts`);
      if (error) throw error;
      return data as Payload;
    },
  });

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const { error } = await accountApi(`/account/providers/${providerId}/discounts/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: KEY }); void qc.invalidateQueries({ queryKey: ["active-discounts"] }); },
    onError: (e: Error) => toast.error(e.message || "Could not update the discount"),
  });

  // A manager (403) or a database without the feature yet: the section is not theirs.
  if (q.isError) return null;
  if (q.isPending) return <div className="h-40 animate-pulse rounded-radius-lg bg-card" />;
  const data = q.data;
  const current = data.discounts.filter((d) => d.state !== "ended");
  const ended = data.discounts.filter((d) => d.state === "ended");
  const shown = view === "current" ? current : ended;
  const atLimit = current.filter((d) => d.state !== "hidden").length >= data.settings.maxLive;
  const openCampaigns = data.campaigns.filter((k) => !k.joined);

  return (
    <div className="space-y-1">
      <WorkspaceSection
        title="Discounts"
        subtitle="Applied automatically — customers don't need a code. The discount comes off what you earn."
        action={
          <Button size="sm" className="gap-2" disabled={atLimit} onClick={() => setWizard({})}>
            <Plus /> New discount
          </Button>
        }
      />

      {/* Prospera-wide sales: join with one tap; the platform pays part of it. */}
      {openCampaigns.map((k) => (
        <CampaignCard key={k.id} campaign={k} providerId={providerId} maxPct={data.settings.maxPct} onJoined={() => void qc.invalidateQueries({ queryKey: KEY })} />
      ))}

      {data.discounts.length === 0 ? (
        // Empty: the three kinds as starting points, not a blank page.
        <div className="grid gap-1 rounded-radius-lg bg-card p-1.5 sm:grid-cols-3">
          {(Object.keys(KIND_META) as DiscountKind[]).map((k) => {
            const M = KIND_META[k];
            return (
              <button key={k} type="button" onClick={() => setWizard({ kind: k })}
                className="flex flex-col items-start gap-1 rounded-radius-md p-3 text-left transition-colors hover:bg-inset">
                <M.icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-title font-semibold text-foreground">{M.label}</span>
                <span className="text-meta text-muted-foreground">{M.blurb}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-radius-lg bg-card p-1.5">
          <div className="flex gap-1 p-1.5">
            {([["current", `Live & scheduled · ${current.length}`], ["ended", `Ended · ${ended.length}`]] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={cn("h-8 rounded-full px-3 text-meta font-semibold", view === v ? "bg-foreground text-background" : "bg-inset text-muted-foreground")}>
                {label}
              </button>
            ))}
          </div>
          {shown.length === 0 && <p className="p-3 text-meta text-muted-foreground">Nothing here.</p>}
          {shown.map((d) => (
            <DiscountRow
              key={d.id}
              d={d}
              catalog={data}
              busy={patch.isPending}
              onPause={() => patch.mutate({ id: d.id, body: { status: d.status === "paused" ? "active" : "paused" } })}
              onEnd={() => patch.mutate({ id: d.id, body: { status: "ended" } })}
              onDuplicate={() => setWizard({ kind: d.kind, from: d })}
              canDuplicate={!atLimit && !d.campaign_id}
            />
          ))}
        </div>
      )}
      {atLimit && (
        <p className="px-1 text-meta text-muted-foreground">
          Up to {data.settings.maxLive} discounts at a time. End one to start another.
        </p>
      )}

      {wizard && (
        <DiscountWizard
          providerId={providerId}
          data={data}
          initialKind={wizard.kind}
          from={wizard.from}
          onClose={() => setWizard(null)}
          onCreated={() => { void qc.invalidateQueries({ queryKey: KEY }); void qc.invalidateQueries({ queryKey: ["active-discounts"] }); }}
        />
      )}
    </div>
  );
}

function targetsText(ids: string[] | null, c: Pick<Payload, "plans" | "vehicles">): string {
  if (!ids?.length) return "All offers";
  const names = ids.map((id) => c.plans.find((p) => p.id === id)?.name ?? c.vehicles.find((v) => v.id === id)?.name).filter(Boolean) as string[];
  if (!names.length) return `${ids.length} offers`;
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function DiscountRow({ d, catalog, busy, onPause, onEnd, onDuplicate, canDuplicate }: {
  d: Discount; catalog: Payload; busy: boolean;
  onPause: () => void; onEnd: () => void; onDuplicate: () => void; canDuplicate: boolean;
}) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const M = KIND_META[d.kind];
  const live = d.state === "live";
  const dates = `${formatDateHN(d.starts_at, { month: "short", day: "numeric" })} – ${d.ends_at ? formatDateHN(d.ends_at, { month: "short", day: "numeric" }) : "no end"}`;
  return (
    <div className={cn("rounded-radius-md p-3", d.state === "ended" && "opacity-70")}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-inset">
          <M.icon className="h-5 w-5 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-title font-semibold text-foreground">{d.title || M.label}</span>
            <span className={cn(
              "rounded-full px-2 py-0.5 text-meta font-semibold",
              live ? "bg-positive/15 text-positive" : d.state === "hidden" ? "bg-destructive/10 text-destructive" : "bg-inset text-muted-foreground",
            )}>{STATE_LABEL[d.state]}</span>
            {d.platform_share_pct > 0 && (
              <span className="rounded-full bg-inset px-2 py-0.5 text-meta font-semibold text-muted-foreground">
                Prospera pays {d.platform_share_pct}%
              </span>
            )}
          </div>
          <p className="mt-0.5 text-meta text-muted-foreground">
            {valueText(d)} · {targetsText(d.target_ids, catalog)} · {dates}
            {d.max_redemptions ? ` · up to ${d.max_redemptions} orders` : ""}
            {d.min_order_cents ? ` · orders from ${formatUSD(d.min_order_cents)}` : ""}
          </p>
          {d.state === "hidden" && d.admin_note && <p className="mt-1 text-meta text-destructive">{d.admin_note}</p>}
          {/* What it did — the reason to run another. */}
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Orders" value={String(d.stats.orders)} />
            <Stat label="Sales" value={formatUSD(d.stats.revenueCents)} />
            <Stat label="Given off" value={formatUSD(d.stats.discountCents)} />
            <Stat label="New customers" value={String(d.stats.newCustomers)} />
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {canDuplicate && (
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={onDuplicate}><Copy className="h-4 w-4" /> Duplicate</Button>
        )}
        {d.state !== "ended" && d.state !== "hidden" && (
          <Button size="sm" variant="secondary" className="gap-1.5" disabled={busy} onClick={onPause}>
            {d.status === "paused" ? <><Play className="h-4 w-4" /> Resume</> : <><Pause className="h-4 w-4" /> Pause</>}
          </Button>
        )}
        {d.state !== "ended" && (
          confirmEnd ? (
            <Button size="sm" variant="destructive" disabled={busy} onClick={onEnd}>End it now</Button>
          ) : (
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setConfirmEnd(true)}><Square className="h-4 w-4" /> End</Button>
          )
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-radius-md bg-inset px-2.5 py-1.5">
      <p className="text-meta text-muted-foreground">{label}</p>
      <p className="text-body font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function CampaignCard({ campaign: k, providerId, maxPct, onJoined }: { campaign: Campaign; providerId: string; maxPct: number; onJoined: () => void }) {
  const [pct, setPct] = useState(String(k.min_percent_off));
  const join = useMutation({
    mutationFn: async () => {
      const { error } = await accountApi(`/account/providers/${providerId}/discounts/campaigns/${k.id}/join`, {
        method: "POST", body: JSON.stringify({ percentOff: Number(pct) }),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`You're in ${k.title}`); onJoined(); },
    onError: (e: Error) => toast.error(e.message || "Could not join"),
  });
  const n = Number(pct);
  const valid = n >= k.min_percent_off && n <= maxPct;
  return (
    <div className="rounded-radius-lg bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-foreground text-background">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-title font-semibold text-foreground">{k.title}</p>
          <p className="mt-0.5 text-meta text-muted-foreground">
            {formatDateHN(k.starts_at, { month: "short", day: "numeric" })} – {formatDateHN(k.ends_at, { month: "short", day: "numeric" })}
            {" · "}at least {k.min_percent_off}% off
            {k.platform_share_pct > 0 ? ` · Prospera pays ${k.platform_share_pct}% of every discount` : ""}
          </p>
          {k.description && <p className="mt-1 text-body text-foreground">{k.description}</p>}
        </div>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <Input label="Your discount, %" type="number" inputSize="sm" min={k.min_percent_off} max={maxPct} value={pct}
          onChange={(e) => setPct(e.target.value)} wrapperClassName="w-40" />
        <Button size="sm" loading={join.isPending} disabled={!valid} onClick={() => join.mutate()}>Join the sale</Button>
      </div>
    </div>
  );
}

// ── The wizard ───────────────────────────────────────────────────────────────

const PRESETS = [10, 15, 20, 30];
const DEFAULT_TIERS = [{ periods: 3, percentOff: 5 }, { periods: 6, percentOff: 10 }, { periods: 12, percentOff: 15 }];

function DiscountWizard({ providerId, data, initialKind, from, onClose, onCreated }: {
  providerId: string; data: Payload; initialKind?: DiscountKind; from?: Discount;
  onClose: () => void; onCreated: () => void;
}) {
  const today = todayHN();
  const [step, setStep] = useState(initialKind ? 1 : 0);
  const [kind, setKind] = useState<DiscountKind>(initialKind ?? "sale");
  const [valueType, setValueType] = useState<"percent" | "fixed">(from?.value_type ?? "percent");
  const [pct, setPct] = useState(String(from?.percent_off ?? (initialKind === "intro" ? 50 : 15)));
  const [amount, setAmount] = useState(from?.amount_off_cents ? String(from.amount_off_cents / 100) : "10");
  const [tiers, setTiers] = useState(from?.tiers?.map((t) => ({ periods: t.periods, percentOff: t.percent_off })) ?? DEFAULT_TIERS);
  const [introPeriods, setIntroPeriods] = useState(String(from?.intro_periods ?? 1));
  const [targets, setTargets] = useState<string[]>(from?.target_ids ?? []);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(from || initialKind !== "prepay" ? addDaysISO(today, 7) : "");
  const [title, setTitle] = useState(from?.title ?? "");
  const [notify, setNotify] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [minOrder, setMinOrder] = useState(from?.min_order_cents ? String(from.min_order_cents / 100) : "");
  const [maxUses, setMaxUses] = useState(from?.max_redemptions ? String(from.max_redemptions) : "");

  const maxPct = data.settings.maxPct;
  // Offers to choose from: the top-level plans (a discount on an offer covers its variants) and cars.
  const offers = useMemo(() => [
    ...data.plans.filter((p) => !p.parentId && p.status === "active").map((p) => ({ id: p.id, name: p.name, cents: p.priceCents, unit: periodNoun(p.period) })),
    ...data.vehicles.filter((v) => v.status !== "inactive").map((v) => ({ id: v.id, name: v.name, cents: v.dailyPriceCents, unit: "day" })),
  ], [data]);
  const noun = useMemo(() => {
    const chosen = data.plans.filter((p) => !targets.length || targets.includes(p.id));
    const nouns = new Set(chosen.map((p) => periodNoun(p.period)).filter(Boolean));
    return nouns.size === 1 ? [...nouns][0] : "period";
  }, [data.plans, targets]);

  const pctN = Number(pct);
  const amountCents = Math.round(Number(amount) * 100);
  const valueOk = kind === "prepay"
    ? tiers.some((t) => t.periods >= 2 && t.percentOff >= 1) && tiers.every((t) => t.percentOff <= maxPct)
    : valueType === "percent" ? pctN >= 1 && pctN <= maxPct : amountCents >= 100;
  const datesOk = (!endsOn || endsOn >= today) && (!endsOn || endsOn > startsOn || (endsOn === startsOn)) && (kind !== "sale" || !!endsOn);

  // The preview: one real offer, priced as a customer and as the owner would see it.
  const sample = offers.find((o) => targets.includes(o.id)) ?? offers[0];
  const previewDiscount: ActiveDiscount | null = sample ? {
    id: "preview", provider_id: providerId, kind, title: title || null, value_type: valueType,
    percent_off: valueType === "percent" ? pctN : null, amount_off_cents: valueType === "fixed" ? amountCents : null,
    tiers: tiers.map((t) => ({ periods: t.periods, percent_off: t.percentOff })), intro_periods: Number(introPeriods) || 1,
    target_ids: null, min_order_cents: 0, starts_at: new Date(0).toISOString(),
    ends_at: endsOn ? new Date(`${endsOn}T23:59:59-06:00`).toISOString() : null, reference_prices: null,
  } : null;
  const deal = sample && previewDiscount && valueOk
    ? displayDiscount([previewDiscount], { providerId, id: sample.id, priceCents: sample.cents })
    : null;
  const offCents = !sample || !valueOk ? 0
    : kind === "prepay" ? Math.floor((sample.cents * Math.max(...tiers.map((t) => t.percentOff))) / 100)
    : valueType === "percent" ? Math.floor((sample.cents * pctN) / 100) : Math.min(amountCents, sample.cents - 1);
  const keep = (cents: number) => Math.round(cents * (1 - data.commissionPct / 100));

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await accountApi(`/account/providers/${providerId}/discounts`, {
        method: "POST",
        body: JSON.stringify({
          kind, valueType, percentOff: pctN, amountOff: Number(amount),
          tiers: kind === "prepay" ? tiers : undefined,
          introPeriods: Number(introPeriods) || 1,
          targetIds: targets.length ? targets : null,
          startsOn, endsOn: endsOn || null, title: title.trim() || null,
          minOrder: minOrder ? Number(minOrder) : 0, maxRedemptions: maxUses ? Number(maxUses) : null,
          notify,
        }),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(startsOn > today ? `Scheduled for ${formatDateHN(startsOn)}` : "Your discount is live");
      onCreated(); onClose();
    },
    onError: (e: Error) => toast.error(e.message || "Could not save the discount"),
  });

  const steps = ["Type", "Amount", "Dates"];
  const canNext = step === 0 || (step === 1 && valueOk) || (step === 2 && datesOk);

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={from ? "Duplicate discount" : "New discount"}
      description={`Step ${step + 1} of 3 · ${steps[step]}`}
      className="sm:max-w-2xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>{step === 0 ? "Cancel" : "Back"}</Button>
          {step < 2 ? (
            <Button disabled={!canNext} onClick={() => setStep(step + 1)}>Next</Button>
          ) : (
            <Button loading={create.isPending} disabled={!valueOk || !datesOk} onClick={() => create.mutate()}>
              {startsOn > today ? "Schedule" : "Start now"}
            </Button>
          )}
        </div>
      }
    >
      {step === 0 && (
        <div className="grid gap-2">
          {(Object.keys(KIND_META) as DiscountKind[]).map((k) => {
            const M = KIND_META[k];
            return (
              <button key={k} type="button"
                onClick={() => {
                  setKind(k);
                  if (k === "intro" && !from) setPct("50");
                  if (k === "sale" && !from) setPct("15");
                  if (k === "prepay") setEndsOn(""); else if (!endsOn) setEndsOn(addDaysISO(today, 7));
                  setStep(1);
                }}
                className={cn("flex items-start gap-3 rounded-radius-md p-3 text-left transition-colors", kind === k ? "bg-inset ring-2 ring-foreground" : "bg-inset hover:bg-muted")}>
                <M.icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <span>
                  <span className="block text-title font-semibold text-foreground">{M.label}</span>
                  <span className="block text-meta text-muted-foreground">{M.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {kind === "prepay" ? (
            <div className="space-y-2">
              <p className="text-body font-medium text-foreground">Buy this many {noun}s at once → this much off</p>
              {tiers.map((t, i) => (
                <div key={i} className="flex items-end gap-2">
                  <Input label={i === 0 ? `${noun[0].toUpperCase()}${noun.slice(1)}s` : undefined} type="number" inputSize="sm" min={2} max={24} value={String(t.periods)}
                    onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, periods: Number(e.target.value) } : x)))} wrapperClassName="w-28" />
                  <Input label={i === 0 ? "% off" : undefined} type="number" inputSize="sm" min={1} max={maxPct} value={String(t.percentOff)}
                    onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, percentOff: Number(e.target.value) } : x)))} wrapperClassName="w-28" />
                  {tiers.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>Remove</Button>
                  )}
                </div>
              ))}
              {tiers.length < 4 && (
                <Button size="sm" variant="secondary" onClick={() => setTiers([...tiers, { periods: (tiers.at(-1)?.periods ?? 2) + 3, percentOff: (tiers.at(-1)?.percentOff ?? 5) + 5 }])}>
                  Add a step
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-body font-medium text-foreground">How much off</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex shrink-0 rounded-full bg-inset p-1">
                  {(["percent", "fixed"] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setValueType(v)}
                      className={cn("h-8 rounded-full px-3 text-body font-semibold", valueType === v ? "bg-foreground text-background" : "text-muted-foreground")}>
                      {v === "percent" ? "%" : "$"}
                    </button>
                  ))}
                </div>
                {valueType === "percent" && PRESETS.concat(kind === "intro" ? [50] : []).map((p) => (
                  <button key={p} type="button" onClick={() => setPct(String(p))}
                    className={cn("h-10 rounded-full px-4 text-body font-semibold", pctN === p ? "bg-foreground text-background" : "bg-inset text-foreground")}>
                    {p}%
                  </button>
                ))}
                <Input type="number" inputMode="decimal" inputSize="sm" min={1} max={valueType === "percent" ? maxPct : undefined}
                  value={valueType === "percent" ? pct : amount}
                  onChange={(e) => (valueType === "percent" ? setPct(e.target.value) : setAmount(e.target.value))}
                  wrapperClassName="w-24" aria-label={valueType === "percent" ? "Percent off" : "Dollars off"} />
              </div>
              {valueType === "percent" && pctN > maxPct && <p className="text-meta text-destructive">At most {maxPct}%.</p>}
              {valueType === "fixed" && kind === "sale" && <p className="text-meta text-muted-foreground">Taken off each {noun} of the order.</p>}
            </div>
          )}
          {kind === "intro" && (
            <div className="space-y-1.5">
              <p className="text-body font-medium text-foreground">For how long</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3].map((n) => (
                  <button key={n} type="button" onClick={() => setIntroPeriods(String(n))}
                    className={cn("h-10 rounded-full px-4 text-body font-semibold", Number(introPeriods) === n ? "bg-foreground text-background" : "bg-inset text-foreground")}>
                    First {n > 1 ? `${n} ${noun}s` : noun}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-body font-medium text-foreground">On which offers</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setTargets([])}
                className={cn("h-9 rounded-full px-3 text-meta font-semibold", targets.length === 0 ? "bg-foreground text-background" : "bg-inset text-foreground")}>
                Everything
              </button>
              {offers.map((o) => {
                const on = targets.includes(o.id);
                return (
                  <button key={o.id} type="button" onClick={() => setTargets(on ? targets.filter((x) => x !== o.id) : [...targets, o.id])}
                    className={cn("h-9 max-w-full truncate rounded-full px-3 text-meta font-semibold", on ? "bg-foreground text-background" : "bg-inset text-foreground")}>
                    {o.name}
                  </button>
                );
              })}
            </div>
          </div>

          <Preview sample={sample} deal={deal} kind={kind} offCents={offCents} keep={keep} commissionPct={data.commissionPct} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-body font-medium text-foreground"><CalendarRange className="h-4 w-4" /> When</p>
            {kind === "sale" && (
              <div className="flex flex-wrap gap-2">
                {[3, 7, 14].map((n) => (
                  <button key={n} type="button" onClick={() => { setStartsOn(today); setEndsOn(addDaysISO(today, n - 1)); }}
                    className={cn("h-9 rounded-full px-3 text-meta font-semibold",
                      startsOn === today && endsOn === addDaysISO(today, n - 1) ? "bg-foreground text-background" : "bg-inset text-foreground")}>
                    {n} days from today
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Starts" type="date" inputSize="sm" min={today} value={startsOn} onChange={(e) => setStartsOn(e.target.value || today)} />
              <Input label={kind === "sale" ? "Ends" : "Ends (optional)"} type="date" inputSize="sm" min={startsOn} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
            {kind === "sale" && !endsOn && <p className="text-meta text-destructive">A sale needs an end date. For a permanent change, edit the price.</p>}
          </div>
          <Input label="Name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "sale" ? "Summer sale" : kind === "intro" ? "Welcome offer" : "Pay ahead and save"} maxLength={80} />
          <label className="flex items-center justify-between gap-3 rounded-radius-md bg-inset p-3">
            <span>
              <span className="block text-body font-medium text-foreground">Tell my customers</span>
              <span className="block text-meta text-muted-foreground">A notification to people who saved your business or bought before. At most once a week.</span>
            </span>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </label>
          <button type="button" className="text-meta font-semibold text-muted-foreground underline" onClick={() => setAdvanced(!advanced)}>
            {advanced ? "Hide limits" : "Limits (optional)"}
          </button>
          {advanced && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Orders from, $" type="number" inputSize="sm" min={0} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
              <Input label="Max orders" type="number" inputSize="sm" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
            </div>
          )}
          <p className="rounded-radius-md bg-inset p-3 text-meta text-muted-foreground">
            {valueText({ kind, value_type: valueType, percent_off: pctN, amount_off_cents: amountCents, tiers: tiers.map((t) => ({ periods: t.periods, percent_off: t.percentOff })), intro_periods: Number(introPeriods) || 1 })}
            {" · "}{targets.length ? `${targets.length} offer${targets.length > 1 ? "s" : ""}` : "all offers"}
            {" · "}{startsOn === today ? "from today" : `from ${formatDateHN(startsOn)}`}
            {endsOn ? ` until ${formatDateHN(endsOn)}` : ""}.
            {" "}Promo codes don't add on top — the customer gets whichever is bigger. Renewals are at the full price.
          </p>
        </div>
      )}
    </ResponsiveDialog>
  );
}

/** What the customer sees on the card, and what the owner keeps — while they choose. */
function Preview({ sample, deal, kind, offCents, keep, commissionPct }: {
  sample: { name: string; cents: number; unit: string } | undefined;
  deal: ReturnType<typeof displayDiscount>; kind: DiscountKind; offCents: number;
  keep: (cents: number) => number; commissionPct: number;
}) {
  if (!sample) return null;
  const after = sample.cents - offCents;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-radius-md bg-inset p-3">
        <p className="text-meta font-semibold text-muted-foreground">Customers see</p>
        <div className="relative mt-2 h-16 rounded-radius-md bg-muted">
          <DealPill deal={deal} className="absolute left-2 top-2" />
        </div>
        <p className="mt-2 truncate text-body font-semibold text-foreground">{sample.name}</p>
        <DealPrice deal={deal} cents={sample.cents} unit={sample.unit ? `/ ${sample.unit}` : null} />
        <div><DealNote deal={deal} /></div>
      </div>
      <div className="rounded-radius-md bg-inset p-3">
        <p className="text-meta font-semibold text-muted-foreground">You get, per {kind === "prepay" ? `${sample.unit} at the deepest step` : sample.unit || "order"}</p>
        <p className="mt-2 text-[20px] font-bold tabular-nums text-foreground">{formatUSD(keep(after))}</p>
        <p className="text-meta text-muted-foreground">
          instead of {formatUSD(keep(sample.cents))} · after Prospera's {commissionPct}% fee
        </p>
        {kind === "intro" && <p className="mt-1 text-meta text-muted-foreground">Only on a new customer's first order — then full price.</p>}
      </div>
    </div>
  );
}
