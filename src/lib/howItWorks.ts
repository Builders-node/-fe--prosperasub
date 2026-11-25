import {
  Bell, CalendarDays, Car, Check, Clock, CreditCard, Dumbbell, Gift, Heart, Home, KeyRound, MapPin,
  MessageCircle, Phone, QrCode, Repeat, Search, ShieldCheck, SlidersHorizontal, Smile, Sparkles, Star,
  Truck, Utensils, type LucideIcon,
} from "lucide-react";
import type { TranslationKey } from "@/i18n";
import { tr } from "@/lib/tr";

/**
 * "How it works" — the steps a customer goes through with a business.
 *
 * A business may write its own (table provider_how_it_works, written through
 * the API's /account/providers/:id/how-it-works): one set for the whole
 * business and, optionally, one per plan. They are shown AFTER a purchase —
 * on the checkout's success screen and behind "How it works" on the order in
 * My subscriptions: the plan's own steps, else the business's, else the
 * platform default below.
 *
 * The API keeps the same icon keys and limits (routes/how-it-works.ts) and
 * the database checks the shape again — change all three together.
 */

export interface HowItWorksStep {
  title: string;
  text: string | null;
  /** A key of HOW_IT_WORKS_ICONS; null = the step's number alone. */
  icon: string | null;
}

export interface HowItWorksRow {
  id: string;
  provider_id: string;
  plan_id: string | null;
  steps: HowItWorksStep[];
  updated_at: string;
}

export const HOW_IT_WORKS_LIMITS = { minSteps: 2, maxSteps: 6, title: 60, text: 240 } as const;

export const HOW_IT_WORKS_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  search: { icon: Search, label: tr("Search") },
  sliders: { icon: SlidersHorizontal, label: tr("Options") },
  card: { icon: CreditCard, label: tr("Payment") },
  repeat: { icon: Repeat, label: tr("Repeats") },
  calendar: { icon: CalendarDays, label: tr("Calendar") },
  clock: { icon: Clock, label: tr("Time") },
  check: { icon: Check, label: tr("Done") },
  star: { icon: Star, label: tr("Star") },
  truck: { icon: Truck, label: tr("Delivery") },
  utensils: { icon: Utensils, label: tr("Food") },
  sparkles: { icon: Sparkles, label: tr("Cleaning") },
  qr: { icon: QrCode, label: tr("QR code") },
  bell: { icon: Bell, label: tr("Reminder") },
  chat: { icon: MessageCircle, label: tr("Message") },
  home: { icon: Home, label: tr("Home") },
  car: { icon: Car, label: tr("Car") },
  key: { icon: KeyRound, label: tr("Keys") },
  heart: { icon: Heart, label: tr("Care") },
  gift: { icon: Gift, label: tr("Gift") },
  map: { icon: MapPin, label: tr("Place") },
  phone: { icon: Phone, label: tr("Call") },
  dumbbell: { icon: Dumbbell, label: tr("Fitness") },
  shield: { icon: ShieldCheck, label: tr("Safe") },
  smile: { icon: Smile, label: tr("Enjoy") },
};

/** The platform's steps, for a business that has not written its own. */
const DEFAULT_ICONS = ["check", "chat", "calendar", "qr"] as const;

export function defaultHowItWorks(t: (key: TranslationKey) => string): HowItWorksStep[] {
  return DEFAULT_ICONS.map((icon, i) => ({
    title: t(`howItWorks.default.${i + 1}.title` as TranslationKey),
    text: t(`howItWorks.default.${i + 1}.text` as TranslationKey),
    icon,
  }));
}

/** Which set a page shows: the plan's, the business's, or none of theirs (→ default). */
export function pickHowItWorks(rows: HowItWorksRow[] | null | undefined, planId?: string | null):
  { steps: HowItWorksStep[]; source: "plan" | "business" } | null {
  const list = rows ?? [];
  const own = planId ? list.find((r) => r.plan_id === planId) : undefined;
  if (own && cleanSteps(own.steps).length) return { steps: cleanSteps(own.steps), source: "plan" };
  const biz = list.find((r) => r.plan_id == null);
  if (biz && cleanSteps(biz.steps).length) return { steps: cleanSteps(biz.steps), source: "business" };
  return null;
}

/** Whatever came from the database, as steps a page can render. */
export function cleanSteps(raw: unknown): HowItWorksStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && typeof (s as any).title === "string")
    .map((s) => ({
      title: String(s.title).trim(),
      text: typeof s.text === "string" && s.text.trim() ? s.text.trim() : null,
      icon: typeof s.icon === "string" && s.icon in HOW_IT_WORKS_ICONS ? s.icon : null,
    }))
    .filter((s) => s.title);
}

/** What is wrong with a draft, step by step — empty when it can be saved. */
export function howItWorksProblems(steps: HowItWorksStep[]): { list?: string; steps: Record<number, string> } {
  const L = HOW_IT_WORKS_LIMITS;
  const out: { list?: string; steps: Record<number, string> } = { steps: {} };
  if (steps.length < L.minSteps) out.list = tr("Add at least {minSteps} steps.", { minSteps: L.minSteps });
  if (steps.length > L.maxSteps) out.list = tr("At most {maxSteps} steps.", { maxSteps: L.maxSteps });
  steps.forEach((s, i) => {
    const title = s.title.trim();
    if (!title) out.steps[i] = tr("Give this step a title.");
    else if (title.length > L.title) out.steps[i] = tr("The title is over {title} characters.", { title: L.title });
    else if ((s.text ?? "").trim().length > L.text) out.steps[i] = tr("The text is over {text} characters.", { text: L.text });
  });
  return out;
}

export const hasHowItWorksProblems = (p: ReturnType<typeof howItWorksProblems>) =>
  !!p.list || Object.keys(p.steps).length > 0;
