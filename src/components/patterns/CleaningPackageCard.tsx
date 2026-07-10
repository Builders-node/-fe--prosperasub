import { SparklesIcon, ArrowRight, Check, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatUSD } from "@/lib/pricing";
import {
  formatFrequencyLabel, formatPricingLabel, resolveMonthlyPriceCents,
} from "@/lib/cleaningPlanPricing";

/**
 * Cleaning package card — matches the borderless / single-accent aesthetic
 * used across the app (see FoodProviderDetail's MealPlanCard).
 *
 * - Featured = filled `bg-primary/10` background, not a border
 * - No border on the default state (canonical flat card)
 * - "Most Popular" is a small overline pill, not a bright chip
 * - Feature list capped at 3 to keep the card short on mobile
 * - CTA is `rounded-2xl` (not `rounded-full` pill) to match Cart / checkouts
 */
export function CleaningPackageCard({
  pkg, featured = false, onSubscribe,
}: {
  pkg: any;
  featured?: boolean;
  onSubscribe: (id: string) => void;
}) {
  const features: string[] = Array.isArray(pkg.features) ? pkg.features : [];
  const monthlyCents = resolveMonthlyPriceCents(pkg);

  return (
    <article
      className={`group flex flex-col rounded-3xl p-5 transition-colors ${
        featured ? "bg-primary/10 hover:bg-primary/15" : "bg-card hover:bg-muted/40"
      }`}
    >
      {featured && (
        <span className="mb-3 self-start rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-primary">
          Most Popular
        </span>
      )}

      <h3 className="text-lg font-black tracking-tight text-foreground">{pkg.name}</h3>
      {pkg.description && (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{pkg.description}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <SparklesIcon className="h-3 w-3" />
          {formatPricingLabel(pkg)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          {formatFrequencyLabel(pkg)}
        </span>
      </div>

      {features.length > 0 && (
        <ul className="mt-3 space-y-1">
          {features.slice(0, 3).map((f) => (
            <li key={f} className="flex items-start gap-2 text-[13px] text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              {f}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-2xl font-black tabular-nums text-foreground">
          {formatUSD(monthlyCents)}
        </span>
        <span className="text-sm text-muted-foreground">/ month</span>
      </div>

      <Button
        size="lg"
        className="mt-4 h-12 w-full rounded-2xl text-base font-bold"
        onClick={() => onSubscribe(pkg.id)}
      >
        Subscribe <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </article>
  );
}
