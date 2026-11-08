/**
 * The count on a header action — heart, cart, bell.
 *
 * Each drew its own, and they disagreed: the cart's and the heart's sat outside
 * the button, the bell's inside it, so the same number hung at two different
 * heights in one row. One component, one place: on the glyph's top-right
 * corner. The ring in the header's colour keeps it legible where it crosses
 * the glyph.
 */
export function HeaderBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black leading-none text-primary-foreground ring-2 ring-background"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
