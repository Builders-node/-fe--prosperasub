import { useNavigate } from "react-router-dom";
import { LayoutGrid, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Photo } from "@/components/patterns/Photo";
import { useCart } from "@/contexts/CartContext";
import { trackEvent } from "@/lib/analytics/ga";
import { formatUSD } from "@/lib/pricing";
import { normPeriod, periodNoun } from "@/lib/services/planPeriod";
import { useUpsells, type Upsell } from "@/lib/upsells/useUpsells";
import { cn } from "@/lib/utils";

/**
 * "Add to your order" — one block, in the cart and under a product.
 *
 * A row opens the product; the button does the buying: `+ Add` when it can go
 * in the cart as it is, `Choose` when it needs a decision first. Nothing shows
 * while loading or when there is nothing to suggest — an empty heading is
 * worse than no heading.
 */
export function UpsellSection({
  title, placement, exclude, excludeProviderId, limit = 3, className, gridClassName,
}: {
  title: string;
  /** For analytics: where the suggestion was taken. */
  placement: "cart" | "plan" | "vehicle";
  exclude?: Array<string | null | undefined>;
  excludeProviderId?: string | null;
  limit?: number;
  className?: string;
  gridClassName?: string;
}) {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const upsells = useUpsells({ exclude, excludeProviderId, limit });
  if (!upsells.length) return null;

  const open = (u: Upsell) => {
    trackEvent("select_item", { item_list_name: `upsell_${placement}`, items: [{ item_id: u.id, item_name: u.name }] });
    navigate(u.href);
  };
  const add = (u: Upsell) => {
    // The same line the plan page's "Add to cart" writes.
    addItem({
      service: "plan",
      providerId: u.providerId,
      providerName: u.providerName,
      planId: u.id,
      planName: u.name,
      unitPriceCents: u.priceCents,
      periods: 1,
    }, 1);
    trackEvent("add_to_cart", {
      currency: "USD", value: u.priceCents / 100, item_list_name: `upsell_${placement}`,
      items: [{ item_id: u.id, item_name: u.name, price: u.priceCents / 100 }],
    });
    // In the cart the line appearing above is the feedback; elsewhere say so.
    if (placement !== "cart") {
      toast.success("Saved to your cart", { action: { label: "View cart", onClick: () => navigate("/cart") } });
    }
  };

  return (
    <section className={cn("space-y-3", className)}>
      <h2 className="text-heading font-semibold text-foreground">{title}</h2>
      <div className={cn("grid grid-cols-1 gap-2", gridClassName)}>
        {upsells.map((u) => {
          const noun = normPeriod(u.period) === "one_time" ? "" : periodNoun(u.period);
          return (
            <article
              key={u.id}
              role="link"
              tabIndex={0}
              onClick={() => open(u)}
              onKeyDown={(e) => { if (e.key === "Enter") open(u); }}
              className="flex min-w-0 cursor-pointer items-center gap-3 rounded-radius-md bg-card p-2 pr-3 shadow-figma transition-colors hover:bg-muted/40"
            >
              <div className="relative size-16 shrink-0 overflow-hidden rounded-[8px] bg-inset">
                <Photo src={u.photo} icon={LayoutGrid} className="absolute inset-0" iconClassName="h-6 w-6 min-h-6 min-w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold text-foreground">{u.name}</p>
                <p className="truncate text-meta text-muted-foreground">{u.providerName}</p>
                <p className="truncate text-meta tabular-nums text-foreground">
                  {u.from ? "From " : ""}{formatUSD(u.priceCents)}{noun ? ` / ${noun}` : ""}
                </p>
              </div>
              {u.quickAdd ? (
                <Button size="sm" variant="secondary" className="shrink-0 gap-1"
                  onClick={(e) => { e.stopPropagation(); add(u); }}>
                  <Plus className="h-4 w-4" /> Add
                </Button>
              ) : (
                <Button size="sm" variant="secondary" className="shrink-0"
                  onClick={(e) => { e.stopPropagation(); open(u); }}>
                  Choose
                </Button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
