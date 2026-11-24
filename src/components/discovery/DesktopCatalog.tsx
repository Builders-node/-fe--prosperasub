import { Link, useLocation } from "react-router-dom";
import { CarFront, Heart, Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { useCategoryHighlights } from "@/hooks/useCategoryHighlights";
import { serviceListingHref } from "@/lib/services/serviceUrls";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

/**
 * The catalogue as a column on a laptop, beside the home page — the way big
 * grocery and marketplace sites hold it: every department one click away
 * while the shelves scroll. A phone keeps its service grid; there is no room
 * for a column there.
 *
 * Only services with something on sale are listed (an empty one is a link to
 * "No plans yet"); while that is still loading, all of them are.
 */
export function DesktopCatalog({ className }: { className?: string }) {
  const { archetypes, isLoading: archetypesLoading } = useServiceArchetypes(true);
  const { highlights, isLoading } = useCategoryHighlights();
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const selling = new Set(highlights.filter((h) => h.fromCents !== null).map((h) => h.archetype?.key));

  const personal: Array<{ label: string; to: string; Icon: LucideIcon }> = [
    { label: "Favorites", to: "/favorites", Icon: Heart },
    ...(isAuthenticated ? [{ label: "My subscriptions", to: "/my-subscriptions", Icon: Layers }] : []),
  ];
  const services = [
    ...archetypes
      .filter((a) => isLoading || selling.has(a.key))
      .map((a) => ({ label: a.label, to: serviceListingHref(a.key), Icon: a.Icon })),
    { label: "Vehicles", to: "/vehicles", Icon: CarFront },
  ];

  const Row = ({ label, to, Icon }: { label: string; to: string; Icon: LucideIcon }) => {
    const active = pathname === to || pathname.startsWith(`${to}/`);
    return (
      <li>
        <Link
          to={to}
          className={cn(
            "flex items-center gap-3 rounded-radius-md px-2 py-1.5 transition-colors hover:bg-muted",
            active && "bg-muted",
          )}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card shadow-figma">
            <Icon className="h-5 w-5 text-primary" />
          </span>
          <span className="min-w-0 truncate text-title font-medium text-foreground">{label}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Catalog" className={cn("space-y-4", className)}>
      <h2 className="px-2 text-heading font-semibold text-foreground">Catalog</h2>
      <ul className="space-y-0.5">
        {personal.map((r) => <Row key={r.to} {...r} />)}
      </ul>
      <ul className="space-y-0.5 border-t border-border pt-4">
        {archetypesLoading
          ? [0, 1, 2, 3, 4].map((i) => <li key={i} className="h-[52px] animate-pulse rounded-radius-md bg-muted/40" />)
          : services.map((r) => <Row key={r.to} {...r} />)}
      </ul>
    </nav>
  );
}
