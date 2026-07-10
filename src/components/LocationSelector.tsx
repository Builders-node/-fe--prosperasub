import { useState } from "react";
import { MapPin, ChevronDown, Check } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
 * stores the choice app-wide (LocationContext → localStorage).
 *
 * Opens as a bottom Sheet — the app is mobile-first and a floating Popover
 * anchored to the trigger drops out of the viewport on narrow screens (see
 * the screenshot where the panel spilled left of the trigger).
 */
export function LocationSelector({ variant = "chip", className }: Props) {
  const { data: residences = [] } = useResidences();
  const { residence, setResidence } = useSelectedResidence();
  const [open, setOpen] = useState(false);

  // Nothing to choose from yet — hide entirely.
  if (residences.length === 0) return null;

  const label = residence || "Choose location";

  const pick = (next: string) => {
    setResidence(next);
    setOpen(false);
  };

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
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
  );

  return (
    <>
      {variant === "full" ? (
        <div className="border-t border-border/40 bg-background px-3 py-1.5 md:hidden">
          {trigger}
        </div>
      ) : (
        trigger
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[80vh] overflow-y-auto rounded-t-3xl border-0 p-0 pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="px-4 pt-5">
            <SheetTitle className="text-left">Deliver to</SheetTitle>
          </SheetHeader>
          <ul className="divide-y divide-border/40 px-2 pb-2">
            <li>
              <button
                type="button"
                onClick={() => pick("")}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm text-foreground">No specific location</span>
                {!residence && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            </li>
            {residences.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => pick(r.name)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted/40"
                >
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-sm text-foreground">{r.name}</span>
                  {residence === r.name && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
