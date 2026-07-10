import type { ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Optional pinned bottom action area. */
  footer?: ReactNode;
  /** Extra class for the content wrapper. */
  className?: string;
  /** Body class (padding/scroll). */
  bodyClassName?: string;
}

/**
 * Renders a bottom-sheet on mobile and a centered dialog on desktop.
 *
 * Use for user-facing modals where mobile users benefit from a native-feeling
 * sheet (drag from bottom, safe-area aware) but desktop users expect a
 * centered floating card. The breakpoint matches Tailwind's `md` (768px).
 */
export function ResponsiveDialog({
  open, onOpenChange, title, description, children, footer, className, bodyClassName,
}: Props) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn("max-w-lg gap-0 p-0", className)}>
          <DialogHeader className="border-b border-border/50 px-6 pb-4 pt-6">
            <DialogTitle className="text-2xl font-black leading-tight tracking-tight">
              {title}
            </DialogTitle>
            {description && (
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className={cn("max-h-[70vh] overflow-y-auto px-6 py-4", bodyClassName)}>
            {children}
          </div>
          {footer && (
            <div className="border-t border-border/50 px-6 py-4">{footer}</div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn("flex max-h-[88vh] flex-col gap-0 rounded-t-3xl p-0", className)}
      >
        <div className="shrink-0 border-b border-border/50 bg-background px-4 pb-3 pt-4">
          <SheetTitle className="pr-10 text-2xl font-black leading-tight tracking-tight">
            {title}
          </SheetTitle>
          {description && (
            <p className="mt-1 pr-10 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <div className={cn("flex-1 overflow-y-auto px-4 py-3", bodyClassName)}>
          {children}
        </div>
        {footer && (
          <div
            className="shrink-0 border-t border-border/50 bg-background px-4 pt-3"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 0.75rem)" }}
          >
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
