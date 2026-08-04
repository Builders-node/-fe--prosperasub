import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one place a status becomes a label and a colour.
 *
 * Before this there were eight independent maps and they disagreed in ways a
 * customer could see:
 *
 *   - `booked` was a solid amber Badge in My Subscriptions and an emerald tint
 *     in the provider's booking calendar — the same booking, two colours,
 *     depending on who was looking at it.
 *   - "Cancelled" / "Canceled" / raw lowercase `cancelled` all shipped.
 *   - Awaiting payment was called "Awaiting payment", "Payment pending" and
 *     "Pending payment" — two of those in the same file.
 *   - `paused` was amber-500 in two lists and yellow-400 in the food detail
 *     page; `expired` was `destructive` in two and red-400 in a third.
 *   - The one screen that used shadcn `Badge` variants fed it values none of
 *     its cases matched, so active and expired both fell through to `outline`
 *     and rendered as identical unfilled text.
 *
 * Add a state here, not in a page.
 */

/** Semantic buckets. Colour comes from the bucket, never from the raw value. */
type Tone = "positive" | "attention" | "negative" | "neutral";

const TONE_PILL: Record<Tone, string> = {
  positive:  "bg-emerald-500/15 text-emerald-500",
  attention: "bg-amber-500/15 text-amber-500",
  negative:  "bg-destructive/15 text-destructive",
  neutral:   "bg-muted text-muted-foreground",
};

const TONE_DOT: Record<Tone, string> = {
  positive:  "bg-emerald-500",
  attention: "bg-amber-500",
  negative:  "bg-destructive",
  neutral:   "bg-muted-foreground/40",
};

const TONE_TEXT: Record<Tone, string> = {
  positive:  "text-emerald-600",
  attention: "text-amber-600",
  negative:  "text-destructive",
  neutral:   "text-muted-foreground",
};

/**
 * Canonical label + tone per raw status value.
 *
 * Keys are the lowercased DB values as they actually appear across
 * cleaning_subscriptions, food_subscriptions, beach_club_subscriptions,
 * rental_bookings, cleaning_bookings, provider_applications and providers.
 * Both spellings of cancelled are here because the backend normalizes to
 * `canceled` while every table stores `cancelled`.
 */
const STATUS: Record<string, { label: string; tone: Tone }> = {
  // ── running ──────────────────────────────────────────────────────────────
  active:          { label: "Active",           tone: "positive" },
  confirmed:       { label: "Confirmed",        tone: "positive" },
  booked:          { label: "Booked",           tone: "positive" },
  paid:            { label: "Paid",             tone: "positive" },
  completed:       { label: "Completed",        tone: "positive" },
  approved:        { label: "Approved",         tone: "positive" },
  in_progress:     { label: "In progress",      tone: "positive" },

  // ── needs the customer or an admin to do something ───────────────────────
  // One phrasing, everywhere. "Payment pending" and "Pending payment" are gone.
  pending:         { label: "Awaiting payment", tone: "attention" },
  pending_payment: { label: "Awaiting payment", tone: "attention" },
  held:            { label: "On hold",          tone: "attention" },
  paused:          { label: "Paused",           tone: "attention" },
  expiring_soon:   { label: "Expiring soon",    tone: "attention" },
  trial:           { label: "Trial",            tone: "attention" },
  under_review:    { label: "Under review",     tone: "attention" },

  // ── stopped ──────────────────────────────────────────────────────────────
  expired:         { label: "Expired",          tone: "negative" },
  cancelled:       { label: "Cancelled",        tone: "negative" },
  canceled:        { label: "Cancelled",        tone: "negative" },
  rejected:        { label: "Not approved",     tone: "negative" },
  failed:          { label: "Failed",           tone: "negative" },

  // ── listing visibility (vehicles, plans) ─────────────────────────────────
  public:          { label: "Public",           tone: "positive" },
  private:         { label: "Private",          tone: "attention" },
  archived:        { label: "Archived",         tone: "neutral" },

  // ── settled, no action ───────────────────────────────────────────────────
  refunded:        { label: "Refunded",         tone: "neutral" },
  inactive:        { label: "Inactive",         tone: "neutral" },
  draft:           { label: "Draft",            tone: "neutral" },
};

export interface StatusMeta {
  label: string;
  tone: Tone;
  /** Tinted pill classes — the default rendering. */
  pillClass: string;
  /** Solid dot classes, for the dot + text treatment on the verify screen. */
  dotClass: string;
  /** Text colour matching the tone, for that same treatment. */
  textClass: string;
}

/**
 * Resolve a raw status. Unknown values fall back to a neutral pill with the
 * value humanised (`pending_pickup` → "Pending pickup") rather than a raw
 * snake_case string leaking into the UI.
 */
export function statusMeta(status: string | null | undefined): StatusMeta {
  const key = String(status ?? "").trim().toLowerCase();
  const hit = STATUS[key];
  const tone: Tone = hit?.tone ?? "neutral";
  const label =
    hit?.label ??
    (key
      ? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
      : "Unknown");
  return {
    label,
    tone,
    pillClass: TONE_PILL[tone],
    dotClass: TONE_DOT[tone],
    textClass: TONE_TEXT[tone],
  };
}

/** Just the label — for subtitles and sentences that aren't pills. */
export function statusLabel(status: string | null | undefined): string {
  return statusMeta(status).label;
}

/**
 * The canonical status pill. Flat tinted chip, no border, no shadow —
 * DESIGN.md §2.
 */
export function StatusPill({
  status,
  icon,
  className,
  label: labelOverride,
}: {
  status: string | null | undefined;
  /** Optional leading glyph (the provider-application list uses one). */
  icon?: ReactNode;
  className?: string;
  /** Override the dictionary label without losing the tone. */
  label?: string;
}) {
  const meta = statusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        meta.pillClass,
        className,
      )}
    >
      {icon}
      {labelOverride ?? meta.label}
    </span>
  );
}
