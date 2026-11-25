import {
  Bell,
  CalendarDays,
  CircleX,
  Clock,
  CreditCard,
  Megaphone,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Store,
  TriangleAlert,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { UserNotification } from "@/hooks/useNotifications";
import { tr, DATE_LOCALE } from "@/lib/tr";

/**
 * How a notification looks: the presentation layer between the raw
 * `user_notifications` row and the card.
 *
 * The rows are written by a dozen producers (crons, SQL triggers, the API)
 * over many months, so their copy is uneven: ISO dates next to "November 17,
 * 2026", names in capitals, emoji in titles, and one subscription's lifecycle
 * spread over four separate rows. Everything here is pure, so the page, the
 * bell's panel and the spec see the same thing.
 */

// ─── Tone & icon ──────────────────────────────────────────────────────────────

/**
 * The icon tile's colour. Few on purpose: orange is the plan itself, green is
 * money that arrived, amber needs the person, red failed, blue (info) is the schedule,
 * news is plain ink. Everything else stays neutral.
 */
export type Tone = "brand" | "positive" | "attention" | "negative" | "schedule" | "news" | "neutral";

export const TONE_CLASS: Record<Tone, string> = {
  brand:     "bg-primary/15 text-primary",
  positive:  "bg-positive/15 text-positive",
  attention: "bg-attention/15 text-attention",
  negative:  "bg-negative/15 text-negative",
  schedule:  "bg-info/15 text-info",
  news:      "bg-foreground/10 text-foreground",
  neutral:   "bg-inset text-muted-foreground",
};

export interface NotificationAction {
  label: string;
  url: string;
  /** Filled orange for the thing that keeps a plan going; quiet otherwise. */
  primary?: boolean;
}

export interface Presentation {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  body: string;
  action: NotificationAction | null;
  /** About a business the person runs, not something they bought. */
  isBusiness: boolean;
}

const stage = (n: UserNotification): string | null => {
  const s = n.metadata?.stage;
  return typeof s === "string" ? s : null;
};

export function isBusinessNotification(n: UserNotification): boolean {
  if (n.category === "business" || n.category === "payout") return true;
  if (n.type === "refund_requested" || n.type.startsWith("promotion_")) return true;
  if (n.type.startsWith("provider_") && n.type !== "provider_broadcast") return true;
  return !!n.actionUrl && n.actionUrl.startsWith("/my-provider");
}

function look(n: UserNotification): { icon: LucideIcon; tone: Tone; action?: Omit<NotificationAction, "url"> } {
  const st = stage(n);
  if (st?.startsWith("winback")) return { icon: RotateCcw, tone: "brand", action: { label: tr("Subscribe again"), primary: true } };
  if (st?.startsWith("unscheduled")) {
    return isBusinessNotification(n)
      ? { icon: CalendarDays, tone: "attention", action: { label: tr("Open customer") } }
      : { icon: CalendarDays, tone: "attention", action: { label: tr("Choose a time"), primary: true } };
  }

  switch (n.type) {
    case "subscription_expiring_soon":
    case "subscription_expiring_tomorrow":
      return { icon: RefreshCw, tone: "attention", action: { label: tr("Renew"), primary: true } };
    case "subscription_expired":
      return { icon: RefreshCw, tone: "neutral", action: { label: tr("Renew"), primary: true } };
    case "subscription_created":
      return { icon: Sparkles, tone: "positive", action: { label: tr("View plan") } };
    case "plan_cancelled":
      return { icon: CircleX, tone: "neutral" };
    case "payment_received":
      return { icon: CreditCard, tone: "positive" };
    case "payment_pending":
      return { icon: CreditCard, tone: "attention", action: { label: tr("Pay now"), primary: true } };
    case "reminder_occurrence":
      return { icon: UtensilsCrossed, tone: "schedule" };
    case "provider_new_order":
      return { icon: ShoppingBag, tone: "positive", action: { label: tr("Open order") } };
    case "provider_cancellation":
      return { icon: Store, tone: "attention", action: { label: tr("View") } };
    case "refund_requested":
      return { icon: TriangleAlert, tone: "attention", action: { label: tr("Review") } };
    case "payout_paid":
    case "payout_approved":
      return { icon: Wallet, tone: "positive" };
    case "payout_failed":
    case "payout_rejected":
      return { icon: Wallet, tone: "negative", action: { label: tr("Check payout") } };
    case "wallet_short":
      return { icon: Wallet, tone: "attention", action: { label: tr("Top up"), primary: true } };
    case "wallet_renewed":
      return { icon: Wallet, tone: "positive" };
    case "review_reply":
      return { icon: MessageCircle, tone: "schedule", action: { label: tr("View reply") } };
    case "provider_application_new":
      return { icon: Store, tone: "news", action: { label: tr("Review") } };
  }

  switch (n.category) {
    case "reminder":     return { icon: Clock, tone: "schedule" };
    case "booking":      return { icon: CalendarDays, tone: "schedule" };
    case "payment":      return { icon: CreditCard, tone: "neutral" };
    case "subscription":
    case "plan":         return { icon: Sparkles, tone: "brand" };
    case "announcement": return { icon: Megaphone, tone: "news" };
    case "business":     return { icon: Store, tone: "news" };
    case "payout":       return { icon: Wallet, tone: "neutral" };
    default:             return { icon: Bell, tone: "neutral" };
  }
}

export function present(n: UserNotification, now = new Date()): Presentation {
  const { icon, tone, action } = look(n);
  return {
    icon,
    tone,
    title: tidyText(stripLeadingEmoji(n.title), now),
    body: tidyText(n.body ?? "", now),
    action: action && n.actionUrl ? { ...action, url: n.actionUrl } : null,
    isBusiness: isBusinessNotification(n),
  };
}

// ─── Copy clean-up ────────────────────────────────────────────────────────────

/** Emoji at the start of a title ("🧹 Cleaning Reminder") — the icon tile already says what it is. */
export const stripLeadingEmoji = (t: string) => t.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, "");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

/** "Dec 4", with the year only when it isn't this year's. */
export function shortDate(d: Date, now = new Date()): string {
  const s = `${SHORT[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? s : `${s}, ${d.getFullYear()}`;
}

/**
 * One date format and no shouting:
 *   "runs until 2026-12-04"      → "runs until Dec 4"
 *   "ended on November 17, 2026" → "ended on Nov 17"
 *   "for LUKE FRAZIER"           → "for Luke Frazier"
 * A single capitalised word (USD, a promo code) is left alone — only a run
 * of two or more all-caps words is a name typed with caps lock on.
 */
export function tidyText(text: string, now = new Date()): string {
  return text
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, y, mo, d) => {
      const date = new Date(Number(y), Number(mo) - 1, Number(d));
      return Number.isNaN(date.getTime()) ? m : shortDate(date, now);
    })
    .replace(new RegExp(`\\b(${MONTHS.join("|")}) (\\d{1,2}), (\\d{4})\\b`, "g"), (_m, mo, d, y) =>
      shortDate(new Date(Number(y), MONTHS.indexOf(mo), Number(d)), now))
    .replace(/\b[A-Z][A-Z'’]+(?:[ -][A-Z][A-Z'’]+)+\b/g, (run) =>
      run.toLowerCase().replace(/(^|[ -])(\p{L})/gu, (_m, sep, c) => sep + c.toUpperCase()));
}

// ─── Time ─────────────────────────────────────────────────────────────────────

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export type DayGroup = "Today" | "Yesterday" | "Earlier";

export function dayGroup(iso: string, now = new Date()): DayGroup {
  const days = Math.round((startOfDay(now).getTime() - startOfDay(new Date(iso)).getTime()) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : "Earlier";
}

/** "Now", "25m", "3h" today; "3:05 PM" yesterday; "Nov 17" before that. */
export function shortTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const group = dayGroup(iso, now);
  if (group === "Today") {
    const mins = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 60_000));
    if (mins < 1) return "Now";
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h`;
  }
  if (group === "Yesterday") {
    return d.toLocaleTimeString(DATE_LOCALE, { hour: "numeric", minute: "2-digit" });
  }
  return shortDate(d, now);
}

// ─── Chains ───────────────────────────────────────────────────────────────────

/**
 * One card per story. A plan's end is told four times — "ends in 2 days",
 * "ends tomorrow", "has ended", "want it back?" — each a row of its own about
 * the same subscription. They share `related_entity_id` and carry a
 * lifecycle `stage`; the newest speaks for all of them and the rest fold in.
 */
const LIFECYCLE_TYPES = new Set(["subscription_expiring_soon", "subscription_expiring_tomorrow", "subscription_expired"]);

export function chainKey(n: UserNotification): string | null {
  if (!n.relatedEntityId) return null;
  const st = stage(n);
  const lifecycle = LIFECYCLE_TYPES.has(n.type) || (!!st && (st.startsWith("winback") || /^\d+_day$/.test(st) || st === "expired"));
  return lifecycle ? `${n.relatedEntityType ?? ""}:${n.relatedEntityId}` : null;
}

/** A short name for a step in a chain, for the folded history line. */
export function stepLabel(n: UserNotification): string {
  const st = stage(n);
  if (st === "expired" || n.type === "subscription_expired") return tr("Ended");
  if (st === "1_day" || n.type === "subscription_expiring_tomorrow") return tr("Ends tomorrow");
  const days = st?.match(/^(\d+)_day$/);
  if (days) return tr("Ends in {value} days", { value: days[1] });
  if (st?.startsWith("winback")) return /%/.test(n.title) ? tr("Discount offer") : tr("Want it back?");
  return stripLeadingEmoji(n.title);
}

export interface NotificationGroup {
  /** The newest notification in the chain — what the card shows. */
  lead: UserNotification;
  /** Older notifications in the same chain, newest first. */
  earlier: UserNotification[];
  ids: string[];
  isRead: boolean;
}

/** Input newest first (as the query returns it); output keeps that order by lead. */
export function collapseChains(list: UserNotification[]): NotificationGroup[] {
  const byKey = new Map<string, NotificationGroup>();
  const out: NotificationGroup[] = [];
  for (const n of list) {
    const key = chainKey(n);
    const existing = key ? byKey.get(key) : undefined;
    if (existing) {
      existing.earlier.push(n);
      existing.ids.push(n.id);
      existing.isRead = existing.isRead && n.isRead;
      continue;
    }
    const g: NotificationGroup = { lead: n, earlier: [], ids: [n.id], isRead: n.isRead };
    if (key) byKey.set(key, g);
    out.push(g);
  }
  return out;
}

export function groupByDay(groups: NotificationGroup[], now = new Date()): Array<{ day: DayGroup; items: NotificationGroup[] }> {
  const order: DayGroup[] = ["Today", "Yesterday", "Earlier"];
  const buckets = new Map<DayGroup, NotificationGroup[]>();
  for (const g of groups) {
    const day = dayGroup(g.lead.createdAt, now);
    buckets.set(day, [...(buckets.get(day) ?? []), g]);
  }
  return order.filter((d) => buckets.has(d)).map((day) => ({ day, items: buckets.get(day)! }));
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export type NotificationFilter = "all" | "unread" | "business";

export function applyFilter(groups: NotificationGroup[], filter: NotificationFilter): NotificationGroup[] {
  if (filter === "unread") return groups.filter((g) => !g.isRead);
  if (filter === "business") return groups.filter((g) => isBusinessNotification(g.lead));
  return groups;
}

/** Same-origin paths go through the router; a car booking points at another origin. */
export function openNotificationUrl(url: string, navigate: (to: string) => void) {
  if (/^https?:\/\//i.test(url)) window.location.href = url;
  else navigate(url);
}
