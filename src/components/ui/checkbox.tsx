import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { cva, type VariantProps } from "class-variance-authority";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const checkboxVariants = cva(
  "peer h-5 w-5 shrink-0 rounded-radius-sm border bg-[hsl(var(--app-control))] text-primary transition-colors hover:border-foreground/25 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50",
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

interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
    VariantProps<typeof checkboxVariants> {
  loading?: boolean;
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, state, loading = false, disabled, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(checkboxVariants({ state: loading ? "loading" : state }), className)}
    disabled={disabled || loading}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox, checkboxVariants };
