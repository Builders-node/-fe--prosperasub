import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap text-control ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 data-[loading=true]:cursor-wait [&_svg]:pointer-events-none [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-primary !text-black hover:bg-[hsl(var(--brand-accent-hover))] active:bg-[hsl(var(--brand-accent-active))] [&_*]:!text-black",
        secondary: "border border-[hsl(var(--app-divider))] bg-[hsl(var(--app-control))] text-foreground hover:bg-[hsl(var(--app-control-muted))] active:bg-[hsl(var(--app-control-muted))]/80",
        tertiary: "bg-transparent text-foreground hover:bg-[hsl(var(--app-control-muted))] active:bg-[hsl(var(--app-control-muted))]/80",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
        chip: "bg-transparent text-muted-foreground hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground",
        favorite: "bg-black/10 text-white backdrop-blur-sm hover:bg-black/15 hover:text-white data-[state=active]:text-white",
        nav: "bg-[hsl(var(--app-control-muted))] text-foreground hover:bg-[hsl(var(--app-control-muted))]/80",
        rail: "bg-transparent text-muted-foreground hover:bg-[hsl(var(--app-control-muted))] hover:text-foreground data-[state=active]:bg-[hsl(var(--app-rail-active))] data-[state=active]:text-[hsl(var(--app-rail-active-foreground))] data-[state=active]:hover:bg-[hsl(var(--app-rail-active))]/90",
        link: "h-auto rounded-none bg-transparent p-0 text-primary underline-offset-4 hover:underline active:scale-100",
        default: "bg-primary !text-black hover:bg-[hsl(var(--brand-accent-hover))] active:bg-[hsl(var(--brand-accent-active))] [&_*]:!text-black",
        outline: "border border-[hsl(var(--app-divider))] bg-[hsl(var(--app-control))] text-foreground hover:bg-[hsl(var(--app-control-muted))] active:bg-[hsl(var(--app-control-muted))]/80",
        ghost: "bg-transparent text-foreground hover:bg-[hsl(var(--app-control-muted))] active:bg-[hsl(var(--app-control-muted))]/80",
        success: "bg-primary !text-black hover:bg-[hsl(var(--brand-accent-hover))] active:bg-[hsl(var(--brand-accent-active))] [&_*]:!text-black",
        /* Dark pill — used for primary CTAs in the mobile-first booking/confirmation style */
        dark: "bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80",
      },
      size: {
        default: "h-11 gap-space-2 rounded-radius-md px-space-5 py-space-3",
        sm: "h-9 gap-space-2 rounded-radius-sm px-space-4",
        lg: "h-12 gap-space-2 rounded-radius-md px-space-8",
        xl: "h-14 gap-space-3 rounded-radius-lg px-space-10 text-body",
        /* Pill — fully rounded, used in booking flows (matches medical-app CTA style) */
        pill: "h-12 gap-space-2 rounded-full px-space-8",
        pillSm: "h-9 gap-space-2 rounded-full px-space-5 text-xs",
        iconXs: "h-7 w-7 rounded-radius-sm p-0 [&_svg]:size-3.5",
        iconSm: "h-8 w-8 rounded-radius-sm p-0 [&_svg]:size-4",
        icon: "h-11 w-11 rounded-radius-full p-0 [&_svg]:size-5",
        iconLg: "h-[52px] w-[52px] rounded-radius-full p-0 [&_svg]:size-6",
        chip: "h-12 gap-space-2 rounded-radius-full px-space-5 py-space-3",
        nav: "h-[52px] gap-space-2 rounded-radius-lg px-space-6",
        panel: "min-h-20 h-auto gap-space-2 rounded-radius-md px-space-5 py-space-5",
        link: "h-auto gap-space-1 rounded-none p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

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
    const resolvedSize = size ?? (variant === "link" ? "link" : undefined);
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
