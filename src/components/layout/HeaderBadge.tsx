import { cn } from "@/lib/utils";

/**
 * The count on a header action — heart, cart, bell — and on the tab bar's Cart.
 *
 * Each drew its own, and they disagreed: the cart's and the heart's sat outside
 * the button, the bell's inside it, the phone's bag and the tab bar each had a
 * hand-drawn copy at 9px. One component, one place: on the glyph's top-right
 * corner. The ring in the bar's own colour (both bars are `--card`) keeps it
 * legible where it crosses the glyph.
 *
 * `placement="glyph"` is for a bare 24px glyph with no 40px button around it
 * (the tab bar), so the badge lands on the same corner of the same drawing.
 */
export function HeaderBadge({ count, placement = "button", className }: {
  count: number;
  placement?: "button" | "glyph";
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black leading-none text-primary-foreground ring-2 ring-card",
        placement === "button" ? "right-1 top-1" : "-right-2 -top-1.5",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
