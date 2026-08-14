import type { ReactNode } from "react";

interface Props {
  /** Content of the footer (usually a warning banner + a Pay button + hint). */
  children: ReactNode;
}

/**
 * Sticky checkout footer used by every 4-step checkout flow (Cart, Cleaning,
 * Beach, Food, Cars). Same visual language: fixed to viewport bottom on
 * mobile, respects the desktop sidebar offset, safe-area-inset aware.
 *
 * Consumers put whatever they need inside — a warning banner (payment method
 * unavailable), the Pay button, an inline hint. The wrapper handles the
 * positioning + surface only.
 */
export function CheckoutStickyFooter({ children }: Props) {
  return (
    <div
      // A card, like everything above it: white, rounded across the top, and
      // no hairline — the design separates the bar by surface, not by a border.
      className="fixed inset-x-0 bottom-0 z-40 rounded-t-radius-lg bg-card md:left-[var(--sidebar-width,0px)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="market-content px-4 pb-6 pt-2">
        {children}
      </div>
    </div>
  );
}
