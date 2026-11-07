import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Four looks, three heights, one shape (DESIGN.md §6, Buttons).
 *
 *   primary      amber — the one thing this screen is for. One per screen.
 *   secondary    a filled grey pill (`muted`). NO border: the old
 *                secondary/outline drew a ring around a fill darker than the
 *                card it sat on, which read in dark mode as a hole with a rim.
 *   ghost        text only, the fill appears on hover.
 *   destructive  red, for the irreversible.
 *   link         inline text.
 *
 * `outline` = secondary, `tertiary` = ghost, `default` = primary: kept as
 * aliases so the 70-odd call sites still compile, and so they cannot drift
 * apart again.
 *
 * Heights match the fields exactly, so a button beside an input never steps:
 * sm 40 (rows, toolbars, filters — same as Input/Select sm) · default 48
 * (forms, CTAs — same as Input/Select default). lg is kept as an alias of 48
 * with the larger label. Icons: icon 40 · iconSm 32 (dense rows).
 * Every button is a pill; a full-width CTA bar may square itself to 16 with
 * `rounded-radius-md`. Nothing else — 28/32/40/56 text buttons and the
 * per-call `h-*` / `rounded-*` overrides were the drift this replaced.
 */
const PRIMARY = "bg-primary !text-black hover:bg-[hsl(var(--brand-accent-hover))] active:bg-[hsl(var(--brand-accent-active))] [&_*]:!text-black";
const SECONDARY = "bg-muted text-foreground hover:bg-muted/70 active:bg-muted/60";
const GHOST = "bg-transparent text-foreground hover:bg-muted active:bg-muted/70";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 data-[loading=true]:cursor-wait [&_svg]:pointer-events-none [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: PRIMARY,
        default: PRIMARY,
        secondary: SECONDARY,
        outline: SECONDARY,
        ghost: GHOST,
        tertiary: GHOST,
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
        link: "h-auto rounded-none bg-transparent p-0 text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        sm: "h-10 gap-1.5 px-4 text-body [&_svg]:size-4",
        default: "h-12 gap-2 px-5 text-body [&_svg]:size-4",
        lg: "h-12 gap-2 px-6 text-title [&_svg]:size-5",
        /** Retired: renders as lg. */
        xl: "h-12 gap-2 px-6 text-title [&_svg]:size-5",
        icon: "h-10 w-10 p-0 [&_svg]:size-5",
        iconSm: "h-8 w-8 p-0 [&_svg]:size-4",
        link: "h-auto gap-1 rounded-none p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

/**
 * A row of controls has ONE height. Inside a toolbar whose search is h-10, a
 * Button with no explicit size took the default h-12 and towered over the
 * input. A toolbar wraps its controls in <ControlSize size="sm"> and every
 * unsized Button follows; an explicit `size` still wins.
 */
type ControlSizeValue = "sm" | "default";
const ControlSizeContext = React.createContext<ControlSizeValue | undefined>(undefined);
/** No `size` resets to the defaults — overlays do this, so a dialog opened from a toolbar keeps full-size buttons. */
export function ControlSize({ size, children }: { size?: ControlSizeValue; children: React.ReactNode }) {
  return <ControlSizeContext.Provider value={size}>{children}</ControlSizeContext.Provider>;
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, className, disabled, loading = false, loadingText, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const contextSize = React.useContext(ControlSizeContext);
    const resolvedSize = size ?? (variant === "link" ? "link" : contextSize);
    const content = loading ? (
      <>
        <Loader2 className="animate-spin" aria-hidden="true" />
        {loadingText ?? children}
      </>
    ) : (
      children
    );

    return (
      <Comp
        className={cn(buttonVariants({ variant, size: resolvedSize, className }))}
        data-loading={loading ? "true" : undefined}
        aria-disabled={asChild && (disabled || loading) ? true : undefined}
        disabled={!asChild ? disabled || loading : undefined}
        aria-busy={loading || undefined}
        ref={ref}
        {...props}
      >
        {content}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
