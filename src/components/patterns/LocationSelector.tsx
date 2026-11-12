import { useState } from "react";
import { MapPin, ChevronDown, Navigation } from "lucide-react";
import { KeyboardArrowRightIcon, LocationOnIcon } from "@/components/icons/FigmaIcons";
import { useResidences } from "@/hooks/useResidences";
import { useLocationControl } from "@/contexts/LocationContext";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { AddressMapDialog } from "@/components/location/AddressMapDialog";

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
  /**
   * Show it even on a page that does not read the location. The desktop
   * header passes this: a control that comes and goes between pages is a bar
   * that changes shape under the visitor — the place they chose is theirs
   * across the whole site, not a feature of one page.
   */
  always?: boolean;
}

/**
 * Global location/residence selector. Reads the data-driven residences list and
 * stores the choice app-wide (LocationContext → localStorage).
 *
 * Opens as a bottom sheet on a phone and a centred modal on a desktop
 * (ResponsiveDialog). Not a Popover anchored to the trigger: that drops out of
 * the viewport on narrow screens.
 */
export function LocationSelector({ variant = "chip", className, always = false }: Props) {
  const { t } = useI18n();
  const { data: residences = [] } = useResidences();
  const { residence, residenceMatters, address } = useLocationControl();
  const [open, setOpen] = useState(false);

  // Nothing to choose from yet — hide, unless the header always shows it (an
  // address on the map needs no list of communities).
  if (residences.length === 0 && !always) return null;

  // Nothing on this page reads the residence, so the control would be a
  // promise the page cannot keep: the beach club is a place you go to, and the
  // generic service listing has no service areas to match against. Pages that
  // do use it claim it (LocationContext), which is what flips this on.
  if (!residenceMatters && !always) return null;

  /** The pin they dropped says more than the community it is in. */
  const place = address?.line || residence;
  const label = place || "Choose location";


  const trigger = variant === "row" ? (
    <LocationRowView label={place} onClick={() => setOpen(true)} className={className} />
  ) : variant === "icon" ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={t("nav.chooseLocation")}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-muted",
        place ? "text-primary" : "text-foreground",
        className,
      )}
    >
      <LocationOnIcon className="h-6 w-6" />
    </button>
  ) : variant === "chip" ? (
    <LocationChipView label={place} onClick={() => setOpen(true)} className={className} />
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={t("nav.chooseLocation")}
      className={cn(
        "flex w-full items-center justify-between gap-1.5 rounded-xl bg-muted/50 px-3.5 py-2 text-sm font-semibold text-foreground transition-colors",
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <MapPin className={cn("h-4 w-4 shrink-0", place ? "text-primary" : "text-muted-foreground")} />
        <span className={cn("truncate", !place && "text-muted-foreground")}>
          <span className="text-muted-foreground">Deliver to: </span>
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

      {/* The address on a map (after Lavka's): search, OK, and a pin. The
          communities ride along under the search, since listings still
          filter by them. */}
      <AddressMapDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * The desktop header's address box — a view, so the states sheet can draw it.
 * Drawn after Yandex Lavka's: a 48px box with a hairline outline, a
 * navigation arrow, the place, a chevron right. The one outlined control in
 * the bar, because it is the one that SAYS something (where you are) rather
 * than being a door; the arrow turns orange once a place is chosen.
 */
export function LocationChipView({ label, onClick, className }: { label: string | null | undefined; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Choose location"
      className={cn(
        "flex h-12 w-[280px] min-w-0 shrink items-center gap-3 rounded-radius-md bg-card px-4 text-left outline outline-1 -outline-offset-1 outline-foreground/15 transition-colors hover:bg-muted/50",
        className,
      )}
    >
      <Navigation className={cn("h-5 w-5 shrink-0 fill-current", label ? "text-primary" : "text-foreground")} strokeWidth={0} />
      <span className={cn("min-w-0 flex-1 truncate text-[16px]", label ? "text-foreground" : "text-muted-foreground")}>
        {label || "Choose location"}
      </span>
      <KeyboardArrowRightIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** The phone header's location row — pin, the place, a chevron. */
export function LocationRowView({ label, onClick, className }: { label: string | null | undefined; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Choose location"
      className={cn(
        "flex w-full items-center gap-2 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40",
        className,
      )}
    >
      <LocationOnIcon className={cn("h-6 w-6 shrink-0", label ? "text-primary" : "text-muted-foreground")} />
      <span className={cn("min-w-0 flex-1 truncate text-title", label ? "text-foreground" : "text-muted-foreground")}>
        {label || "Choose location"}
      </span>
      <KeyboardArrowRightIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
    </button>
  );
}
