/**
 * Yandex Go-style primitives — shared design language for all public pages.
 *
 * Aesthetic:
 *  - Soft rounded-3xl cards with subtle gradient accents
 *  - Playful "layered illustration" icons (glow + gradient block + drop shadow)
 *  - Playful hover scale (1.02) + icon scale (1.10)
 *  - Bold black headings + tabular pricing
 *  - Accent colour per service: sky (cleaning), orange (cars), emerald (food)
 */
import React from "react";

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

// ─── Hero ─────────────────────────────────────────────────────────────────────
export function YdHero({
  accent,
  badge,
  badgeIcon: BadgeIcon,
  title,
  subtitle,
  illustration,
}: {
  accent: YdAccent;
  badge: string;
  badgeIcon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  subtitle?: string;
  illustration?: React.ReactNode;
}) {
  const a = YD_ACCENT[accent];
  return (
    <section className="mb-6 md:mb-8">
      <div className="grid items-center gap-4 rounded-3xl bg-card p-6 md:p-8 md:grid-cols-[1fr_auto]">
        <div>
          <div className={`inline-flex items-center gap-2 rounded-full ${a.bgChip} px-3 py-1 ${a.text}`}>
            {BadgeIcon && <BadgeIcon className="h-3.5 w-3.5" />}
            <span className="text-[11px] font-bold uppercase tracking-[0.16em]">
              {badge}
            </span>
          </div>
          <h1 className="mt-3 text-3xl md:text-4xl font-black tracking-tight text-foreground leading-[1.05]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 max-w-xl text-sm md:text-base text-muted-foreground leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
        {illustration && (
          <div className="hidden md:block">
            {illustration}
          </div>
        )}
      </div>
    </section>
  );
}

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

// ─── Service chip (small pill with icon + text) ───────────────────────────────
export function YdChip({
  icon: Icon,
  label,
  accent,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  accent?: YdAccent;
}) {
  if (accent) {
    const a = YD_ACCENT[accent];
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full ${a.bgChip} px-3 py-1 text-xs font-bold ${a.text}`}>
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </span>
  );
}

// ─── Card shell ───────────────────────────────────────────────────────────────
export function YdCard({
  accent,
  children,
  className = "",
  onClick,
}: {
  accent?: YdAccent;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const accentClass = accent
    ? `${YD_ACCENT[accent].bgGradient} ${YD_ACCENT[accent].hoverBorder}`
    : "bg-card hover:border-foreground/20";
  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-3xl border border-border
                  ${accentClass}
                  transition-all duration-200 ease-out
                  ${onClick ? "cursor-pointer motion-safe:hover:scale-[1.02] hover: active:scale-[0.99]" : ""}
                  ${className}`}
    >
      {children}
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
