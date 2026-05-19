import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

type TabsVariant = "primary" | "secondary" | "pills" | "icon" | "iconOnly";
type TabsSize = "sm" | "md" | "lg";

const TabsContext = React.createContext<{
  variant: TabsVariant;
  size: TabsSize;
}>({
  variant: "pills",
  size: "md",
});

const tabsListVariants = cva(
  "inline-flex max-w-full items-center text-muted-foreground",
  {
    variants: {
      variant: {
        primary: "h-12 gap-space-1 border-b border-border bg-transparent",
        secondary: "h-10 gap-space-1 rounded-radius-md bg-secondary p-space-1",
        pills: "h-12 rounded-radius-lg bg-[hsl(var(--app-control))] p-space-2",
        icon: "h-12 rounded-radius-lg bg-[hsl(var(--app-control))] p-space-2",
        iconOnly: "h-11 rounded-radius-md bg-[hsl(var(--app-control))] p-space-1",
      },
      size: {
        sm: "",
        md: "",
        lg: "",
      },
      equalWidth: {
        true: "grid w-full auto-cols-fr grid-flow-col",
        false: "w-auto",
      },
      scrollable: {
        true: "overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        false: "overflow-visible",
      },
      wrap: {
        true: "flex-wrap",
        false: "flex-nowrap",
      },
    },
    compoundVariants: [
      { variant: "primary", size: "sm", className: "h-10" },
      { variant: "primary", size: "lg", className: "h-14" },
      { variant: "pills", size: "sm", className: "h-10 rounded-radius-md p-space-1" },
      { variant: "pills", size: "lg", className: "h-14 rounded-radius-lg p-space-2" },
      { variant: "iconOnly", size: "sm", className: "h-10" },
      { variant: "iconOnly", size: "lg", className: "h-12" },
    ],
    defaultVariants: {
      variant: "pills",
      size: "md",
      equalWidth: false,
      scrollable: true,
      wrap: false,
    },
  }
);

const tabsTriggerVariants = cva(
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[loading=true]:pointer-events-none data-[loading=true]:opacity-70 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "rounded-none border-b-2 border-transparent text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground",
        secondary:
          "rounded-radius-sm text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground",
        pills:
          "rounded-radius-md text-muted-foreground hover:text-foreground data-[state=active]:bg-[hsl(var(--app-rail-active))] data-[state=active]:text-[hsl(var(--app-rail-active-foreground))]",
        icon:
          "gap-space-2 rounded-radius-md text-muted-foreground hover:text-foreground data-[state=active]:bg-[hsl(var(--app-rail-active))] data-[state=active]:text-[hsl(var(--app-rail-active-foreground))] [&>svg]:h-4 [&>svg]:w-4",
        iconOnly:
          "rounded-radius-sm text-muted-foreground hover:text-foreground data-[state=active]:bg-[hsl(var(--app-rail-active))] data-[state=active]:text-[hsl(var(--app-rail-active-foreground))] [&>svg]:h-5 [&>svg]:w-5",
      },
      size: {
        sm: "h-8 px-space-3 text-control [&>svg]:h-3.5 [&>svg]:w-3.5",
        md: "h-9 px-space-4 text-control [&>svg]:h-4 [&>svg]:w-4",
        lg: "h-11 px-space-6 text-control [&>svg]:h-5 [&>svg]:w-5",
      },
      equalWidth: {
        true: "w-full",
        false: "",
      },
    },
    compoundVariants: [
      { variant: "primary", size: "md", className: "h-12 px-space-4" },
      { variant: "primary", size: "lg", className: "h-14 px-space-5" },
      { variant: "iconOnly", size: "sm", className: "h-8 w-8 px-0" },
      { variant: "iconOnly", size: "md", className: "h-9 w-9 px-0" },
      { variant: "iconOnly", size: "lg", className: "h-11 w-11 px-0" },
    ],
    defaultVariants: {
      variant: "pills",
      size: "md",
      equalWidth: false,
    },
  }
);

interface TabsProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  variant?: TabsVariant;
  size?: TabsSize;
}

const Tabs = ({ variant = "pills", size = "md", ...props }: TabsProps) => (
  <TabsContext.Provider value={{ variant, size }}>
    <TabsPrimitive.Root {...props} />
  </TabsContext.Provider>
);

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> &
    VariantProps<typeof tabsListVariants>
>(({ className, variant, size, equalWidth, scrollable, wrap, ...props }, ref) => {
  const context = React.useContext(TabsContext);

  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        tabsListVariants({
          variant: variant ?? context.variant,
          size: size ?? context.size,
          equalWidth,
          scrollable,
          wrap,
        }),
        className,
      )}
      {...props}
    />
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> &
    VariantProps<typeof tabsTriggerVariants> & {
      loading?: boolean;
    }
>(({ className, variant, size, equalWidth, loading = false, ...props }, ref) => {
  const context = React.useContext(TabsContext);

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      data-loading={loading ? "true" : undefined}
      className={cn(
        tabsTriggerVariants({
          variant: variant ?? context.variant,
          size: size ?? context.size,
          equalWidth,
        }),
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-space-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants, tabsTriggerVariants };
