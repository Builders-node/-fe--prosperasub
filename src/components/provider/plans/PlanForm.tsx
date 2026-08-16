import { EntitlementsEditor } from "@/components/provider/plans/EntitlementsEditor";
import type { Entitlement } from "@/lib/plans/entitlements";
import { PlanResourcePicker } from "@/components/provider/plans/PlanResourcePicker";
import { GalleryField } from "@/components/patterns/GalleryField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PLAN_PERIODS, includedLabel, type PlanPeriod } from "@/lib/services/planPeriod";

/**
 * The one plan form every service renders.
 *
 * Four editors had grown four vocabularies for the same idea. Cleaning called
 * it Frequency Count + Frequency Unit, food called it Meals/day × Days/week,
 * beach had no count at all, and the universal editor had invented a fifth
 * spelling. A provider moving between services met a different form each time,
 * and the same question — "how many, how often, for how much" — was asked four
 * different ways.
 *
 * So the SHAPE is fixed here and the WIRING stays per service. Each editor
 * keeps its own table, its own columns and its own mutation; it just stops
 * inventing its own layout. Service-specific fields go in `extras`, which
 * renders in one predictable place rather than being scattered through the
 * common ones.
 *
 * This deliberately does NOT unify storage. Moving every service onto
 * provider_plans is Phase 6 in docs/DDD_MIGRATION_PLAN.md and is gated —
 * live subscriptions and payments still read the legacy tables.
 */
export interface PlanFormValues {
  name: string;
  description: string;
  /** The headline price in cents. What it is *per* is the service's business — see `priceLabel`. */
  priceCents: number;
  /** How many of the thing. Null means unmetered access. */
  quantity: number | null;
  /** How often the quantity refreshes. */
  period: PlanPeriod;
  /** Singular noun for what is counted. Services with a fixed noun pass it and hide the input. */
  unit: string;
  /** Bullet list shown on the public card. */
  features: string[];
  status: string;
  /**
   * `public` — on the storefront. `private` — unlisted: it stays out of every
   * listing and search result, and a direct link still opens and still sells.
   * That is what makes it useful: a price quoted to one client, sent as a link,
   * without putting it in front of everyone.
   */
  visibility: "public" | "private";
  /**
   * Photographs of the thing being sold. They live on the universal plan row
   * for every service — `provider_plans.gallery_urls` — because that is the row
   * the plan page, the provider page and the till all read.
   */
  gallery: string[];
  /**
   * Which of the provider's bookable resources this plan opens.
   * Empty = all of them, now and in future.
   */
  resourceIds: string[];
  /**
   * Everything the plan includes BEYOND the quantity/unit above — which is
   * itself the first entitlement, and the one every existing reader uses.
   * A second line is what makes a plan a package rather than a single thing.
   */
  extraEntitlements: Entitlement[];
  sortOrder: number;
}

export interface PlanFormProps {
  values: PlanFormValues;
  onChange: (patch: Partial<PlanFormValues>) => void;

  /** "Monthly price", "Price / week", "Price / person / month" — the service says what its number means. */
  priceLabel?: string;
  /** Shown under the price when the service charges in a way the label alone doesn't explain. */
  priceHint?: string;

  /**
   * Services whose noun never varies (cleaning always counts cleanings) pass
   * it here and the Unit input disappears. Only a general-purpose provider —
   * one that might sell massages, classes or washes — needs to type it.
   */
  fixedUnit?: string;
  /**
   * Services whose plans live in a legacy table with no `visibility` column —
   * food and the beach club — hide the control rather than offer a switch that
   * cannot be saved.
   */
  hideVisibility?: boolean;
  /** Lets the form offer the provider's own courts, rooms or tables. */
  providerId?: string | null;
  /** Some services are billed on one cycle only; passing one period hides the selector. */
  periods?: readonly PlanPeriod[];
  /** Hide the counter entirely for services that don't meter anything (beach memberships). */
  hideQuantity?: boolean;
  /**
   * Hide the price field for services whose price is DERIVED rather than typed —
   * the beach club's customer price is provider price plus the platform's
   * markup, so offering a third box to type it in would invite a number that
   * disagrees with the two it is made of.
   */
  hidePrice?: boolean;

  featuresLabel?: string;
  featuresPlaceholder?: string;

  /**
   * The lifecycle a service actually has. Most sell either active or not;
   * cleaning also has a Draft it can prepare in and an Archive it retires
   * into, and hard-coding two options here would have forced that editor to
   * keep its own Status control — which is how the vocabularies drifted apart
   * in the first place.
   */
  statuses?: ReadonlyArray<{ value: string; label: string }>;

  /** Service-specific fields — apartment type, meals/day, per-person pricing. */
  extras?: React.ReactNode;
  /** Rendered under the features list; used for per-service warnings. */
  footer?: React.ReactNode;
}

const DEFAULT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

export function PlanForm({
  values, onChange,
  priceLabel = "Price",
  priceHint,
  fixedUnit,
  periods = PLAN_PERIODS,
  hideQuantity = false,
  hidePrice = false,
  featuresLabel = "What's included",
  featuresPlaceholder = "One per line",
  statuses = DEFAULT_STATUSES,
  hideVisibility = false,
  providerId,
  extras,
  footer,
}: PlanFormProps) {
  const unit = fixedUnit ?? values.unit;
  const preview = includedLabel(values.quantity, unit, values.period);

  const previewLine = preview ? (
    <p className="-mt-1 text-xs text-muted-foreground">
      Customers will see: <span className="font-medium text-foreground">{preview}</span>
    </p>
  ) : null;

  return (
    <div className="space-y-4">
      <div>
        <Label>Plan name <span className="text-destructive">*</span></Label>
        <Input
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Studio Apartment"
        />
      </div>

      <div>
        <Label>Description</Label>
        <Textarea
          rows={3}
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="One line customers see under the name"
        />
      </div>

      {/* ── How many, how often ─────────────────────────────────────────── */}
      {!hideQuantity && (
        <div className={`grid gap-3 ${fixedUnit ? "grid-cols-2" : "grid-cols-3"}`}>
          <div>
            <Label>How many</Label>
            <Input
              type="number" min={1} inputMode="numeric"
              placeholder="empty = unlimited"
              value={values.quantity ?? ""}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                onChange({ quantity: Number.isFinite(n) ? n : null });
              }}
            />
          </div>
          {!fixedUnit && (
            <div>
              <Label>Unit</Label>
              <Input
                value={values.unit}
                onChange={(e) => onChange({ unit: e.target.value })}
                placeholder="massage"
              />
            </div>
          )}
          <div>
            <Label>How often</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={values.period}
              disabled={periods.length === 1}
              onChange={(e) => onChange({ period: e.target.value as PlanPeriod })}
            >
              {periods.map((p) => (
                <option key={p} value={p}>{p.replace("_", " ")}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* The preview follows whatever controls produce it. When the count is
          typed here it belongs right below; when it is derived from fields in
          `extras` — food's meals/day × days/week, cleaning's frequency — a line
          above them would change in response to an input further down the page,
          which reads as a glitch rather than an echo. */}
      {!hideQuantity && previewLine}

      {/* ── Price ───────────────────────────────────────────────────────── */}
      {!hidePrice && (
      <div>
        <Label>{priceLabel}</Label>
        <Input
          type="number" min={0} step={0.01} inputMode="decimal"
          value={values.priceCents ? (values.priceCents / 100).toString() : ""}
          onChange={(e) => {
            const n = Number.parseFloat(e.target.value);
            onChange({ priceCents: Number.isFinite(n) ? Math.round(n * 100) : 0 });
          }}
        />
        {priceHint && <p className="mt-1 text-xs text-muted-foreground">{priceHint}</p>}
      </div>
      )}

      {extras}

      {hideQuantity && previewLine}

      {/* ── What's included ─────────────────────────────────────────────── */}
      <div>
        <Label>{featuresLabel}</Label>
        <Textarea
          rows={4}
          placeholder={featuresPlaceholder}
          value={values.features.join("\n")}
          // Split on save, not per keystroke — filtering blanks while typing
          // eats the newline the moment it is pressed.
          onChange={(e) => onChange({ features: e.target.value.split("\n") })}
        />
      </div>

      <EntitlementsEditor
        value={values.extraEntitlements}
        onChange={(next) => onChange({ extraEntitlements: next })}
        planPeriod={values.period}
      />

      {providerId && (
        <PlanResourcePicker
          providerId={providerId}
          value={values.resourceIds}
          onChange={(next) => onChange({ resourceIds: next })}
        />
      )}

      <GalleryField
        label="Photos"
        value={values.gallery}
        onChange={(next) => onChange({ gallery: next })}
        pathPrefix="plans/gallery"
        max={8}
      />

      {footer}

      <div className={hideVisibility ? "grid grid-cols-2 gap-3" : "grid grid-cols-3 gap-3"}>
        {!hideVisibility && (
        <div>
          <Label>Visibility</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={values.visibility}
            onChange={(e) => onChange({ visibility: e.target.value as "public" | "private" })}
          >
            <option value="public">Public — listed</option>
            <option value="private">Private — link only</option>
          </select>
        </div>
        )}
        <div>
          <Label>Status</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={values.status}
            onChange={(e) => onChange({ status: e.target.value })}
          >
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Sort order</Label>
          <Input
            type="number" inputMode="numeric"
            value={values.sortOrder}
            onChange={(e) => onChange({ sortOrder: Number.parseInt(e.target.value, 10) || 0 })}
          />
        </div>
      </div>
    </div>
  );
}

/** Blank lines are how a list gets typed; they are not list items. */
export function cleanFeatures(features: string[]): string[] {
  return features.map((f) => f.trim()).filter(Boolean);
}

export const EMPTY_PLAN: PlanFormValues = {
  name: "", description: "", priceCents: 0,
  quantity: null, period: "monthly", unit: "",
  features: [], status: "active", visibility: "public", gallery: [],
  resourceIds: [], extraEntitlements: [], sortOrder: 0,
};
