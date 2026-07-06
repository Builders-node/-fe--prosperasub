import { MapPin, ChevronDown, Check } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useResidences } from "@/hooks/useResidences";
import { useSelectedResidence } from "@/contexts/LocationContext";
import { cn } from "@/lib/utils";

interface Props {
  /** Visual style: "chip" for header pill, "full" for a full-width bar row. */
  variant?: "chip" | "full";
  className?: string;
}

/**
 * Global location/residence selector. Reads the data-driven residences list and
 * stores the choice app-wide (LocationContext → localStorage). Used in the
 * headers so it appears on the home page and every product page.
 */
export function LocationSelector({ variant = "chip", className }: Props) {
  const { data: residences = [] } = useResidences();
  const { residence, setResidence } = useSelectedResidence();

  // Nothing to choose from yet — hide entirely.
  if (residences.length === 0) return null;

  const label = residence || "Choose location";

  const inner = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choose your location"
          className={cn(
            "flex items-center gap-1.5 font-semibold transition-colors",
            variant === "chip"
              ? "h-9 rounded-full bg-muted/60 px-3 text-sm text-foreground hover:bg-muted"
              : "w-full justify-between rounded-xl bg-muted/50 px-3.5 py-2 text-sm text-foreground",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin className={cn("h-4 w-4 shrink-0", residence ? "text-primary" : "text-muted-foreground")} />
            <span className={cn("truncate", !residence && "text-muted-foreground")}>
              {variant === "full" && <span className="text-muted-foreground">Deliver to: </span>}
              {label}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Your location
        </p>
        <button
          type="button"
          onClick={() => setResidence("")}
          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted"
        >
          <span className="text-muted-foreground">No specific location</span>
          {!residence && <Check className="h-4 w-4 text-primary" />}
        </button>
        {residences.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setResidence(r.name)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted"
          >
            <span className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              {r.name}
            </span>
            {residence === r.name && <Check className="h-4 w-4 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );

  if (variant === "full") {
    return (
      <div className="border-t border-border/40 bg-background px-3 py-1.5 md:hidden">
        {inner}
      </div>
    );
  }
  return inner;
}
