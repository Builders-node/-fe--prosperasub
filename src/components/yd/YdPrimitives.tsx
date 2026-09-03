/**
 * The two Yandex-style primitives the platform actually uses.
 *
 *   • YdIllustration — the solid accent tile behind a service icon
 *   • YdEmptyState   — icon, a line, a quieter line, an optional button
 *
 * There were five. YdHero, YdChip and YdCard were presented in DESIGN.md as
 * the house vocabulary and had **no consumers at all** — pages built their own
 * hero, their own chip and their own card next to them. A primitive nobody
 * imports is not a design system, it is a second opinion, so they are gone.
 * The accent palette below stays: it is what gives every service one colour.
 */
import React from "react";
import { cn } from "@/lib/utils";

// ─── Accent palette ───────────────────────────────────────────────────────────
export type YdAccent = "sky" | "orange" | "emerald" | "amber" | "violet" | "rose";

export const YD_ACCENT: Record<YdAccent, {
  text: string;
  textSoft: string;
  bgChip: string;
  bgGradient: string;
  glow: string;
  blockGrad: string;
  shadow: string;
  ring: string;
  hoverBorder: string;
  cta: string;
}> = {
  sky: {
    text: "text-sky-600 dark:text-sky-300",
    textSoft: "text-sky-700 dark:text-sky-400",
    bgChip: "bg-sky-500/15",
    bgGradient: "",
    glow: "bg-sky-500/30",
    blockGrad: "",
    shadow: "",
    ring: "focus-visible:ring-sky-500",
    hoverBorder: "hover:border-sky-500/40",
    cta: "bg-sky-500 hover:bg-sky-500/90 text-white",
  },
  orange: {
    text: "text-orange-600 dark:text-orange-300",
    textSoft: "text-orange-700 dark:text-orange-400",
    bgChip: "bg-orange-500/15",
    bgGradient: "",
    glow: "bg-orange-500/30",
    blockGrad: "",
    shadow: "",
    ring: "focus-visible:ring-orange-500",
    hoverBorder: "hover:border-orange-500/40",
    cta: "bg-primary text-black hover:bg-[hsl(var(--brand-accent-hover))]",
  },
  emerald: {
    text: "text-emerald-600 dark:text-emerald-300",
    textSoft: "text-emerald-700 dark:text-emerald-400",
    bgChip: "bg-emerald-500/15",
    bgGradient: "",
    glow: "bg-emerald-500/30",
    blockGrad: "",
    shadow: "",
    ring: "focus-visible:ring-emerald-500",
    hoverBorder: "hover:border-emerald-500/40",
    cta: "bg-emerald-500 hover:bg-emerald-500/90 text-white",
  },
  amber: {
    text: "text-amber-700 dark:text-amber-300",
    textSoft: "text-amber-800 dark:text-amber-400",
    bgChip: "bg-amber-500/15",
    bgGradient: "",
    glow: "bg-amber-500/30",
    blockGrad: "",
    shadow: "",
    ring: "focus-visible:ring-amber-500",
    hoverBorder: "hover:border-amber-500/40",
    cta: "bg-primary text-black hover:bg-[hsl(var(--brand-accent-hover))]",
  },
  violet: {
    text: "text-violet-600 dark:text-violet-300",
    textSoft: "text-violet-700 dark:text-violet-400",
    bgChip: "bg-violet-500/15",
    bgGradient: "",
    glow: "bg-violet-500/30",
    blockGrad: "",
    shadow: "",
    ring: "focus-visible:ring-violet-500",
    hoverBorder: "hover:border-violet-500/40",
    cta: "bg-violet-500 hover:bg-violet-500/90 text-white",
  },
  rose: {
    text: "text-rose-600 dark:text-rose-300",
    textSoft: "text-rose-700 dark:text-rose-400",
    bgChip: "bg-rose-500/15",
    bgGradient: "",
    glow: "bg-rose-500/30",
    blockGrad: "",
    shadow: "",
    ring: "focus-visible:ring-rose-500",
    hoverBorder: "hover:border-rose-500/40",
    cta: "bg-rose-500 hover:bg-rose-500/90 text-white",
  },
};

// ─── Flat illustration tile (Yandex Go style — solid bg, no gradient/glow/shadow) ─────
export function YdIllustration({
  icon: Icon,
  accent,
  size = "md",
}: {
  icon: React.ComponentType<{ className?: string }>;
  accent: YdAccent;
  size?: "sm" | "md" | "lg";
}) {
  const a = YD_ACCENT[accent];
  const blockSize =
    size === "lg" ? "h-20 w-20" :
    size === "sm" ? "h-12 w-12" :
    "h-16 w-16";
  const iconSize =
    size === "lg" ? "h-10 w-10" :
    size === "sm" ? "h-5 w-5" :
    "h-7 w-7";

  return (
    <div className={`flex ${blockSize} items-center justify-center rounded-2xl ${a.bgChip}`}>
      <Icon className={`${iconSize} ${a.text}`} />
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
export function YdEmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl bg-card py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
        <Icon className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <p className="text-base font-bold text-foreground">{title}</p>
      {subtitle && (
        <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
          {subtitle}
        </p>
      )}
    </div>
  );
}

/**
 * A section heading, in the one size the design gives one.
 *
 * There were fourteen of these written by hand — `text-xl font-black`,
 * `text-2xl font-black`, `text-lg font-black`, `text-base font-black`, and a
 * 12px uppercase eyebrow standing in for a heading in the admin — against
 * seventeen written the way DESIGN.md §3 specifies. Discovery had one as a
 * local component, so nobody else could use it even if they wanted to.
 *
 * This is that one, exported: 20px semibold at -0.4px, with the optional
 * count the listings show in parentheses.
 */
export function YdSectionHeading({
  title, count, className, action,
}: {
  title: string;
  /** Rendered as "(N)" beside the title, the way the listings do it. */
  count?: number | null;
  className?: string;
  /** A control on the right — a "see all" link, a filter. */
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-3 flex items-baseline justify-between gap-3", className)}>
      <h2 className="min-w-0 text-[20px] font-semibold tracking-[-0.4px] text-foreground">
        <span className="truncate">{title}</span>
        {count != null && (
          <span className="ml-2 text-base font-normal text-muted-foreground">({count})</span>
        )}
      </h2>
      {action}
    </div>
  );
}
