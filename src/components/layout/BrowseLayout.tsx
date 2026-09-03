import { ReactNode } from "react";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { cn } from "@/lib/utils";

/**
 * The frame of a BROWSING surface: desktop header on top, tab bar underneath,
 * the page-type mobile header (ListingHeader, a pinned hero bar, a search
 * field) as a slot in between.
 *
 * Nine storefront pages assembled this same sandwich by hand — three imports
 * and three JSX lines each — and hand assembly is how pieces go missing: the
 * car section shipped without the header once and with a tab bar over its CTA
 * another time. A page that uses this cannot forget a layer.
 *
 * This is the browsing counterpart of UserLayout (account pages, title-bar
 * chrome) — not a replacement for it. Decision pages (PlanDetail, checkouts)
 * use neither: they end at their own CTA, with no tab bar at all.
 */
export function BrowseLayout({ top, header, children, className }: {
  /** Rendered ABOVE the desktop header — the home page's ad banner. */
  top?: ReactNode;
  /** The mobile/page header rendered right under the desktop one, as-is. */
  header?: ReactNode;
  children: ReactNode;
  /** Overrides for the page frame (e.g. a different bottom padding). */
  className?: string;
}) {
  return (
    <div className={cn("min-h-screen bg-background pb-24 md:pb-12", className)}>
      {top}
      <DesktopHeader />
      {header}
      {children}
      <BottomNav />
    </div>
  );
}
