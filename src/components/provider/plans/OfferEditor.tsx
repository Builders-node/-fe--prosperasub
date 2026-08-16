import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { supabaseDb } from "@/integrations/supabase/client";
import { GalleryField } from "@/components/patterns/GalleryField";
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
  pricing_mode: string | null;
  fulfilment: string | null;
  included_unit: string | null;
  included_quantity: number | null;
  periods_default: number | null;
  periods_min: number | null;
  periods_max: number | null;
  provider_price_cents: number | null;
  markup_cents: number | null;
  lead_time_minutes: number | null;
  window_minutes: number | null;
  features: unknown;
  excludes: unknown;
  tags: string[] | null;
  gallery_urls: string[] | null;
}

interface DraftOption { key: string; label: string }
interface DraftGroup { id?: string; key: string; label: string; options: DraftOption[] }

/** "Meals per day" → "meals_per_day" — stable, readable, and what a row stores. */
const slug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

const comboKey = (groups: DraftGroup[], combo: Record<string, string>) =>
  groups.map((g) => `${g.key}=${combo[g.key] ?? ""}`).join("|");

const dollars = (cents: number) => (cents > 0 ? (cents / 100).toFixed(2) : "");

/** A jsonb list of strings ⇄ one item per line, which is how a provider types. */
const asLines = (value: unknown): string =>
  Array.isArray(value) ? value.map((v) => String(v)).join("\n") : "";
const fromLines = (text: string): string[] =>
  text.split("\n").map((l) => l.trim()).filter(Boolean);
const numOrNull = (text: string): number | null => {
  const n = Number(String(text).trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const cents = (text: string) => {
  const n = Math.round(Number(String(text).replace(/[^0-9.]/g, "")) * 100);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function OfferEditor({ providerId, sourceKey, planId, onSaved, onDelete }: {
  providerId: string;
  sourceKey: string;
  /**
   * Edit exactly this plan, with no picker of its own.
   *
   * The editor grew up as the whole Offerings tab and therefore carried its
   * own list of plans. Mounted in a sheet opened FROM a list, that second list
   * is the same choice offered twice.
   */
  planId?: string;
  /** Called after a successful save — the sheet closes on it. */
  onSaved?: () => void;
  /**
   * Ask to delete this plan. Deleting belongs with everything else about a
   * plan rather than on the card in the list, where it sat one thumb-width
   * from Edit with nothing but an icon to tell them apart.
   */
  onDelete?: () => void;
}) {
  const qc = useQueryClient();
  const KEY = ["offer-editor", providerId] as const;

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data: plans, error } = await supabaseDb
        .from("provider_plans")
        .select("*")
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

      // Attributes live on the LEGACY row for every service that has one, and
      // that is where the storefront reads them. Seeding the editor from the
      // universal mirror instead would show an empty list and then save it
      // over the real one — the beach club's six amenities would have gone on
      // the first save.
      const legacyAttrs = new Map<string, { features: unknown; excludes: unknown; tags: string[] }>();
      const twinned = rows.filter((r) => r.source_plan_id);
      for (const row of twinned) {
        const id = row.source_plan_id!;
        if (row.source_service_key === "food") {
          const { data } = await supabaseDb.from("food_meal_plans")
            .select("highlights, dietary_tags").eq("id", id).maybeSingle();
          legacyAttrs.set(row.id, { features: data?.highlights ?? [], excludes: [], tags: data?.dietary_tags ?? [] });
        } else if (row.source_service_key === "cleaning") {
          const { data } = await supabaseDb.from("cleaning_packages")
            .select("features, not_included").eq("id", id).maybeSingle();
          legacyAttrs.set(row.id, { features: data?.features ?? [], excludes: data?.not_included ?? [], tags: [] });
        } else if (row.source_service_key === "beach") {
          const { data } = await supabaseDb.from("beach_club_plans")
            .select("amenities").eq("id", id).maybeSingle();
          legacyAttrs.set(row.id, { features: data?.amenities ?? [], excludes: [], tags: [] });
        }
      }

      return { rows, groups: groups ?? [], options: options ?? [], legacyAttrs };
    },
  });

  const rows = data?.rows ?? [];
  const offers = rows.filter((r) => !r.parent_plan_id);
  const [pickedId, setPickedId] = useState("");
  const offerId = planId ?? pickedId;
  const setOfferId = setPickedId;
  useEffect(() => {
    if (planId) return;
    if (pickedId && offers.some((o) => o.id === pickedId)) return;
    const withVariants = offers.find((o) => rows.some((r) => r.parent_plan_id === o.id));
    setPickedId((withVariants ?? offers[0])?.id ?? "");
  }, [rows.length, planId]); // eslint-disable-line react-hooks/exhaustive-deps

  const offer = offers.find((o) => o.id === offerId) ?? null;
  const variants = rows.filter((r) => r.parent_plan_id === offerId);

  // ── Draft ─────────────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [draftGroups, setDraftGroups] = useState<DraftGroup[]>([]);
  /** combination fingerprint → dollars typed in the grid. */
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [newGroupLabel, setNewGroupLabel] = useState("");
  /** The switches — what this plan IS, rather than what it is called. */
  const [sold, setSold] = useState({
    period: "monthly", unit: "", quantity: "",
    periodsDefault: "1", periodsMin: "1", periodsMax: "",
    pricingMode: "flat", providerPrice: "", markup: "",
    leadMinutes: "", windowMinutes: "",
  });
  const [includes, setIncludes] = useState({ features: "", excludes: "", tags: "" });
  /**
   * The plan's own photographs.
   *
   * They live on `provider_plans.gallery_urls` whatever service sells the
   * plan — the mirror trigger never touches that column, so a legacy plan's
   * pictures survive every later edit of its legacy row. Same place the plan
   * page and the storefront card read them from.
   */
  const [gallery, setGallery] = useState<string[]>([]);

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

    setSold({
      period: offer.period ?? "monthly",
      unit: offer.included_unit ?? "",
      quantity: offer.included_quantity != null ? String(offer.included_quantity) : "",
      periodsDefault: String(offer.periods_default ?? 1),
      periodsMin: String(offer.periods_min ?? 1),
      periodsMax: offer.periods_max != null ? String(offer.periods_max) : "",
      pricingMode: offer.pricing_mode ?? "flat",
      providerPrice: dollars(offer.provider_price_cents ?? 0),
      markup: dollars(offer.markup_cents ?? 0),
      leadMinutes: offer.lead_time_minutes != null ? String(offer.lead_time_minutes) : "",
      windowMinutes: offer.window_minutes != null ? String(offer.window_minutes) : "",
    });
    setGallery(Array.isArray(offer.gallery_urls) ? offer.gallery_urls.filter(Boolean) : []);
    const attrs = data.legacyAttrs?.get(offer.id);
    setIncludes({
      features: asLines(attrs ? attrs.features : offer.features),
      excludes: asLines(attrs ? attrs.excludes : offer.excludes),
      tags: (attrs ? attrs.tags : (offer.tags ?? [])).join(", "),
    });
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

      // 1b. The switches. These live only on `provider_plans` — no legacy
      //     table has a column for "how is this sold" — except the two
      //     attribute lists, which the storefront still reads from the legacy
      //     row, so those are written there as well (see writeAttributes).
      const { error: switchErr } = await supabaseDb.from("provider_plans").update({
        period: sold.period,
        included_unit: sold.unit.trim() || null,
        included_quantity: numOrNull(sold.quantity),
        periods_default: numOrNull(sold.periodsDefault) ?? 1,
        periods_min: numOrNull(sold.periodsMin) ?? 1,
        periods_max: numOrNull(sold.periodsMax),
        pricing_mode: sold.pricingMode,
        provider_price_cents: cents(sold.providerPrice) || null,
        markup_cents: cents(sold.markup) || null,
        lead_time_minutes: numOrNull(sold.leadMinutes),
        window_minutes: numOrNull(sold.windowMinutes),
        tags: fromLines(includes.tags.replace(/,/g, "\n")),
        excludes: fromLines(includes.excludes),
        features: fromLines(includes.features),
        gallery_urls: gallery,
        updated_at: new Date().toISOString(),
      }).eq("id", offer.id);
      if (switchErr) throw switchErr;

      await writeAttributes(offer, sourceKey, fromLines(includes.features), fromLines(includes.excludes), fromLines(includes.tags.replace(/,/g, "\n")));

      // A derived price is two numbers the customer never sees separately.
      // The beach club has held them on its own row since before any of this,
      // and its checkout still reads them there.
      if (sourceKey === "beach" && offer.source_plan_id && (sold.providerPrice || sold.markup)) {
        const { error } = await supabaseDb.from("beach_club_plans").update({
          provider_price_per_person_cents: cents(sold.providerPrice),
          extra_per_person_cents: cents(sold.markup),
          updated_at: new Date().toISOString(),
        }).eq("id", offer.source_plan_id);
        if (error) throw error;
      }
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
      onSaved?.();
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
  if (!offer && planId) {
    return (
      <div className="rounded-radius-lg bg-card p-6 text-[16px] leading-[22px] text-muted-foreground">
        This plan is no longer here. It may have been deleted in another window.
      </div>
    );
  }
  if (!offer) {
    return (
      <div className="space-y-3 rounded-radius-lg bg-card p-6 tracking-[-0.02em]">
        <p className="text-[16px] leading-[22px] text-muted-foreground">
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
      {/* Every plan this business sells — only when nobody outside has already
          chosen one. Opened from a plan card, the card WAS the choice. */}
      <div className={cn("flex flex-wrap items-center gap-2", planId && "hidden")}>
        {offers.map((o) => (
          <button key={o.id} type="button" onClick={() => setOfferId(o.id)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
              o.id === offerId ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:text-foreground",
            )}>
            {o.name}
            {o.status !== "active" && <span className="ml-1.5 text-[12px] opacity-70">off</span>}
          </button>
        ))}
        <Button variant="outline" size="sm" className="gap-1.5 rounded-full"
          disabled={addPlan.isPending} onClick={() => addPlan.mutate()}>
          <Plus className="h-4 w-4" /> {addPlan.isPending ? "Adding…" : "New plan"}
        </Button>
      </div>

      <section className="space-y-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
        <p className="text-[20px] font-semibold leading-[26px] text-foreground">The plan</p>
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

      <section className="space-y-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
        <p className="text-[20px] font-semibold leading-[26px] text-foreground">Photographs</p>
        <GalleryField
          label=""
          value={gallery}
          onChange={setGallery}
          pathPrefix="plans/gallery"
          max={8}
        />
        <p className="text-[14px] leading-[18px] text-muted-foreground">
          The first one is the picture on this plan's card. Saved with the plan.
        </p>
      </section>

      <section className="space-y-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
        <p className="text-[20px] font-semibold leading-[26px] text-foreground">How it's sold</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Billed every">
            <select value={sold.period} onChange={(e) => setSold((v) => ({ ...v, period: e.target.value }))}
              className="h-9 w-full rounded-radius-md bg-inset px-3 text-sm text-foreground outline-none">
              {["weekly", "monthly", "quarterly", "yearly"].map((p) => (
                <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </Field>
          <Field label="Price is" hint={PRICING_HINT[sold.pricingMode] ?? ""}>
            <select value={sold.pricingMode} onChange={(e) => setSold((v) => ({ ...v, pricingMode: e.target.value }))}
              className="h-9 w-full rounded-radius-md bg-inset px-3 text-sm text-foreground outline-none">
              <option value="flat">Flat</option>
              <option value="per_unit">Per unit</option>
              <option value="per_person">Per person</option>

            </select>
          </Field>

          {/* Independent of the mode above: a per-person price can also be a
              marked-up one, which is exactly what the beach club is. Filling
              these in is what makes a price derived. */}
          {(sold.providerPrice || sold.markup || sold.pricingMode === "derived") && (
            <>
              <Field label="Provider is paid ($)">
                <Input inputMode="decimal" className="h-9" value={sold.providerPrice}
                  onChange={(e) => setSold((v) => ({ ...v, providerPrice: e.target.value }))} />
              </Field>
              <Field label="Platform adds ($)">
                <Input inputMode="decimal" className="h-9" value={sold.markup}
                  onChange={(e) => setSold((v) => ({ ...v, markup: e.target.value }))} />
              </Field>
            </>
          )}

          <Field label="What is counted" hint="cleaning · meal · session">
            <Input className="h-9" value={sold.unit} placeholder="cleaning"
              onChange={(e) => setSold((v) => ({ ...v, unit: e.target.value }))} />
          </Field>
          <Field label="How many per period">
            <Input inputMode="numeric" className="h-9" value={sold.quantity} placeholder="4"
              onChange={(e) => setSold((v) => ({ ...v, quantity: e.target.value }))} />
          </Field>

          <Field label="Periods offered by default">
            <Input inputMode="numeric" className="h-9" value={sold.periodsDefault}
              onChange={(e) => setSold((v) => ({ ...v, periodsDefault: e.target.value }))} />
          </Field>
          <Field label="Fewest / most they may buy">
            <div className="flex items-center gap-2">
              <Input inputMode="numeric" className="h-9" value={sold.periodsMin}
                onChange={(e) => setSold((v) => ({ ...v, periodsMin: e.target.value }))} />
              <span className="text-muted-foreground">–</span>
              <Input inputMode="numeric" className="h-9" value={sold.periodsMax} placeholder="no limit"
                onChange={(e) => setSold((v) => ({ ...v, periodsMax: e.target.value }))} />
            </div>
          </Field>

          {offer.fulfilment === "deliveries" && (
            <>
              <Field label="Arrives after (minutes from midnight)" hint="600 = 10:00">
                <Input inputMode="numeric" className="h-9" value={sold.leadMinutes} placeholder="660"
                  onChange={(e) => setSold((v) => ({ ...v, leadMinutes: e.target.value }))} />
              </Field>
              <Field label="Window width (minutes)" hint="120 = a two-hour promise">
                <Input inputMode="numeric" className="h-9" value={sold.windowMinutes} placeholder="120"
                  onChange={(e) => setSold((v) => ({ ...v, windowMinutes: e.target.value }))} />
              </Field>
            </>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
        <p className="text-[20px] font-semibold leading-[26px] text-foreground">What they get</p>
        <Field label="Included" hint="One per line — shown on the plan page.">
          <Textarea rows={4} value={includes.features}
            onChange={(e) => setIncludes((v) => ({ ...v, features: e.target.value }))}
            placeholder={"Full apartment cleaning\nBathroom and kitchen"} />
        </Field>
        <Field label="Not included" hint="One per line.">
          <Textarea rows={3} value={includes.excludes}
            onChange={(e) => setIncludes((v) => ({ ...v, excludes: e.target.value }))}
            placeholder={"Windows from outside\nLaundry"} />
        </Field>
        <Field label="Tags" hint="Comma separated — what a customer can filter by.">
          <Input value={includes.tags} placeholder="vegetarian, keto"
            onChange={(e) => setIncludes((v) => ({ ...v, tags: e.target.value }))} />
        </Field>
      </section>

      <section className="space-y-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
        <p className="text-[20px] font-semibold leading-[26px] text-foreground">What the customer chooses</p>
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

      <section className="space-y-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
        <p className="text-[20px] font-semibold leading-[26px] text-foreground">Prices</p>
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
        {onDelete && (
          <Button variant="ghost" className="ml-auto rounded-full text-destructive hover:text-destructive"
            onClick={onDelete}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete plan
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * A new, unpriced, off-sale plan — the row a list's "New plan" button needs
 * before it can open the editor on something.
 *
 * Off sale on purpose: a plan nobody has priced yet must not appear on the
 * storefront at $0 while its owner is still typing.
 */
export async function createDraftPlan(input: {
  providerId: string; sourceKey: string; sortOrder: number; name?: string;
}): Promise<string> {
  const id = await createPlanRow({
    providerId: input.providerId,
    sourceKey: input.sourceKey,
    name: input.name ?? "New plan",
    amount: 0,
    sortOrder: input.sortOrder,
    draft: true,
  });
  if (!id) throw new Error("The plan was created but could not be opened — reload the page.");
  return id;
}

/** How each pricing mode reads to the person picking it. */
const PRICING_HINT: Record<string, string> = {
  flat: "One price for the period.",
  per_unit: "Price × how many they take.",
  per_person: "Price × people on the booking.",

};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[14px] font-normal text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[14px] leading-[18px] text-muted-foreground">{hint}</p>}
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
  if (offer.source_plan_id && sourceKey === "beach") {
    // The beach club calls a plan's description its tagline.
    const { error } = await supabaseDb.from("beach_club_plans")
      .update({ name, tagline: description, updated_at: new Date().toISOString() })
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
  if (variant.source_plan_id && sourceKey === "beach") {
    // Per person, per month. Where the plan is `derived`, this is the total
    // the customer pays; the two halves it is made of are written beside it
    // by the switches, so the row can never say one thing and mean another.
    const { error } = await supabaseDb.from("beach_club_plans")
      .update({ price_per_person_cents: amount, updated_at: new Date().toISOString() })
      .eq("id", variant.source_plan_id);
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

  if (sourceKey === "beach") {
    const { data: created, error } = await supabaseDb.from("beach_club_plans").insert({
      owner_provider_id: providerId,
      name,
      price_per_person_cents: amount,
      is_active: !draft,
      sort_order: sortOrder,
    }).select("id").single();
    if (error) throw error;
    return findMirror("beach", String(created.id));
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

/**
 * "What you get" and "what you do not", written where the storefront reads it.
 *
 * The plan page takes `features` from `cleaning_packages`, `amenities` from
 * `beach_club_plans` and `provider_plans.features` for a universal plan — so
 * writing only the universal row would mean a provider types a list and no
 * customer ever sees it. Food's `highlights` was the odd one out: the column
 * existed and the plan page ignored it, which is fixed alongside this.
 */
async function writeAttributes(
  plan: PlanRow, sourceKey: string, features: string[], excludes: string[], tags: string[],
) {
  if (plan.source_plan_id && sourceKey === "food") {
    const { error } = await supabaseDb.from("food_meal_plans")
      .update({ highlights: features, dietary_tags: tags, updated_at: new Date().toISOString() })
      .eq("id", plan.source_plan_id);
    if (error) throw error;
    return;
  }
  if (plan.source_plan_id && sourceKey === "cleaning") {
    const { error } = await supabaseDb.from("cleaning_packages")
      .update({ features, not_included: excludes, updated_at: new Date().toISOString() })
      .eq("id", plan.source_plan_id);
    if (error) throw error;
    return;
  }
  if (plan.source_plan_id && sourceKey === "beach") {
    const { error } = await supabaseDb.from("beach_club_plans")
      .update({ amenities: features, updated_at: new Date().toISOString() })
      .eq("id", plan.source_plan_id);
    if (error) throw error;
  }
  // A universal plan already had them written to `provider_plans` above.
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
  if (plan.source_plan_id && sourceKey === "beach") {
    // Beach has no `status` column — being on sale is a boolean there.
    const { error } = await supabaseDb.from("beach_club_plans")
      .update({ is_active: status === "active", updated_at: new Date().toISOString() })
      .eq("id", plan.source_plan_id);
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
