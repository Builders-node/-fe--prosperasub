import {
  Bell, CalendarDays, Car, Check, Clock, CreditCard, Dumbbell, Gift, Heart, Home, KeyRound, MapPin,
  MessageCircle, Phone, QrCode, Repeat, Search, ShieldCheck, SlidersHorizontal, Smile, Sparkles, Star,
  Truck, Utensils, type LucideIcon,
} from "lucide-react";
import type { TranslationKey } from "@/i18n";

/**
 * "How it works" — the steps a customer goes through with a business.
 *
 * A business may write its own (table provider_how_it_works, written through
 * the API's /account/providers/:id/how-it-works): one set for the whole
 * business and, optionally, one per plan. A plan page shows the plan's own
 * steps, else the business's, else the platform default below.
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
  search: { icon: Search, label: "Search" },
  sliders: { icon: SlidersHorizontal, label: "Options" },
  card: { icon: CreditCard, label: "Payment" },
  repeat: { icon: Repeat, label: "Repeats" },
  calendar: { icon: CalendarDays, label: "Calendar" },
  clock: { icon: Clock, label: "Time" },
  check: { icon: Check, label: "Done" },
  star: { icon: Star, label: "Star" },
  truck: { icon: Truck, label: "Delivery" },
  utensils: { icon: Utensils, label: "Food" },
  sparkles: { icon: Sparkles, label: "Cleaning" },
  qr: { icon: QrCode, label: "QR code" },
  bell: { icon: Bell, label: "Reminder" },
  chat: { icon: MessageCircle, label: "Message" },
  home: { icon: Home, label: "Home" },
  car: { icon: Car, label: "Car" },
  key: { icon: KeyRound, label: "Keys" },
  heart: { icon: Heart, label: "Care" },
  gift: { icon: Gift, label: "Gift" },
  map: { icon: MapPin, label: "Place" },
  phone: { icon: Phone, label: "Call" },
  dumbbell: { icon: Dumbbell, label: "Fitness" },
  shield: { icon: ShieldCheck, label: "Safe" },
  smile: { icon: Smile, label: "Enjoy" },
};

/** The platform's steps, for a business that has not written its own. */
const DEFAULT_ICONS = ["sliders", "card", "bell", "repeat"] as const;

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
  if (steps.length < L.minSteps) out.list = `Add at least ${L.minSteps} steps.`;
  if (steps.length > L.maxSteps) out.list = `At most ${L.maxSteps} steps.`;
  steps.forEach((s, i) => {
    const title = s.title.trim();
    if (!title) out.steps[i] = "Give this step a title.";
    else if (title.length > L.title) out.steps[i] = `The title is over ${L.title} characters.`;
    else if ((s.text ?? "").trim().length > L.text) out.steps[i] = `The text is over ${L.text} characters.`;
  });
  return out;
}

export const hasHowItWorksProblems = (p: ReturnType<typeof howItWorksProblems>) =>
  !!p.list || Object.keys(p.steps).length > 0;
