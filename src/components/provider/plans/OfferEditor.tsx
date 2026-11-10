import { fieldClass } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Package, PackageX, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabaseDb } from "@/integrations/supabase/client";
import { GalleryField } from "@/components/patterns/GalleryField";
import { QueryError } from "@/components/patterns/QueryError";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { PlanResourcePicker } from "@/components/provider/plans/PlanResourcePicker";
import { OptionsEditor, comboKey, type DraftGroup } from "@/components/provider/plans/OptionsEditor";
import { readEntitlements, serializeEntitlements, type Entitlement } from "@/lib/plans/entitlements";
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
  /** Whether the CUSTOMER may move an appointment, and on what terms. */
  reschedule_allowed: boolean | null;
  reschedule_min_notice_minutes: number | null;
  reschedule_max_per_occurrence: number | null;
  reschedule_window_days: number | null;
  /** Which calendars this plan opens. Empty = every one the provider has. */
  resource_ids: string[] | null;
  /** What the plan includes, as lines. See lib/plans/entitlements.ts. */
  entitlements: unknown;
  features: unknown;
  excludes: unknown;
  tags: string[] | null;
  gallery_urls: string[] | null;
}


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

/**
 * The delivery window is stored as minutes from midnight, but nobody should
 * compute "600 = 10:00" in their head — the field renders as a time picker
 * and these two translate at the edge.
 */
/** The provider says "24 hours"; the column, like its neighbours, is minutes. */
const hoursFromMinutes = (mins: string): string => {
  const n = Number(mins);
  return Number.isFinite(n) && n > 0 ? String(n / 60) : "";
};
const minutesFromHours = (hours: string): string => {
  const n = Number(hours);
  return Number.isFinite(n) && n > 0 ? String(Math.round(n * 60)) : "";
};

const minutesToTime = (minutes: string): string => {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};
const timeToMinutes = (time: string): string => {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  return String((h || 0) * 60 + (m || 0));
};

export function OfferEditor({ providerId, sourceKey, planId, onSaved, onDelete, onDirtyChange }: {
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
  /** So the sheet can ask before closing on unsaved changes. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const qc = useQueryClient();
  const KEY = ["offer-editor", providerId] as const;

  const {
    data, isLoading, isError: loadFailed, error: loadError,
    refetch: refetchOffer, isFetching: offerFetching,
  } = useQuery({
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
  /**
   * `planId="new"`: nothing exists yet. The row is written on the first save,
   * not when "New plan" is pressed — that used to leave a priceless "New plan"
   * draft behind every time the sheet was opened and closed.
   */
  const isNew = planId === "new";
  const variants = rows.filter((r) => r.parent_plan_id === offerId);

  // ── Draft ─────────────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [draftGroups, setDraftGroups] = useState<DraftGroup[]>([]);
  /** combination fingerprint → dollars typed in the grid. */
  const [prices, setPrices] = useState<Record<string, string>>({});
  /** The switches — what this plan IS, rather than what it is called. */
  const [sold, setSold] = useState({
    period: "monthly", unit: "", quantity: "",
    periodsDefault: "1", periodsMin: "1", periodsMax: "",
    pricingMode: "flat", providerPrice: "", markup: "",
    fulfilment: "none",
    // Off until a provider says otherwise: a business that has not thought
    // about its notice period should not be discovering the answer from a
    // customer who has already moved something.
    rescheduleAllowed: false,
    rescheduleNotice: "",
    rescheduleMax: "",
    rescheduleWindow: "",
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
  /**
   * What the plan opens, and how much of it.
   *
   * The columns behind this have existed since the booking engine landed, and
   * the booking endpoint already refuses a calendar a plan does not name
   * (`BookingService.decideCoverage`). The only editor that could set them was
   * the old per-service admin page, so a club owner in their own workspace
   * could not sell "tennis only" — the feature was reachable by nobody who
   * needed it.
   *
   * `resourceIds` empty means every calendar, which is what an all-access
   * membership is and what every plan written before this said.
   */
  const [access, setAccess] = useState<{ resourceIds: string[]; hours: string; hoursPeriod: string }>({
    resourceIds: [], hours: "", hoursPeriod: "",
  });
  /** Lines this editor does not manage (a deep clean, a session) — kept as-is. */
  const [otherEntitlements, setOtherEntitlements] = useState<Entitlement[]>([]);
  /**
   * The platform's switches live behind one fold. A provider selling
   * "cleaning, $80, one-time" should answer four questions, not twenty —
   * pricing modes, period limits and counted units all have working defaults.
   * A plan already using a non-default opens the fold itself (see the seed
   * effect), so nothing customized ever hides.
   */
  const [advancedOpen, setAdvancedOpen] = useState(false);
  /** Bumped after every seed, so the baseline for "unsaved changes" is taken from seeded state. */
  const [seedTick, setSeedTick] = useState(0);
  /**
   * Whether this business has anything bookable — same query (and cache row)
   * the resource picker runs. The hours-allowance fields used to render for
   * everyone, so a restaurant was asked when its court hours reset.
   */
  const { data: calendarCount = 0 } = useQuery({
    queryKey: ["plan-resource-picker", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data: res, error } = await supabaseDb
        .from("bookable_resources")
        .select("id, name, type")
        .eq("provider_id", providerId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (res ?? []) as Array<{ id: string; name: string; type: string | null }>;
    },
    select: (rows) => rows.length,
  });

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
      fulfilment: offer.fulfilment ?? "none",
      providerPrice: dollars(offer.provider_price_cents ?? 0),
      markup: dollars(offer.markup_cents ?? 0),
      leadMinutes: offer.lead_time_minutes != null ? String(offer.lead_time_minutes) : "",
      windowMinutes: offer.window_minutes != null ? String(offer.window_minutes) : "",
      rescheduleAllowed: !!offer.reschedule_allowed,
      rescheduleNotice: offer.reschedule_min_notice_minutes != null ? String(offer.reschedule_min_notice_minutes) : "",
      rescheduleMax: offer.reschedule_max_per_occurrence != null ? String(offer.reschedule_max_per_occurrence) : "",
      rescheduleWindow: offer.reschedule_window_days != null ? String(offer.reschedule_window_days) : "",
    });
    setGallery(Array.isArray(offer.gallery_urls) ? offer.gallery_urls.filter(Boolean) : []);

    // An "hour" line is the court allowance; everything else belongs to
    // whoever wrote it and is written back untouched.
    const lines = readEntitlements(offer);
    const hourLine = lines.find((e) => e.unit === HOUR_UNIT);
    setAccess({
      resourceIds: Array.isArray(offer.resource_ids) ? offer.resource_ids.filter(Boolean) : [],
      hours: hourLine?.quantity != null ? String(hourLine.quantity) : "",
      hoursPeriod: hourLine?.period ?? "",
    });
    // Only the hour line belongs to this editor. Everything else — an access
    // line, a deep clean, a session — is written back exactly as found, so
    // saving here never quietly drops what another screen said.
    setOtherEntitlements(lines.filter((e) => e.unit !== HOUR_UNIT));
    const attrs = data.legacyAttrs?.get(offer.id);
    const tagList = attrs ? attrs.tags : (offer.tags ?? []);
    setIncludes({
      features: asLines(attrs ? attrs.features : offer.features),
      excludes: asLines(attrs ? attrs.excludes : offer.excludes),
      tags: tagList.join(", "),
    });
    // Open the fold for a plan that already uses a non-default — customized
    // settings must be visible, not merely preserved.
    setAdvancedOpen(
      (offer.pricing_mode ?? "flat") !== "flat" ||
      !!offer.provider_price_cents || !!offer.markup_cents ||
      (offer.periods_default ?? 1) !== 1 || (offer.periods_min ?? 1) !== 1 ||
      offer.periods_max != null ||
      offer.lead_time_minutes != null || offer.window_minutes != null ||
      tagList.length > 0,
    );
    setSeedTick((t) => t + 1);
  }, [offerId, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new plan starts from the service's usual shape, not from an empty row.
  useEffect(() => {
    if (!isNew || !data) return;
    setName(""); setDescription(""); setDraftGroups([]); setPrices({ "": "" }); setGallery([]);
    setIncludes({ features: "", excludes: "", tags: "" });
    setAccess({ resourceIds: [], hours: "", hoursPeriod: "" });
    setOtherEntitlements([]);
    setSold((v) => ({ ...v, period: offers[0]?.period ?? "monthly", fulfilment: DEFAULT_FULFILMENT[sourceKey] ?? "none" }));
    setSeedTick((t) => t + 1);
  }, [isNew, !!data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unsaved changes = anything typed since the last seed.
  const snapshot = JSON.stringify({ name, description, draftGroups, prices, sold, includes, gallery, access });
  const [baseline, setBaseline] = useState<string | null>(null);
  useEffect(() => { if (seedTick) setBaseline(snapshot); }, [seedTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = baseline !== null && snapshot !== baseline;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

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
    const all = draftGroups.reduce<Array<Record<string, string>>>(
      (acc, g) => acc.flatMap((base) => g.options.map((o) => ({ ...base, [g.key]: o.key }))),
      [{}],
    );
    // One row per combination, even if old data holds two values with one key.
    const seen = new Set<string>();
    return all.filter((c) => { const k = comboKey(draftGroups, c); if (seen.has(k)) return false; seen.add(k); return true; });
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
    mutationFn: async (publish: boolean) => {
      if (!name.trim()) throw new Error("The plan needs a name.");
      // A draft may be unpriced; putting it on sale may not.
      if (publish && !priced.length) throw new Error(draftGroups.length
        ? "Give at least one combination a price."
        : "Give the plan a price.");

      // A new plan is written here, on its first save.
      let o: PlanRow | null = offer;
      if (isNew) {
        const id = await createPlanRow({
          providerId, sourceKey, name: name.trim(),
          amount: draftGroups.length ? 0 : cents(prices[""] ?? ""),
          sortOrder: offers.length, period: sold.period, draft: true,
        });
        if (!id) throw new Error("Couldn't create the plan.");
        const { data: row, error } = await supabaseDb.from("provider_plans").select("*").eq("id", id).single();
        if (error) throw error;
        o = row as PlanRow;
      }
      if (!o) throw new Error("Nothing to save yet.");

      // 1. The plan's own fields, written wherever that plan actually lives.
      await writePlanFields(o, name.trim(), description.trim() || null, sourceKey);

      // 1b. The switches. These live only on `provider_plans` — no legacy
      //     table has a column for "how is this sold" — except the two
      //     attribute lists, which the storefront still reads from the legacy
      //     row, so those are written there as well (see writeAttributes).
      const { error: switchErr } = await supabaseDb.from("provider_plans").update({
        period: sold.period,
        included_unit: sold.unit.trim() || null,
        included_quantity: numOrNull(sold.quantity),
        // One-time is one period by definition; stale numbers from when the
        // plan was recurring must not survive into the row.
        periods_default: sold.period === "one_time" ? 1 : numOrNull(sold.periodsDefault) ?? 1,
        periods_min: sold.period === "one_time" ? 1 : numOrNull(sold.periodsMin) ?? 1,
        periods_max: sold.period === "one_time" ? 1 : numOrNull(sold.periodsMax),
        pricing_mode: sold.pricingMode,
        fulfilment: sold.fulfilment,
        resource_ids: access.resourceIds,
        entitlements: serializeEntitlements([
          ...otherEntitlements,
          ...(Number(access.hours) > 0
            ? [{
                unit: HOUR_UNIT,
                quantity: Math.floor(Number(access.hours)),
                period: (access.hoursPeriod || null) as Entitlement["period"],
                resourceIds: access.resourceIds,
              }]
            : []),
        ]),
        provider_price_cents: cents(sold.providerPrice) || null,
        markup_cents: cents(sold.markup) || null,
        lead_time_minutes: numOrNull(sold.leadMinutes),
        window_minutes: numOrNull(sold.windowMinutes),
        reschedule_allowed: sold.rescheduleAllowed,
        reschedule_min_notice_minutes: numOrNull(sold.rescheduleNotice),
        reschedule_max_per_occurrence: numOrNull(sold.rescheduleMax),
        reschedule_window_days: numOrNull(sold.rescheduleWindow),
        tags: fromLines(includes.tags.replace(/,/g, "\n")),
        excludes: fromLines(includes.excludes),
        features: fromLines(includes.features),
        gallery_urls: gallery,
        updated_at: new Date().toISOString(),
      }).eq("id", o.id);
      if (switchErr) throw switchErr;

      await writeAttributes(o, sourceKey, fromLines(includes.features), fromLines(includes.excludes), fromLines(includes.tags.replace(/,/g, "\n")));

      // A derived price is two numbers the customer never sees separately.
      // The beach club has held them on its own row since before any of this,
      // and its checkout still reads them there.
      if (sourceKey === "beach" && o.source_plan_id && (sold.providerPrice || sold.markup)) {
        const { error } = await supabaseDb.from("beach_club_plans").update({
          provider_price_per_person_cents: cents(sold.providerPrice),
          extra_per_person_cents: cents(sold.markup),
          updated_at: new Date().toISOString(),
        }).eq("id", o.source_plan_id);
        if (error) throw error;
      }
      // A plan is created as a draft so a nameless $0 row never reaches the
      // storefront. Pricing it is what puts it on sale.
      if (publish && o.status !== "active") await writeStatus(o, "active", sourceKey);

      // 2. Axes, rewritten wholesale. The set is small and a diff would have to
      //    reason about a renamed key that priced rows still point at.
      const existing = (data?.groups as any[]).filter((g) => g.plan_id === o.id);
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
            .insert({ plan_id: o.id, key: group.key, label: group.label, sort_order: index })
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
        // A plan with no choices prices itself — for a new one too.
        const variant = !draftGroups.length && fingerprint === "" ? o : variantByCombo.get(fingerprint);

        if (variant) {
          if (amount > 0) {
            await writePrice(variant, amount, sourceKey);
            // Keep the binding current — an axis renamed above would otherwise
            // leave this row answering for a combination that no longer exists.
            // Except when the row IS the plan: a plan with no choices prices
            // itself, and making it its own parent would hide it from every
            // list that asks for top-level plans.
            if (variant.id !== o.id) {
              const { error } = await supabaseDb.from("provider_plans")
                .update({ option_keys: combo, parent_plan_id: o.id }).eq("id", variant.id);
              if (error) throw error;
            }
          } else if (variant.id !== o.id) {
            // Cleared, not deleted: somebody may be subscribed to it. Off sale
            // is a status, and the row keeps answering for their subscription.
            await writeStatus(variant, "inactive", sourceKey);
          }
          continue;
        }

        if (amount <= 0) continue;
        const created = await createVariant({
          offer: o, providerId, sourceKey, combo, groups: draftGroups, amount, sortOrder: index,
        });
        if (created) {
          const { error } = await supabaseDb.from("provider_plans")
            .update({ parent_plan_id: o.id, option_keys: combo }).eq("id", created);
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
    onSuccess: (_d, publish) => {
      toast.success(publish ? "On sale" : "Saved");
      setBaseline(snapshot);
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
  // Before the "no longer here" branch: a failed read has no offer either, and
  // telling the owner their plan was deleted when it was not is worse than
  // telling them nothing. Only when there is nothing to show: a background
  // refetch that fails keeps `data`, and must not throw away an open edit.
  if (loadFailed && !data) {
    return (
      <QueryError
        title="Couldn't load this plan"
        error={loadError}
        onRetry={() => refetchOffer()}
        retrying={offerFetching}
      />
    );
  }
  if (!offer && planId && !isNew) {
    return (
      <YdEmptyState
        icon={PackageX}
        title="This plan is no longer here"
        subtitle="It may have been deleted in another window."
      />
    );
  }
  if (!offer && !isNew) {
    return (
      <YdEmptyState
        icon={Package}
        title="This business sells nothing yet"
        subtitle="A plan is one product: a name, whatever the customer gets to choose, and a price for each way of choosing it."
        action={
          <Button className="gap-1.5" disabled={addPlan.isPending} onClick={() => addPlan.mutate()}>
            <Plus className="h-4 w-4" /> {addPlan.isPending ? "Adding…" : "Add the first plan"}
          </Button>
        }
      />
    );
  }

  const PERIODS = [["weekly", "Weekly"], ["monthly", "Monthly"], ["quarterly", "3 months"], ["yearly", "Yearly"]] as const;
  const PER: Record<string, string> = { weekly: "week", monthly: "month", quarterly: "3 months", yearly: "year" };
  const oneTime = sold.period === "one_time";
  const live = !isNew && offer?.status === "active";
  const moreSummary = [
    sold.pricingMode !== "flat" ? (sold.pricingMode === "per_person" ? "Per person" : "Per unit") : "Flat price",
    { none: "nothing to schedule", visits: "visits", deliveries: "deliveries", resource_hours: "booked hours" }[sold.fulfilment] ?? sold.fulfilment,
  ].join(" · ");

  return (
    <div className="space-y-1">
      {/* Every plan this business sells — only when nobody outside has already
          chosen one. Opened from a plan card, the card WAS the choice. */}
      <div className={cn("flex flex-wrap items-center gap-2", planId && "hidden")}>
        {offers.map((o) => (
          <button key={o.id} type="button" onClick={() => setOfferId(o.id)}
            className={cn(
              "h-10 rounded-full px-4 text-body font-semibold transition-colors",
              o.id === offerId ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
            )}>
            {o.name}
            {o.status !== "active" && <span className="ml-1.5 text-[12px] opacity-70">off</span>}
          </button>
        ))}
        <Button variant="secondary" size="sm" className="gap-1.5"
          disabled={addPlan.isPending} onClick={() => addPlan.mutate()}>
          <Plus className="h-4 w-4" /> {addPlan.isPending ? "Adding…" : "New plan"}
        </Button>
      </div>

      {/* 1. What a customer reads on the card: the name, how it is sold, the price. */}
      <section className="space-y-4 rounded-radius-lg bg-card p-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Monthly membership" />
        <div className="flex rounded-radius-md bg-inset p-0.5">
          {([["sub", "Subscription"], ["once", "One-time"]] as const).map(([k, label]) => (
            <button key={k} type="button"
              onClick={() => setSold((v) => ({ ...v, period: k === "once" ? "one_time" : (v.period === "one_time" ? "monthly" : v.period) }))}
              className={cn("flex-1 rounded-radius-md px-3 py-2 text-body font-semibold transition-colors",
                (k === "once") === oneTime ? "bg-segment text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        {!oneTime && (
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setSold((v) => ({ ...v, period: k }))} aria-pressed={sold.period === k}
                className={cn("h-10 rounded-full px-4 text-body font-semibold transition-colors",
                  sold.period === k ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}>
                {label}
              </button>
            ))}
          </div>
        )}
        {draftGroups.length === 0 ? (
          <Input label="Price" inputMode="decimal" value={prices[""] ?? ""}
            onChange={(e) => setPrices((p) => ({ ...p, [""]: e.target.value }))}
            placeholder="0.00" className="tabular-nums"
            leftIcon={<span className="text-body text-muted-foreground">$</span>}
            rightIcon={!oneTime ? <span className="text-meta text-muted-foreground">/ {PER[sold.period] ?? "period"}</span> : undefined}
            helperText={oneTime ? "Bought once — a product, a session, a day pass." : "Renews every period until the customer stops it."} />
        ) : (
          <p className="text-body text-muted-foreground">
            Priced per option below — customers see “from {fromCents ? formatUSD(fromCents) : "—"}”.
          </p>
        )}
      </section>

      {/* 2. Photos — the cover is the picture on the card. */}
      <section className="rounded-radius-lg bg-card p-4">
        <GalleryField label="Photos" value={gallery} onChange={setGallery} pathPrefix="plans/gallery" max={8} />
        <p className="mt-2 text-meta text-muted-foreground">The first photo is the cover on this plan's card.</p>
      </section>

      {/* 3. What they get. */}
      <section className="space-y-4 rounded-radius-lg bg-card p-4">
        <p className="text-title font-semibold text-foreground">What they get</p>
        <Textarea label="Description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="One or two sentences a customer reads first." />
        <Field label="Included" hint="One per line — shown on the plan page.">
          <Textarea rows={4} value={includes.features}
            onChange={(e) => setIncludes((v) => ({ ...v, features: e.target.value }))}
            placeholder={placeholdersFor(sourceKey).features} />
        </Field>
        <Field label="Not included" hint="One per line.">
          <Textarea rows={3} value={includes.excludes}
            onChange={(e) => setIncludes((v) => ({ ...v, excludes: e.target.value }))}
            placeholder={placeholdersFor(sourceKey).excludes} />
        </Field>
      </section>

      {/* 4. Options & prices — see OptionsEditor. */}
      <OptionsEditor
        groups={draftGroups}
        setGroups={setDraftGroups}
        prices={prices}
        setPrices={setPrices}
        combos={combos}
        perLabel={oneTime ? null : (PER[sold.period] ?? null)}
        key={`${offerId ?? "new"}:${seedTick}`}
      />

      {/* Only a business with something bookable is asked booking questions —
          the hours allowance used to render for everyone, so a restaurant was
          asked when its court hours reset. */}
      {calendarCount > 0 && (
        <section className="space-y-3 rounded-radius-lg bg-card p-4">
          <p className="text-title font-semibold text-foreground">Booking access</p>
          <PlanResourcePicker
            providerId={providerId}
            value={access.resourceIds}
            onChange={(resourceIds) => setAccess((v) => ({ ...v, resourceIds }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hours included" hint="Leave empty for unlimited, or set a number of hours.">
              <Input
                inputMode="numeric" inputSize="sm" value={access.hours} placeholder="Unlimited"
                onChange={(e) => setAccess((v) => ({ ...v, hours: e.target.value }))}
              />
            </Field>
            <Field
              label="Hours reset"
              hint={access.hours.trim() ? "When the allowance starts again." : "Only matters once hours are limited."}
            >
              <select
                value={access.hoursPeriod}
                disabled={!access.hours.trim()}
                onChange={(e) => setAccess((v) => ({ ...v, hoursPeriod: e.target.value }))}
                className={cn(fieldClass, "disabled:opacity-50")}
              >
                <option value="">Same as billing</option>
                {["weekly", "monthly", "quarterly", "yearly"].map((p) => (
                  <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </Field>
          </div>
        </section>
      )}

      {/* The platform's switches, behind one fold. Everything here has a
          working default; a plan already using a non-default opens the fold
          itself (see the seed effect). */}
      <section className="rounded-radius-lg bg-card">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full items-center justify-between p-4 text-left"
        >
          <span className="min-w-0">
            <span className="block text-title font-semibold text-foreground">More settings</span>
            {!advancedOpen && <span className="mt-0.5 block text-meta text-muted-foreground">{moreSummary}</span>}
          </span>
          <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", advancedOpen && "rotate-180")} />
        </button>
        {advancedOpen && (
          <div className="grid gap-3 p-4 pt-0 sm:grid-cols-2">
            <Field label="Price is" hint={PRICING_HINT[sold.pricingMode] ?? ""}>
              <select value={sold.pricingMode} onChange={(e) => setSold((v) => ({ ...v, pricingMode: e.target.value }))}
                className={fieldClass}>
                <option value="flat">Flat</option>
                <option value="per_unit">Per unit</option>
                <option value="per_person">Per person</option>
              </select>
            </Field>

            {/*
              What has to happen after the sale. Checkout reads it to decide
              whether to ask for an address (`planCheckoutModel.needsAddress`).
              Defaulted from the service at creation, so it is rarely touched.
            */}
            <Field label="Fulfilment" hint={FULFILMENT_HINT[sold.fulfilment] ?? ""}>
              <select value={sold.fulfilment} onChange={(e) => setSold((v) => ({ ...v, fulfilment: e.target.value }))}
                className={fieldClass}>
                <option value="none">Nothing to schedule</option>
                <option value="visits">Visits</option>
                <option value="deliveries">Deliveries</option>
                <option value="resource_hours">Booked hours</option>
              </select>
            </Field>

            {/* Independent of the mode above: a per-person price can also be a
                marked-up one, which is exactly what the beach club is. Filling
                these in is what makes a price derived. */}
            {(sold.providerPrice || sold.markup || sold.pricingMode === "derived") && (
              <>
                <Field label="Provider is paid ($)">
                  <Input inputSize="sm" inputMode="decimal" value={sold.providerPrice}
                    onChange={(e) => setSold((v) => ({ ...v, providerPrice: e.target.value }))} />
                </Field>
                <Field label="Platform adds ($)">
                  <Input inputSize="sm" inputMode="decimal" value={sold.markup}
                    onChange={(e) => setSold((v) => ({ ...v, markup: e.target.value }))} />
                </Field>
              </>
            )}

            <Field label="What is counted" hint="cleaning · meal · session">
              <Input inputSize="sm" value={sold.unit} placeholder="cleaning"
                onChange={(e) => setSold((v) => ({ ...v, unit: e.target.value }))} />
            </Field>
            <Field label={sold.period === "one_time" ? "How many included" : "How many per period"}>
              <Input inputSize="sm" inputMode="numeric" value={sold.quantity} placeholder="4"
                onChange={(e) => setSold((v) => ({ ...v, quantity: e.target.value }))} />
            </Field>

            {/* How many periods may be bought at once — a question a one-time
                offer does not have, so it is not asked. */}
            {sold.period !== "one_time" && (
              <>
                <Field label="Periods offered by default">
                  <Input inputSize="sm" inputMode="numeric" value={sold.periodsDefault}
                    onChange={(e) => setSold((v) => ({ ...v, periodsDefault: e.target.value }))} />
                </Field>
                <Field label="Fewest / most they may buy">
                  <div className="flex items-center gap-2">
                    <Input inputSize="sm" inputMode="numeric" value={sold.periodsMin}
                      onChange={(e) => setSold((v) => ({ ...v, periodsMin: e.target.value }))} />
                    <span className="text-muted-foreground">–</span>
                    <Input inputSize="sm" inputMode="numeric" value={sold.periodsMax} placeholder="no limit"
                      onChange={(e) => setSold((v) => ({ ...v, periodsMax: e.target.value }))} />
                  </div>
                </Field>
              </>
            )}

            {sold.fulfilment === "deliveries" && (
              <>
                <Field label="Earliest arrival" hint="When the first delivery window opens.">
                  <Input inputSize="sm" type="time" value={minutesToTime(sold.leadMinutes)}
                    onChange={(e) => setSold((v) => ({ ...v, leadMinutes: timeToMinutes(e.target.value) }))} />
                </Field>
                <Field label="Window width (minutes)" hint="120 = a two-hour promise.">
                  <Input inputSize="sm" inputMode="numeric" value={sold.windowMinutes} placeholder="120"
                    onChange={(e) => setSold((v) => ({ ...v, windowMinutes: e.target.value }))} />
                </Field>
              </>
            )}

            {/*
              Moving an appointment.

              Only for a plan that HAS appointments — a plan fulfilled by
              nothing has none to move, and offering the setting there would be
              a question with no subject. The provider can always move their
              own day from Operations; this decides whether the customer gets a
              door of their own, and on what terms.
            */}
            {sold.fulfilment !== "none" && (
              <>
                <Field
                  label="Customer can move an appointment"
                  hint="Off means they have to ask you. You can always move one yourself."
                >
                  <Switch
                    checked={sold.rescheduleAllowed}
                    onCheckedChange={(on) => setSold((v) => ({ ...v, rescheduleAllowed: on }))}
                  />
                </Field>

                {sold.rescheduleAllowed && (
                  <>
                    <Field label="Notice needed (hours)" hint="How long before it starts they can still move it. Empty = any time before.">
                      <Input
                        inputSize="sm"
                        inputMode="numeric"
                        value={hoursFromMinutes(sold.rescheduleNotice)}
                        placeholder="24"
                        onChange={(e) => setSold((v) => ({ ...v, rescheduleNotice: minutesFromHours(e.target.value) }))}
                      />
                    </Field>
                    <Field label="Times one appointment can move" hint="Empty = no limit. Bounds the customer who keeps pushing the same visit a day at a time.">
                      <Input inputSize="sm" inputMode="numeric" value={sold.rescheduleMax} placeholder="no limit"
                        onChange={(e) => setSold((v) => ({ ...v, rescheduleMax: e.target.value }))} />
                    </Field>
                    <Field label="How far it can move (days)" hint="Empty = anywhere ahead. Stops something bought for September being parked in December.">
                      <Input inputSize="sm" inputMode="numeric" value={sold.rescheduleWindow} placeholder="14"
                        onChange={(e) => setSold((v) => ({ ...v, rescheduleWindow: e.target.value }))} />
                    </Field>
                  </>
                )}
              </>
            )}

            <Field label="Tags" hint="Comma separated — what a customer can filter by.">
              <Input value={includes.tags} placeholder={placeholdersFor(sourceKey).tags}
                onChange={(e) => setIncludes((v) => ({ ...v, tags: e.target.value }))} />
            </Field>
          </div>
        )}
      </section>

      {/* Off sale and delete sit apart from saving — they are not the point of this screen. */}
      {!isNew && offer && (
        <section className="flex flex-wrap gap-2 rounded-radius-lg bg-card p-4">
          {/* Off sale, not deleted: somebody may be subscribed to it. */}
          {live && (
            <Button variant="secondary" size="sm" disabled={archive.isPending} onClick={() => archive.mutate("inactive")}>
              Take off sale
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 /> Delete plan
            </Button>
          )}
        </section>
      )}

      {/* Pinned under the blocks like every dialog's buttons. A live plan shows
          the bar only once something changed; a draft always offers both. */}
      {(!live || dirty) && (
      <div className="sticky bottom-0 z-10 flex gap-2 bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        {live ? (
          <Button className="flex-1" disabled={save.isPending} loading={save.isPending} loadingText="Saving…"
            onClick={() => save.mutate(false)}>
            Save changes
          </Button>
        ) : (
          <>
            <Button variant="secondary" className="flex-1" disabled={save.isPending} onClick={() => save.mutate(false)}>
              Save draft
            </Button>
            <Button className="flex-1" disabled={save.isPending} loading={save.isPending} loadingText="Saving…"
              onClick={() => save.mutate(true)}>
              Put on sale
            </Button>
          </>
        )}
      </div>
      )}
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
/** What a new plan's service usually has to do; editable right after. */
const DEFAULT_FULFILMENT: Record<string, string> = {
  cleaning: "visits",
  food: "deliveries",
  beach: "none",
};

/** The unit a court hour is counted in — the allowance this editor manages. */
const HOUR_UNIT = "hour";

const FULFILMENT_HINT: Record<string, string> = {
  none: "Access or membership — nobody comes, nothing ships.",
  visits: "Somebody comes to an address.",
  deliveries: "Something ships to an address.",
  resource_hours: "Hours on a calendar.",
};

const PRICING_HINT: Record<string, string> = {
  flat: "One price for the period.",
  per_unit: "Price × how many they take.",
  per_person: "Price × people on the booking.",

};

/**
 * Example text in the provider's own trade. The cleaning placeholders used to
 * show for everyone — a restaurant was invited to exclude "Windows from
 * outside" and a cleaner to tag their plan "vegetarian, keto".
 */
const SERVICE_PLACEHOLDERS: Record<string, { features: string; excludes: string; tags: string }> = {
  cleaning: {
    features: "Full apartment cleaning\nBathroom and kitchen",
    excludes: "Windows from outside\nLaundry",
    tags: "eco, deep clean",
  },
  food: {
    features: "Lunch and dinner, Monday to Friday\nDelivered to your door",
    excludes: "Weekends\nDrinks",
    tags: "vegetarian, keto",
  },
  beach: {
    features: "Pool and beach access\nTowels and loungers",
    excludes: "Court bookings after 6 PM",
    tags: "family",
  },
};
const placeholdersFor = (sourceKey: string) =>
  SERVICE_PLACEHOLDERS[sourceKey] ?? {
    features: "What the customer gets\nOne line per item",
    excludes: "What is not part of the plan",
    tags: "premium, weekend",
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
    // Classified from the start. A NULL here reads as "nothing to schedule" at
    // checkout, so a delivery plan created and sold before anyone opened the
    // "How it's sold" panel would never ask for an address.
    pricing_mode: "flat",
    fulfilment: DEFAULT_FULFILMENT[sourceKey] ?? "none",
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

/** A copy of `items` with the one at `index` moved one step (-1 left/up, +1 right/down). */
function moveItem<T>(items: T[], index: number, step: -1 | 1): T[] {
  const to = index + step;
  if (to < 0 || to >= items.length) return items;
  const next = items.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
