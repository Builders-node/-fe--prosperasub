import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface BottomSheetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Header title — always visible, pinned to the top. */
  title: ReactNode;
  /** Optional secondary line under the title. */
  subtitle?: ReactNode;
  /** Scrollable body content. */
  children: ReactNode;
  /** Optional fixed bottom action area (e.g. a primary CTA) — always visible. */
  footer?: ReactNode;
  /** Extra classes for the scrollable body. */
  bodyClassName?: string;
  /** Max height of the sheet. */
  className?: string;
}

/**
 * The single, platform-wide bottom-sheet modal.
 *
 *   ┌─────────────────────┐
 *   │ Sticky Header + X   │  solid background, always visible
 *   ├─────────────────────┤
 *   │ Scrollable Content  │  scrolls behind the header & footer
 *   ├─────────────────────┤
 *   │ Fixed CTA Footer    │  always visible, safe-area aware
 *   └─────────────────────┘
 *
 * Uses a flex column (not sticky-within-scroll) so there is never a transparent
 * gap and content never bleeds behind the header or footer.
 */
export function BottomSheetModal({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
  bodyClassName,
  className,
}: BottomSheetModalProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn("flex max-h-[88vh] flex-col gap-0 rounded-t-3xl p-0", className)}
      >
        {/* Sticky header — solid, never scrolls. Close (X) is the built-in
            SheetContent button pinned top-right over this header. */}
        <div className="shrink-0 border-b border-border/50 bg-background px-3 pb-3 pt-4">
          <SheetTitle className="pr-10 text-2xl font-black leading-tight tracking-tight">
            {title}
          </SheetTitle>
          {subtitle && <p className="mt-1 pr-10 text-sm text-muted-foreground">{subtitle}</p>}
        </div>

        {/* Scrollable content */}
        <div className={cn("flex-1 overflow-y-auto px-3 py-3", bodyClassName)}>{children}</div>

        {/* Fixed bottom action area */}
        {footer && (
          <div
            className="shrink-0 border-t border-border/50 bg-background px-3 pt-3"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 0.75rem)" }}
          >
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
