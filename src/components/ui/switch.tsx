import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const switchVariants = cva(
  "peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-radius-full border bg-[hsl(var(--app-control))] p-space-1 transition-colors hover:border-foreground/25 data-[state=checked]:border-primary data-[state=checked]:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      state: {
        default: "border-border",
        error: "border-destructive focus-visible:ring-destructive/25",
        success: "border-primary",
        loading: "border-border opacity-70",
      },
    },
    defaultVariants: {
      state: "default",
    },
  },
);

interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>,
    VariantProps<typeof switchVariants> {
  loading?: boolean;
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, state, loading = false, disabled, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(switchVariants({ state: loading ? "loading" : state }), className)}
    disabled={disabled || loading}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-radius-full bg-foreground/80 ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=checked]:bg-primary-foreground data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch, switchVariants };
