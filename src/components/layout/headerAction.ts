/**
 * The size and shape of one action in the header's right-hand row.
 *
 * Cart, favourites, notifications and the avatar are separate components, and
 * each once picked its own dimensions (40, 52, 40, 44px). One constant instead
 * of four opinions — importing it is what keeps them the same size the next
 * time one of them is touched.
 *
 * DESIGN.md §4c: "Icon buttons are 40px with a 24px glyph. Every action in the
 * header and every tab in the nav." The desktop row used to draw 20px Lucide
 * glyphs while the phone drew 24px Figma ones — the same bell at two sizes in
 * two icon families.
 */
export const HEADER_ACTION_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Every glyph in that row, so none of them out-weighs its neighbour. */
export const HEADER_ACTION_ICON_CLASS = "h-6 w-6";
