import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * One plan, with its prices inside it.
 *
 * The first attempt at "same thing, several sizes" made six plans and a
 * separate Options screen that grouped them. Both halves were visible to the
 * provider, so the thing they sell as one product read as six tariffs plus a
 * merging tool — and the price of a combination was edited somewhere else
 * again, in whichever per-service plan list owned that row.
 *
 * This is the whole product on one screen: the plan's own name and
 * description once, the axes it varies along, and a price per combination.
 *
 * The six rows still exist underneath, because a paid subscription points at
 * one of them by id and always will. They are an index now, not a product:
 * created, priced and retired by this editor, never listed as tariffs. Prices
 * are written to the LEGACY row where there is one — the mirror trigger
 * carries the number into `provider_plans`, which keeps one writer per number
 * rather than two that drift.
 */

interface PlanRow {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  status: string;
  period: string | null;
  parent_plan_id: string | null;
  option_keys: Record<string, string> | null;
  source_plan_id: string | null;
  source_service_key: string | null;
}

interface DraftOption { key: string; label: string }
interface DraftGroup { id?: string; key: string; label: string; options: DraftOption[] }

/** "Meals per day" → "meals_per_day" — stable, readable, and what a row stores. */
const slug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

const comboKey = (groups: DraftGroup[], combo: Record<string, string>) =>
  groups.map((g) => `${g.key}=${combo[g.key] ?? ""}`).join("|");

const dollars = (cents: number) => (cents > 0 ? (cents / 100).toFixed(2) : "");
const cents = (text: string) => {
  const n = Math.round(Number(String(text).replace(/[^0-9.]/g, "")) * 100);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function OfferEditor({ providerId, sourceKey }: { providerId: string; sourceKey: string }) {
  const qc = useQueryClient();
  const KEY = ["offer-editor", providerId] as const;

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data: plans, error } = await supabaseDb
        .from("provider_plans")
        .select("id, name, description, price_cents, status, period, parent_plan_id, option_keys, source_plan_id, source_service_key")
        .eq("provider_id", providerId)
        .order("sort_order", { ascending: true });
      if (error) throw error;

      const rows = (plans ?? []) as PlanRow[];
      const offerIds = rows.filter((r) => !r.parent_plan_id).map((r) => r.id);
      const { data: groups } = offerIds.length
        ? await supabaseDb.from("plan_option_groups")
            .select("id, plan_id, key, label, sort_order")
            .in("plan_id", offerIds).order("sort_order", { ascending: true })
        : { data: [] as any[] };
      const groupIds = (groups ?? []).map((g: any) => g.id);
      const { data: options } = groupIds.length
        ? await supabaseDb.from("plan_options")
            .select("id, group_id, key, label, sort_order")
            .in("group_id", groupIds).order("sort_order", { ascending: true })
        : { data: [] as any[] };

      return { rows, groups: groups ?? [], options: options ?? [] };
    },
  });

  const rows = data?.rows ?? [];
  const offers = rows.filter((r) => !r.parent_plan_id);
  const [offerId, setOfferId] = useState("");
  useEffect(() => {
    if (offerId && offers.some((o) => o.id === offerId)) return;
    const withVariants = offers.find((o) => rows.some((r) => r.parent_plan_id === o.id));
    setOfferId((withVariants ?? offers[0])?.id ?? "");
  }, [rows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const offer = offers.find((o) => o.id === offerId) ?? null;
  const variants = rows.filter((r) => r.parent_plan_id === offerId);

  // ── Draft ─────────────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [draftGroups, setDraftGroups] = useState<DraftGroup[]>([]);
  /** combination fingerprint → dollars typed in the grid. */
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [newGroupLabel, setNewGroupLabel] = useState("");

  useEffect(() => {
    if (!offer || !data) return;
    setName(offer.name ?? "");
    setDescription(offer.description ?? "");
    const gs = (data.groups as any[]).filter((g) => g.plan_id === offer.id);
    const drafted: DraftGroup[] = gs.map((g) => ({
      id: g.id,
      key: g.key,
      label: g.label,
      options: (data.options as any[]).filter((o) => o.group_id === g.id)
        .map((o) => ({ key: String(o.key), label: o.label })),
    }));
    setDraftGroups(drafted);
    const seeded: Record<string, string> = {};
    rows.filter((r) => r.parent_plan_id === offer.id).forEach((v) => {
      seeded[comboKey(drafted, (v.option_keys ?? {}) as Record<string, string>)] = dollars(v.price_cents);
    });
    if (!drafted.length) seeded[""] = dollars(offer.price_cents);
    setPrices(seeded);
  }, [offerId, data]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Every combination the axes allow, in the order the customer will see them.
   *
   * No axes is not an empty list — it is ONE combination, the empty one. A
   * plain plan with a single price and a sized plan with six are then the same
   * shape, and the editor needs no second mode for "simple".
   */
  const combos = useMemo(() => {
    if (!draftGroups.length) return [{}];
    if (draftGroups.some((g) => !g.options.length)) return [];
    return draftGroups.reduce<Array<Record<string, string>>>(
      (acc, g) => acc.flatMap((base) => g.options.map((o) => ({ ...base, [g.key]: o.key }))),
      [{}],
    );
  }, [draftGroups]);

  const variantByCombo = useMemo(() => {
    const map = new Map<string, PlanRow>();
    variants.forEach((v) => map.set(comboKey(draftGroups, (v.option_keys ?? {}) as Record<string, string>), v));
    // A plan with no axes prices ITSELF — there is no child row to hold the
    // number, and inventing one would put a second plan in every list that
    // reads them.
    if (!draftGroups.length && offer) map.set("", offer);
    return map;
  }, [variants, draftGroups, offer]);

  const priced = combos.filter((c) => cents(prices[comboKey(draftGroups, c)] ?? "") > 0);
  const fromCents = priced.length
    ? Math.min(...priced.map((c) => cents(prices[comboKey(draftGroups, c)] ?? "")))
    : 0;

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async () => {
      if (!offer) throw new Error("Nothing to save yet.");
      if (!name.trim()) throw new Error("The plan needs a name.");
      if (!priced.length) throw new Error(draftGroups.length
        ? "Give at least one combination a price."
        : "Give the plan a price.");

      // 1. The plan's own fields, written wherever that plan actually lives.
      await writePlanFields(offer, name.trim(), description.trim() || null, sourceKey);
      // A plan is created as a draft so a nameless $0 row never reaches the
      // storefront. Pricing it is what puts it on sale.
      if (offer.status !== "active") await writeStatus(offer, "active", sourceKey);

      // 2. Axes, rewritten wholesale. The set is small and a diff would have to
      //    reason about a renamed key that priced rows still point at.
      const existing = (data?.groups as any[]).filter((g) => g.plan_id === offer.id);
      const keep = new Set(draftGroups.map((g) => g.key));
      const removable = existing.filter((g) => !keep.has(g.key)).map((g) => g.id);
      if (removable.length) {
        const { error } = await supabaseDb.from("plan_option_groups").delete().in("id", removable);
        if (error) throw error;
      }
      for (const [index, group] of draftGroups.entries()) {
        const match = existing.find((g) => g.key === group.key);
        let groupId = match?.id as string | undefined;
        if (groupId) {
          const { error } = await supabaseDb.from("plan_option_groups")
            .update({ label: group.label, sort_order: index }).eq("id", groupId);
          if (error) throw error;
        } else {
          const { data: created, error } = await supabaseDb.from("plan_option_groups")
            .insert({ plan_id: offer.id, key: group.key, label: group.label, sort_order: index })
            .select("id").single();
          if (error) throw error;
          groupId = created.id;
        }
        const { error: delErr } = await supabaseDb.from("plan_options").delete().eq("group_id", groupId);
        if (delErr) throw delErr;
        if (group.options.length) {
          const { error: optErr } = await supabaseDb.from("plan_options").insert(
            group.options.map((o, i) => ({ group_id: groupId, key: o.key, label: o.label, sort_order: i })),
          );
          if (optErr) throw optErr;
        }
      }

      // 3. Prices, one combination at a time.
      for (const [index, combo] of combos.entries()) {
        const fingerprint = comboKey(draftGroups, combo);
        const amount = cents(prices[fingerprint] ?? "");
        const variant = variantByCombo.get(fingerprint);

        if (variant) {
          if (amount > 0) {
            await writePrice(variant, amount, sourceKey);
            // Keep the binding current — an axis renamed above would otherwise
            // leave this row answering for a combination that no longer exists.
            // Except when the row IS the plan: a plan with no choices prices
            // itself, and making it its own parent would hide it from every
            // list that asks for top-level plans.
            if (variant.id !== offer.id) {
              const { error } = await supabaseDb.from("provider_plans")
                .update({ option_keys: combo, parent_plan_id: offer.id }).eq("id", variant.id);
              if (error) throw error;
            }
          } else if (variant.id !== offer.id) {
            // Cleared, not deleted: somebody may be subscribed to it. Off sale
            // is a status, and the row keeps answering for their subscription.
            await writeStatus(variant, "inactive", sourceKey);
          }
          continue;
        }

        if (amount <= 0) continue;
        const created = await createVariant({
          offer, providerId, sourceKey, combo, groups: draftGroups, amount, sortOrder: index,
        });
        if (created) {
          const { error } = await supabaseDb.from("provider_plans")
            .update({ parent_plan_id: offer.id, option_keys: combo }).eq("id", created);
          if (error) throw error;
        }
      }

      // 4. Variants whose combination the axes no longer allow.
      const live = new Set(combos.map((c) => comboKey(draftGroups, c)));
      for (const v of variants) {
        const fingerprint = comboKey(draftGroups, (v.option_keys ?? {}) as Record<string, string>);
        if (!live.has(fingerprint) && v.status === "active") await writeStatus(v, "inactive", sourceKey);
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["plan-offers"] });
      qc.invalidateQueries({ queryKey: ["food-meal-plans"] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't save"),
  });

  /**
   * A second plan, a third, a tenth.
   *
   * It starts as a universal row with no choices and no price — the editor
   * opens on it immediately and the provider fills it in. For a legacy-backed
   * service the row that a subscription will point at is created on the first
   * save, by the same path a new combination takes, so there is one way a
   * sellable row comes into existence rather than two.
   */
  const addPlan = useMutation({
    mutationFn: async () => {
      const id = await createPlanRow({
        providerId, sourceKey, name: "New plan", amount: 0,
        sortOrder: offers.length, period: offers[0]?.period ?? null, draft: true,
      });
      if (!id) throw new Error("The plan was created but could not be opened — reload the page.");
      return id;
    },
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: KEY });
      setOfferId(id);
      toast.success("Plan added — name it and set its price");
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't add the plan"),
  });

  const archive = useMutation({
    mutationFn: async (status: "active" | "inactive") => {
      if (!offer) return;
      await writeStatus(offer, status, sourceKey);
    },
    onSuccess: (_d, status) => {
      toast.success(status === "active" ? "Back on sale" : "Taken off sale");
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["plan-offers"] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't change the plan"),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!offer) {
    return (
      <div className="space-y-3 rounded-2xl bg-card p-6">
        <p className="text-sm text-muted-foreground">
          This business sells nothing yet. A plan is one product: a name, whatever the customer
          gets to choose, and a price for each way of choosing it.
        </p>
        <Button className="gap-1.5 rounded-full" disabled={addPlan.isPending} onClick={() => addPlan.mutate()}>
          <Plus className="h-4 w-4" /> {addPlan.isPending ? "Adding…" : "Add the first plan"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Every plan this business sells. A provider is not limited to one —
          each is its own product with its own choices and prices. */}
      <div className="flex flex-wrap items-center gap-2">
        {offers.map((o) => (
          <button key={o.id} type="button" onClick={() => setOfferId(o.id)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
              o.id === offerId ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:text-foreground",
            )}>
            {o.name}
            {o.status !== "active" && <span className="ml-1.5 text-[10px] uppercase opacity-70">off</span>}
          </button>
        ))}
        <Button variant="outline" size="sm" className="gap-1.5 rounded-full"
          disabled={addPlan.isPending} onClick={() => addPlan.mutate()}>
          <Plus className="h-4 w-4" /> {addPlan.isPending ? "Adding…" : "New plan"}
        </Button>
      </div>

      <section className="space-y-3 rounded-2xl bg-card p-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">The plan</p>
        <div>
          <Label className="text-xs">Name</Label>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Textarea className="mt-1" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">
          {draftGroups.length
            ? <>Customers see one card. Its price shows as “from {fromCents ? formatUSD(fromCents) : "—"}”, the cheapest combination below.</>
            : <>Customers see one card at {fromCents ? formatUSD(fromCents) : "—"}.</>}
        </p>
      </section>

      <section className="space-y-3 rounded-2xl bg-card p-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">What the customer chooses</p>
        {draftGroups.map((group, gi) => (
          <div key={group.key} className="rounded-radius-md bg-inset p-3">
            <div className="flex items-center gap-2">
              <Input
                value={group.label}
                onChange={(e) => setDraftGroups((gs) => gs.map((g, i) => i === gi ? { ...g, label: e.target.value } : g))}
                className="h-9 max-w-xs font-semibold"
              />
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                onClick={() => setDraftGroups((gs) => gs.filter((_, i) => i !== gi))}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {group.options.map((option, oi) => (
                <span key={option.key} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
                  {option.label}
                  <button type="button" aria-label={`Remove ${option.label}`}
                    onClick={() => setDraftGroups((gs) => gs.map((g, i) =>
                      i === gi ? { ...g, options: g.options.filter((_, j) => j !== oi) } : g))}>
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </span>
              ))}
              <AddValue onAdd={(label) => setDraftGroups((gs) => gs.map((g, i) =>
                i === gi ? { ...g, options: [...g.options, { key: slug(label), label }] } : g))} />
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input value={newGroupLabel} onChange={(e) => setNewGroupLabel(e.target.value)}
            placeholder="Add a choice — size, days per week…" className="h-9 max-w-xs" />
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full"
            disabled={!newGroupLabel.trim()}
            onClick={() => {
              setDraftGroups((gs) => [...gs, { key: slug(newGroupLabel), label: newGroupLabel.trim(), options: [] }]);
              setNewGroupLabel("");
            }}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl bg-card p-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Prices</p>
        {combos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Give every choice at least one value to price it.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {combos.map((combo) => {
              const fingerprint = comboKey(draftGroups, combo);
              const label = draftGroups.length
                ? draftGroups
                    .map((g) => g.options.find((o) => o.key === combo[g.key])?.label ?? combo[g.key])
                    .join(" · ")
                : "Price";
              return (
                <li key={fingerprint} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="text-sm font-semibold text-foreground">{label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Input
                      inputMode="decimal"
                      value={prices[fingerprint] ?? ""}
                      onChange={(e) => setPrices((p) => ({ ...p, [fingerprint]: e.target.value }))}
                      placeholder="—"
                      className="h-9 w-28 text-right tabular-nums"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {draftGroups.length
            ? "Leave a price empty to take that combination off sale. Nothing is deleted — anyone already subscribed to it keeps their plan."
            : "One price, because this plan has no choices yet. Add one above and it becomes a price per combination."}
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button className="rounded-full" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save plan"}
        </Button>
        {/* Off sale, not deleted: somebody may be subscribed to it, and a plan
            that vanishes takes their subscription's name with it. */}
        <Button variant="ghost" className="rounded-full text-muted-foreground"
          disabled={archive.isPending}
          onClick={() => archive.mutate(offer.status === "active" ? "inactive" : "active")}>
          {offer.status === "active" ? "Take off sale" : "Put back on sale"}
        </Button>
      </div>
    </div>
  );
}

function AddValue({ onAdd }: { onAdd: (label: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <span className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !value.trim()) return;
          e.preventDefault();
          onAdd(value.trim());
          setValue("");
        }}
        placeholder="Add a value"
        className="h-8 w-36 rounded-full text-sm"
      />
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!value.trim()}
        onClick={() => { onAdd(value.trim()); setValue(""); }}>
        <Plus className="h-4 w-4" />
      </Button>
    </span>
  );
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/**
 * Name and description go where that plan lives.
 *
 * An offer built for a set of variants is a universal row with no legacy twin,
 * and `provider_plans` is the only place its fields exist. But a plan that IS
 * a mirror of a legacy row must be written there: the mirror trigger runs one
 * way, so a universal-side edit would be overwritten by the next legacy write
 * and would never reach the storefront, which still reads the legacy row.
 */
async function writePlanFields(offer: PlanRow, name: string, description: string | null, sourceKey: string) {
  if (offer.source_plan_id && sourceKey === "food") {
    const { error } = await supabaseDb.from("food_meal_plans")
      .update({ name, description, updated_at: new Date().toISOString() })
      .eq("id", offer.source_plan_id);
    if (error) throw error;
    return;
  }
  if (offer.source_plan_id && sourceKey === "cleaning") {
    const { error } = await supabaseDb.from("cleaning_packages")
      .update({ name, description, updated_at: new Date().toISOString() })
      .eq("id", offer.source_plan_id);
    if (error) throw error;
    return;
  }
  const { error } = await supabaseDb.from("provider_plans")
    .update({ name, description, updated_at: new Date().toISOString() })
    .eq("id", offer.id);
  if (error) throw error;
}
// One writer per number: where a legacy row exists it owns the price, and the
// mirror trigger carries it into `provider_plans`. Writing both would be two
// sources of truth for the same figure.

async function writePrice(variant: PlanRow, amount: number, sourceKey: string) {
  if (variant.source_plan_id && sourceKey === "food") {
    const { error } = await supabaseDb.from("food_meal_plans")
      .update({ weekly_price_cents: amount, updated_at: new Date().toISOString() })
      .eq("id", variant.source_plan_id);
    if (error) throw error;
    return;
  }
  if (variant.source_plan_id && sourceKey === "cleaning") {
    // Cleaning prices either monthly or per cleaning; write whichever column
    // that package is actually priced by, or the monthly one by default.
    const { data: pkg } = await supabaseDb.from("cleaning_packages")
      .select("pricing_mode, cleanings_per_month").eq("id", variant.source_plan_id).maybeSingle();
    const perCleaning = pkg?.pricing_mode === "price_per_cleaning";
    const per = Math.max(1, Number(pkg?.cleanings_per_month ?? 1));
    const patch = perCleaning
      ? { price_per_cleaning_cents: Math.round(amount / per) }
      : { monthly_price_cents: amount };
    const { error } = await supabaseDb.from("cleaning_packages")
      .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", variant.source_plan_id);
    if (error) throw error;
    return;
  }
  const { error } = await supabaseDb.from("provider_plans")
    .update({ price_cents: amount, updated_at: new Date().toISOString() }).eq("id", variant.id);
  if (error) throw error;
}

/**
 * A sellable row that did not exist before — a new plan, or a new combination
 * of an existing one. Both are the same act: for a legacy-backed service the
 * row must exist in the legacy table, because that is the id a subscription
 * will carry. The mirror trigger then writes the universal row, which this
 * returns so the caller can name or bind it.
 *
 * A `draft` is created off sale. A plan the provider has not priced yet must
 * not appear on the storefront at $0 while they are still typing.
 */
async function createPlanRow(input: {
  providerId: string;
  sourceKey: string;
  name: string;
  amount: number;
  sortOrder: number;
  period?: string | null;
  draft?: boolean;
  /** Fills the legacy columns a food plan needs when the axes are numeric. */
  numeric?: (key: string) => number | null;
}): Promise<string | null> {
  const { providerId, sourceKey, name, amount, sortOrder, period, draft } = input;
  const status = draft ? "inactive" : "active";
  const numeric = input.numeric ?? (() => null);

  if (sourceKey === "food") {
    const { data: provider } = await supabaseDb.from("providers")
      .select("source_provider_id").eq("id", providerId).maybeSingle();
    const legacyProvider = provider?.source_provider_id;
    if (!legacyProvider) throw new Error("This restaurant has no legacy record to add a plan to.");
    const days = numeric("days") ?? numeric("days_per_week") ?? 5;
    const meals = numeric("meals_per_day") ?? numeric("meals") ?? 1;
    const { data: created, error } = await supabaseDb.from("food_meal_plans").insert({
      provider_id: legacyProvider,
      name,
      weekly_price_cents: amount,
      days_per_week: days,
      meals_per_day: meals,
      meals_per_week: days * meals,
      status,
      sort_order: sortOrder,
    }).select("id").single();
    if (error) throw error;
    return findMirror("food", created.id);
  }

  if (sourceKey === "cleaning") {
    // `pricing_mode` and `frequency_*` are CHECK-constrained: only four modes
    // are legal, and a non-custom frequency must carry a count above zero.
    // A plain insert without them is rejected by the table, not by the UI.
    const { data: created, error } = await supabaseDb.from("cleaning_packages").insert({
      owner_provider_id: providerId,
      name,
      monthly_price_cents: amount,
      pricing_mode: "fixed_monthly_price",
      frequency_unit: "month",
      frequency_count: 1,
      status,
      sort_order: sortOrder,
    }).select("id").single();
    if (error) throw error;
    return findMirror("cleaning", String(created.id));
  }

  const { data: created, error } = await supabaseDb.from("provider_plans").insert({
    provider_id: providerId,
    name,
    price_cents: amount,
    period: period ?? "monthly",
    currency: "USD",
    status,
    sort_order: sortOrder,
  }).select("id").single();
  if (error) throw error;
  return String(created.id);
}

/** One combination of an existing plan, named after the choices it is. */
async function createVariant(input: {
  offer: PlanRow;
  providerId: string;
  sourceKey: string;
  combo: Record<string, string>;
  groups: DraftGroup[];
  amount: number;
  sortOrder: number;
}): Promise<string | null> {
  const { offer, providerId, sourceKey, combo, groups, amount, sortOrder } = input;
  const label = groups
    .map((g) => g.options.find((o) => o.key === combo[g.key])?.label ?? combo[g.key])
    .join(" · ");
  return createPlanRow({
    providerId,
    sourceKey,
    name: label ? `${offer.name} — ${label}` : offer.name,
    amount,
    sortOrder,
    period: offer.period,
    /** An axis whose values are numbers can fill the legacy column of the same name. */
    numeric: (groupKey: string) => {
      const n = Number(combo[groupKey]);
      return Number.isFinite(n) && n > 0 ? n : null;
    },
  });
}

/** Status goes where the plan lives — the mirror carries a legacy change back. */
async function writeStatus(plan: PlanRow, status: "active" | "inactive", sourceKey: string) {
  if (plan.source_plan_id && sourceKey === "food") {
    const { error } = await supabaseDb.from("food_meal_plans")
      .update({ status, updated_at: new Date().toISOString() }).eq("id", plan.source_plan_id);
    if (error) throw error;
    return;
  }
  if (plan.source_plan_id && sourceKey === "cleaning") {
    const { error } = await supabaseDb.from("cleaning_packages")
      .update({ status, updated_at: new Date().toISOString() }).eq("id", plan.source_plan_id);
    if (error) throw error;
    return;
  }
  const { error } = await supabaseDb.from("provider_plans")
    .update({ status, updated_at: new Date().toISOString() }).eq("id", plan.id);
  if (error) throw error;
}

/** The universal row the mirror trigger just wrote for a legacy insert. */
async function findMirror(service: string, sourcePlanId: string): Promise<string | null> {
  const { data } = await supabaseDb.from("provider_plans")
    .select("id").eq("source_service_key", service).eq("source_plan_id", sourcePlanId).maybeSingle();
  return data?.id ? String(data.id) : null;
}
