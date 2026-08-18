import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  /** Content of the footer (usually a warning banner + a Pay button + hint). */
  children: ReactNode;
}

/**
 * Sticky checkout footer used by every checkout flow. Same visual language:
 * fixed to the viewport bottom on mobile, respects the desktop sidebar offset,
 * safe-area-inset aware.
 *
 * It also publishes its own height as `--checkout-footer-h`, and that is not a
 * detail. The bar floats over the page, so the page has to end above it — and
 * the padding that achieved this was a number somebody guessed. It was wrong
 * as soon as the bar grew: an Add-to-cart button above the Pay button, a
 * warning when payments are down, a phone with a home indicator, and the last
 * row of the form sat permanently underneath, unreachable by scrolling.
 *
 * A measured height cannot drift. Consumers pad with
 * `pb-[calc(var(--checkout-footer-h,180px)+16px)]`.
 */
export function CheckoutStickyFooter({ children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty("--checkout-footer-h", `${el.offsetHeight}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--checkout-footer-h");
    };
  }, []);

  return (
    <div
      ref={ref}
      // A card, like everything above it: rounded across the top and no
      // hairline — the design separates the bar by surface, not by a border.
      className="fixed inset-x-0 bottom-0 z-40 rounded-t-radius-lg bg-card md:left-[var(--sidebar-width,0px)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="app-container px-4 pb-6 pt-2">
        {children}
      </div>
    </div>
  );
}
