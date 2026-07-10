import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatUSD } from "@/lib/pricing";

/**
 * Entertainment (beach club) plan card — matches the unified borderless /
 * single-accent aesthetic shared with cleaning + rental cards.
 *
 * - Featured = filled `bg-primary/10`, not a border
 * - No border on the default state
 * - "Most Popular" is a compact overline pill
 * - Amenities list capped at 3 to keep the card mobile-first
 * - CTA is `rounded-2xl h-12`
 */
export function EntertainmentPlanCard({
  plan, onSubscribe,
}: {
  plan: any;
  onSubscribe: (id: string) => void;
}) {
  const featured = !!plan.featured;
  const amenities: string[] = plan.amenities ?? [];

  return (
    <article
      className={`group flex flex-col rounded-3xl p-5 transition-colors ${
        featured ? "bg-primary/10 hover:bg-primary/15" : "bg-card hover:bg-muted/40"
      }`}
    >
      {featured && (
        <span className="mb-2 self-start rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-primary">
          Most Popular
        </span>
      )}

      <h3 className="text-lg font-black tracking-tight text-foreground">{plan.name}</h3>
      {plan.tagline && (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{plan.tagline}</p>
      )}

      {amenities.length > 0 && (
        <ul className="mt-3 space-y-1">
          {amenities.slice(0, 3).map((a: string, i: number) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              {a}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-2xl font-black tabular-nums text-foreground">
          {formatUSD(plan.price_per_person_cents)}
        </span>
        <span className="text-sm text-muted-foreground">/ person · month</span>
      </div>

      <Button
        size="lg"
        className="mt-4 h-12 w-full rounded-2xl text-base font-bold"
        onClick={() => onSubscribe(plan.id)}
      >
        Subscribe <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </article>
  );
}
