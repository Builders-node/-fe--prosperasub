import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ─── TabHeaderCTA ──────────────────────────────────────────────────────────
// One-per-tab "Browse Plans / Vehicles / Restaurants" button. Optional
// secondary action shown as a filled foreground button next to it — used e.g.
// for "Book a court" (Beach) or "Set Schedule" (Cleaning).

interface TabHeaderProps {
  primary: { label: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void };
  secondary?: { label: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void };
}
export function TabHeaderCTA({ primary, secondary }: TabHeaderProps) {
  const PIcon = primary.icon;
  const SIcon = secondary?.icon;
  return (
    <div className={cn("grid gap-2", secondary ? "grid-cols-2" : "grid-cols-1")}>
      <button
        type="button"
        onClick={primary.onClick}
        className="flex items-center justify-center gap-2 rounded-2xl bg-card py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
      >
        <PIcon className="h-4 w-4" />
        {primary.label}
      </button>
      {secondary && SIcon && (
        <button
          type="button"
          onClick={secondary.onClick}
          className="flex items-center justify-center gap-2 rounded-2xl bg-foreground py-3 text-sm font-bold text-background transition-colors hover:bg-foreground/90"
        >
          <SIcon className="h-4 w-4" />
          {secondary.label}
        </button>
      )}
    </div>
  );
}

// ─── SectionOverline ───────────────────────────────────────────────────────
// The compact "ACTIVE PLAN · 1" / "UPCOMING · 0" / "HISTORY · 7" overlines
// Cleaning already uses. Bringing them to every tab makes the page scannable
// at a glance across services.

interface OverlineProps {
  label: string;
  count?: number | string;
  tone?: "default" | "warning" | "success";
  className?: string;
}
export function SectionOverline({ label, count, tone = "default", className }: OverlineProps) {
  const toneClass =
    tone === "warning" ? "text-amber-500" :
    tone === "success" ? "text-emerald-500" :
    "text-muted-foreground";
  return (
    <p className={cn("text-[10px] font-black uppercase tracking-[0.14em]", toneClass, className)}>
      {label}
      {count !== undefined && count !== null && <> · <span className="tabular-nums">{count}</span></>}
    </p>
  );
}

// ─── TabEmptyState ─────────────────────────────────────────────────────────
// Same empty pattern for every service — icon in center, title + subtitle,
// optional CTA button. Replaces four near-identical inline copies.

interface EmptyProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}
export function TabEmptyState({ icon: Icon, title, subtitle, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl bg-card py-14 text-center">
      <Icon className="mb-3 h-10 w-10 text-muted-foreground/40" />
      <p className="font-semibold text-foreground">{title}</p>
      {subtitle && (
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{subtitle}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background transition-colors hover:bg-foreground/90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ─── SectionGroup ──────────────────────────────────────────────────────────
// A titled section: SectionOverline + children in a `space-y-3` list.
// Renders nothing if children is empty (used with array length checks).

interface SectionGroupProps {
  label: string;
  count?: number;
  tone?: "default" | "warning" | "success";
  children: ReactNode;
}
export function SectionGroup({ label, count, tone, children }: SectionGroupProps) {
  return (
    <section className="space-y-2">
      <SectionOverline label={label} count={count} tone={tone} />
      <div className="space-y-3">{children}</div>
    </section>
  );
}
