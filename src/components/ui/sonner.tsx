import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // On a phone a toast sits above whatever holds the bottom of the screen:
      // the decision bar on a plan page (it publishes its height), otherwise
      // the tab bar. At the screen edge it covered the very button it was
      // reporting on.
      mobileOffset={{ bottom: "calc(var(--decision-bar-h, 64px) + env(safe-area-inset-bottom) + 12px)" }}
      toastOptions={{
        classNames: {
          toast:
            // The page's own card surface with a hairline, not a black slab
            // with a hard border: on a dark page bg-background is darker than
            // the card the toast lands on and read as a hole.
            "group toast group-[.toaster]:rounded-radius-lg group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border/70 group-[.toaster]:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.25)] dark:group-[.toaster]:shadow-[0_10px_34px_-6px_rgba(0,0,0,0.7)]",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:!bg-primary group-[.toast]:!text-primary-foreground group-[.toast]:!font-semibold",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
