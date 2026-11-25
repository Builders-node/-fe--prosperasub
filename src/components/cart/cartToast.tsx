import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { formatUSD } from "@/lib/pricing";

/**
 * "Added to your cart" — the one confirmation every Add-to-cart shows.
 *
 * It used to be a stock success toast: a near-black slab with a hard border
 * and a filled yellow "View cart" pill that, on a plan page, sat right above
 * the yellow Subscribe button and repeated the "In your cart · View cart" line
 * under it. This one is a soft card in the page's own surface colour that says
 * what went in (name and price) and how full the cart is now — the things the
 * line under the button doesn't — with a quiet text link instead of a second
 * yellow button competing with the real one. It leaves on its own after a
 * few seconds; swipe or tap the link to dismiss it sooner.
 */
export function showCartToast({
  name,
  priceCents,
  cartCount,
  onViewCart,
}: {
  name: string;
  priceCents?: number | null;
  /** Lines in the cart after this add, if known. */
  cartCount?: number;
  onViewCart: () => void;
}) {
  const meta = [
    name,
    priceCents ? formatUSD(priceCents) : null,
  ].filter(Boolean).join(" · ");
  const title = cartCount && cartCount > 1 ? `Added · ${cartCount} items in your cart` : "Added to your cart";

  return toast.custom(
    (id) => (
      <div
        role="status"
        className="flex w-full items-center gap-3 rounded-radius-lg bg-popover/95 p-2.5 pr-2 text-popover-foreground shadow-[0_12px_40px_-8px_rgba(0,0,0,0.3)] ring-1 ring-black/[0.07] dark:ring-white/10 backdrop-blur-md dark:shadow-[0_10px_34px_-6px_rgba(0,0,0,0.7)] md:w-[356px]"
      >
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-[18px] w-[18px] animate-in zoom-in-50 duration-300" strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold leading-5">{title}</p>
          {meta && <p className="truncate text-meta leading-4 text-muted-foreground">{meta}</p>}
        </div>
        <button
          type="button"
          onClick={() => { toast.dismiss(id); onViewCart(); }}
          className="flex shrink-0 items-center gap-1 rounded-radius-md px-2.5 py-2 text-meta font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          View cart <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    ),
    { duration: 3500 },
  );
}
