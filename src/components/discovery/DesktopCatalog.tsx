import { Link, useLocation } from "react-router-dom";
import { CarFront, Heart, History, Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCategoryHighlights } from "@/hooks/useCategoryHighlights";
import { Photo } from "@/components/patterns/Photo";
import { cn } from "@/lib/utils";

/**
 * The catalogue as a column on a laptop, beside the home page — the way the
 * big grocery-delivery sites hold it: a large "Catalog" heading, then one row
 * per department with a round picture and its name, every department one
 * click away while the shelves scroll. The same list for a guest and a
 * signed-in customer; a guest's personal rows open the log-in screen.
 *
 * Departments are the categories that have something on sale, each with a
 * real photo of what it sells (the same picture its home tile uses).
 */
type Row = { key: string; label: string; to: string; Icon?: LucideIcon; imageUrl?: string | null; tint?: boolean };

export function DesktopCatalog({ className }: { className?: string }) {
  const { highlights, isLoading } = useCategoryHighlights();
  const { pathname, search } = useLocation();
  const here = pathname + search;

  const personal: Row[] = [
    { key: "subs", label: "My subscriptions", to: "/my-subscriptions", Icon: Layers, tint: true },
    { key: "history", label: "You bought", to: "/history", Icon: History, tint: true },
    { key: "fav", label: "Favorites", to: "/favorites", Icon: Heart, tint: true },
  ];
  const departments: Row[] = [
    ...highlights
      .filter((h) => h.fromCents !== null)
      .map((h) => ({ key: h.key, label: h.label, to: h.href, imageUrl: h.imageUrl, Icon: h.archetype?.Icon })),
    { key: "vehicles", label: "Vehicles", to: "/vehicles", Icon: CarFront },
  ];

  const Item = ({ label, to, Icon, imageUrl, tint }: Row) => {
    const active = here === to;
    return (
      <li>
        <Link
          to={to}
          className={cn(
            "flex items-center gap-4 rounded-radius-md px-2 py-2 transition-colors hover:bg-muted/60",
            active && "bg-muted/60",
          )}
        >
          <span
            className={cn(
              "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full",
              tint ? "bg-primary text-primary-foreground" : "bg-card text-primary shadow-figma",
            )}
          >
            {imageUrl
              ? <Photo src={imageUrl} alt="" icon={Icon} className="absolute inset-0 h-full w-full object-cover" />
              : Icon && <Icon className="h-6 w-6" />}
          </span>
          <span className="min-w-0 text-[18px] font-medium leading-snug text-foreground">{label}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Catalog" className={cn("space-y-3", className)}>
      <h2 className="px-2 text-[28px] font-bold leading-tight tracking-tight text-foreground">Catalog</h2>
      <ul className="space-y-0.5">
        {personal.map((r) => <Item key={r.key} {...r} />)}
        {isLoading
          ? [0, 1, 2, 3, 4, 5].map((i) => (
              <li key={i} className="flex items-center gap-4 px-2 py-2">
                <span className="h-12 w-12 animate-pulse rounded-full bg-muted" />
                <span className="h-4 w-28 animate-pulse rounded bg-muted" />
              </li>
            ))
          : departments.map((r) => <Item key={r.key} {...r} />)}
      </ul>
    </nav>
  );
}
