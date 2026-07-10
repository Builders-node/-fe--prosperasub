import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  /**
   * The icon shown inside the round plaque. Defaults to the service's own
   * icon — e.g. `UtensilsCrossed` for food, `Waves` for beach. The green
   * checkmark badge overlays the bottom-right of the plaque regardless.
   */
  icon: React.ComponentType<{ className?: string }>;
  /**
   * Tailwind bg class for the plaque background. Defaults to `bg-primary/15`.
   * Provide a brand color when the receipt is service-specific (matches the
   * icon behind it, e.g. `bg-primary/15` for food).
   */
  iconTint?: string;
  /** Tailwind text class for the icon glyph inside the plaque. */
  iconColor?: string;
  /**
   * The big centered display — usually the amount paid, formatted with sign
   * and currency (e.g. `−$540.00`). Kept as a slot instead of a string so
   * pages can inject `formatUSD` output or convert to sats.
   */
  amount: ReactNode;
  /**
   * Optional single-line eyebrow above the amount (e.g. "Payment received").
   * Rendered small and muted; skip if the amount alone tells the story.
   */
  eyebrow?: ReactNode;
  /**
   * Subtitle lines under the amount. Pass either a string or a fragment for
   * multi-line context (recipient, description, etc.).
   */
  subtitle: ReactNode;
  /** Primary CTA text ("Great" / "View subscriptions" / "Отлично"). */
  ctaLabel: string;
  onCta: () => void;
  /** Optional secondary text link under the primary CTA. */
  secondary?: { label: string; onClick: () => void };
  /**
   * Optional promo/next-action strip rendered above the CTA (Yandex Pay
   * shows Split offers here). Leave empty for a clean confirmation screen.
   */
  promo?: ReactNode;
  className?: string;
}

/**
 * Canonical post-payment success screen — Yandex Pay / Sberbank style:
 *
 *   ┌─────────────────────────────────────┐
 *   │                                     │
 *   │              ┌──────┐               │
 *   │              │ icon │ ✓             │  ← round plaque + green check badge
 *   │              └──────┘               │
 *   │                                     │
 *   │              −$540.00               │  ← big centered amount
 *   │                                     │
 *   │           Restaurant name           │  ← subtitle
 *   │                                     │
 *   ├─────────────────────────────────────┤
 *   │  [ optional promo strip ]           │
 *   │  [   full-width CTA   ]             │
 *   └─────────────────────────────────────┘
 *
 * Every success surface in the app (Cart, Beach checkout, Cleaning checkout,
 * Food plan checkout) should render through this instead of hand-rolling
 * its own layout — otherwise post-payment feels different per service.
 */
export function CheckoutSuccessPanel({
  icon: Icon,
  iconTint = "bg-primary/15",
  iconColor = "text-primary",
  amount,
  eyebrow,
  subtitle,
  ctaLabel,
  onCta,
  secondary,
  promo,
  className,
}: Props) {
  return (
    <div className={cn("flex min-h-[70vh] flex-col", className)}>
      {/* Center hero */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {/* Icon plaque + checkmark badge */}
        <div className="relative">
          <span className={cn("flex h-20 w-20 items-center justify-center rounded-full", iconTint)}>
            <Icon className={cn("h-9 w-9", iconColor)} />
          </span>
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-background">
            <Check className="h-4 w-4 text-white" strokeWidth={3.5} />
          </span>
        </div>

        {eyebrow && (
          <p className="mt-8 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
        )}

        {/* Big amount */}
        <p className="mt-6 text-5xl font-black tracking-tight tabular-nums text-foreground sm:text-6xl">
          {amount}
        </p>

        {/* Subtitle */}
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      </div>

      {/* Bottom CTA area */}
      <div className="space-y-3">
        {promo}
        <Button
          onClick={onCta}
          size="lg"
          className="h-14 w-full rounded-2xl text-base font-bold"
        >
          {ctaLabel}
        </Button>
        {secondary && (
          <button
            type="button"
            onClick={secondary.onClick}
            className="w-full py-2 text-center text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            {secondary.label}
          </button>
        )}
      </div>
    </div>
  );
}
