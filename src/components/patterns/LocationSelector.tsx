import { useState } from "react";
import { MapPin, ChevronDown, Check } from "lucide-react";
import { KeyboardArrowRightIcon, LocationOnIcon } from "@/components/icons/FigmaIcons";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { useResidences } from "@/hooks/useResidences";
import { useLocationControl } from "@/contexts/LocationContext";
import { cn } from "@/lib/utils";

interface Props {
  /**
   * "chip" — header pill · "full" — full-width bar row ·
   * "icon" — a bare 40px pin button ·
   * "row"  — the Figma home header's own row: pin, the location itself, and a
   *          chevron. It says which location instead of making you press a pin
   *          to find out.
   */
  variant?: "chip" | "full" | "icon" | "row";
  className?: string;
}

/**
 * Global location/residence selector. Reads the data-driven residences list and
 * stores the choice app-wide (LocationContext → localStorage).
 *
 * Opens as a bottom sheet on a phone and a centred modal on a desktop
 * (ResponsiveDialog). Not a Popover anchored to the trigger: that drops out of
 * the viewport on narrow screens.
 */
export function LocationSelector({ variant = "chip", className }: Props) {
  const { data: residences = [] } = useResidences();
  const { residence, setResidence, residenceMatters } = useLocationControl();
  const [open, setOpen] = useState(false);

  // Nothing to choose from yet — hide entirely.
  if (residences.length === 0) return null;

  // Nothing on this page reads the residence, so the control would be a
  // promise the page cannot keep: the beach club is a place you go to, and the
  // generic service listing has no service areas to match against. Pages that
  // do use it claim it (LocationContext), which is what flips this on.
  if (!residenceMatters) return null;

  const label = residence || "Choose location";

  const pick = (next: string) => {
    setResidence(next);
    setOpen(false);
  };

  const trigger = variant === "row" ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Choose your location"
      className={cn(
        "flex w-full items-center gap-2 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40",
        className,
      )}
    >
      <LocationOnIcon className={cn("h-6 w-6 shrink-0", residence ? "text-primary" : "text-muted-foreground")} />
      <span className={cn(
        "min-w-0 flex-1 truncate text-[16px] tracking-[-0.32px]",
        residence ? "text-foreground" : "text-muted-foreground",
      )}>
        {residence || "Choose your location"}
      </span>
      <KeyboardArrowRightIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
    </button>
  ) : variant === "icon" ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Choose your location"
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-muted",
        residence ? "text-primary" : "text-foreground",
        className,
      )}
    >
      <LocationOnIcon className="h-6 w-6" />
    </button>
  ) : (
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

      {/* Sheet on a phone, centred modal on a desktop — on a wide screen the
          bare sheet was a full-width bar glued to the bottom edge. */}
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Deliver to" bodyClassName="px-2 py-2">
        <ul className="divide-y divide-border/40">
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
      </ResponsiveDialog>
    </>
  );
}
