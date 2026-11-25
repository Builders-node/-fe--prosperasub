import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/tr";

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
  positive:  "bg-positive/15 text-positive",
  attention: "bg-attention/15 text-attention",
  negative:  "bg-destructive/15 text-destructive",
  neutral:   "bg-muted text-muted-foreground",
};

const TONE_DOT: Record<Tone, string> = {
  positive:  "bg-positive",
  attention: "bg-attention",
  negative:  "bg-destructive",
  neutral:   "bg-muted-foreground/40",
};

const TONE_TEXT: Record<Tone, string> = {
  positive:  "text-positive",
  attention: "text-attention",
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
  active:          { label: tr("Active"),           tone: "positive" },
  confirmed:       { label: tr("Confirmed"),        tone: "positive" },
  booked:          { label: tr("Booked"),           tone: "positive" },
  paid:            { label: tr("Paid"),             tone: "positive" },
  completed:       { label: tr("Completed"),        tone: "positive" },
  approved:        { label: tr("Approved"),         tone: "positive" },
  in_progress:     { label: tr("In progress"),      tone: "positive" },
  // Google Calendar sync. Shown on every cleaning booking row, so it needs a
  // tone rather than falling through to neutral like an unknown word.
  synced:          { label: tr("Synced"),           tone: "positive" },

  // ── needs the customer or an admin to do something ───────────────────────
  // One phrasing, everywhere. "Payment pending" and "Pending payment" are gone.
  pending:         { label: tr("Awaiting payment"), tone: "attention" },
  pending_payment: { label: tr("Awaiting payment"), tone: "attention" },
  // Paid for, waiting for the customer to pick a day. It was the one live
  // value missing from this table, so it fell through to the humaniser and
  // showed as a grey "Pending schedule" — the same colour as Archived, on a
  // subscription somebody had already paid for and was waiting to use.
  pending_schedule: { label: tr("Awaiting schedule"), tone: "attention" },
  // A booking that exists but has no money against it yet (car rentals list).
  unpaid:          { label: tr("Unpaid"),           tone: "attention" },
  held:            { label: tr("On hold"),          tone: "attention" },
  paused:          { label: tr("Paused"),           tone: "attention" },
  expiring_soon:   { label: tr("Expiring soon"),    tone: "attention" },
  trial:           { label: tr("Trial"),            tone: "attention" },
  under_review:    { label: tr("Under review"),     tone: "attention" },

  // ── stopped ──────────────────────────────────────────────────────────────
  // A visit whose day has passed and nobody marked done (or cancelled).
  not_marked_done: { label: tr("Not marked done"),  tone: "attention" },
  expired:         { label: tr("Expired"),          tone: "negative" },
  cancelled:       { label: tr("Cancelled"),        tone: "negative" },
  canceled:        { label: tr("Cancelled"),        tone: "negative" },
  rejected:        { label: tr("Not approved"),     tone: "negative" },
  failed:          { label: tr("Failed"),           tone: "negative" },

  // ── listing visibility (vehicles, plans) ─────────────────────────────────
  public:          { label: tr("Public"),           tone: "positive" },
  private:         { label: tr("Private"),          tone: "attention" },
  archived:        { label: tr("Archived"),         tone: "neutral" },
  // Promoted to the top of a listing (beach plans). A flag, not a lifecycle
  // state, but it sits in the same row of pills so it needs a tone.
  featured:        { label: tr("Featured"),         tone: "positive" },

  // ── settled, no action ───────────────────────────────────────────────────
  refunded:        { label: tr("Refunded"),         tone: "neutral" },
  inactive:        { label: tr("Inactive"),         tone: "neutral" },
  draft:           { label: tr("Draft"),            tone: "neutral" },
};

/**
 * The same word does not always mean the same thing.
 *
 * `pending` on a subscription means the customer still owes money; on a
 * provider APPLICATION it means a human hasn't looked at it yet. One table
 * cannot serve both, and rendering "Awaiting payment" over someone's shop
 * application would be nonsense — which is exactly why that page had grown its
 * own colour map and was printing the raw lowercase value instead.
 *
 * Add a context only when a word genuinely changes meaning. Everything not
 * listed here falls through to the shared table above.
 */
const CONTEXT: Record<string, Record<string, { label: string; tone: Tone }>> = {
  application: {
    pending: { label: tr("Under review"), tone: "attention" },
  },
  // A person, not a sale: has something running, had and lost it, or never.
  customer: {
    blocked: { label: tr("Blocked"), tone: "negative" },
    active: { label: tr("Active"), tone: "positive" },
    lapsed: { label: tr("Lapsed"), tone: "attention" },
    idle: { label: tr("No orders"), tone: "neutral" },
  },
};

export type StatusContext = keyof typeof CONTEXT;

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
export function statusMeta(
  status: string | null | undefined,
  context?: string,
): StatusMeta {
  const key = String(status ?? "").trim().toLowerCase();
  const hit = (context ? CONTEXT[context]?.[key] : undefined) ?? STATUS[key];
  const tone: Tone = hit?.tone ?? "neutral";
  const label =
    hit?.label ??
    (key
      ? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
      : tr("Unknown"));
  return {
    label,
    tone,
    pillClass: TONE_PILL[tone],
    dotClass: TONE_DOT[tone],
    textClass: TONE_TEXT[tone],
  };
}

/** Just the label — for subtitles and sentences that aren't pills. */
export function statusLabel(status: string | null | undefined, context?: string): string {
  return statusMeta(status, context).label;
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
  context,
}: {
  status: string | null | undefined;
  /** Optional leading glyph (the provider-application list uses one). */
  icon?: ReactNode;
  className?: string;
  /** Override the dictionary label without losing the tone. */
  label?: string;
  /** Where this status lives, when the word is ambiguous — see CONTEXT. */
  context?: string;
}) {
  const meta = statusMeta(status, context);
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
