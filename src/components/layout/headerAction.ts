/**
 * The size and shape of one action in the header's right-hand row.
 *
 * Cart, language, notifications and the avatar are four separate components,
 * and each had picked its own dimensions: 40px, 52px (the shared `iconLg`
 * button token), 40px and 44px. Side by side that reads as a wobble rather
 * than a row — the globe was visibly larger than the cart next to it, and the
 * bell was dimmer than both.
 *
 * One constant instead of four opinions. Importing it is what keeps them the
 * same size the next time one of them is touched.
 */
export const HEADER_ACTION_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Every glyph in that row, so none of them out-weighs its neighbour. */
export const HEADER_ACTION_ICON_CLASS = "h-5 w-5";
