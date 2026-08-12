import type { ReactNode } from "react";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";

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
  /** Extra classes for the sheet itself. Mobile only — see below. */
  className?: string;
}

/**
 * A bottom sheet on a phone, a centred modal on a desktop.
 *
 * This used to be a sheet on every screen, which on a wide display meant a
 * full-width bar glued to the bottom edge — the shape a phone wants and a
 * desktop never does.
 *
 * It is now a thin adapter over ResponsiveDialog, which already had the
 * breakpoint logic and the identical header / scrolling body / pinned footer
 * layout. The two were the same component with one difference, and this is the
 * difference, gone.
 *
 * `className` is passed through to the mobile sheet only: the call sites use it
 * for heights like `h-[92vh]`, which is right for a sheet and wrong for a
 * centred dialog that sizes to its content.
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
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={subtitle}
      footer={footer}
      bodyClassName={bodyClassName}
      sheetClassName={className}
    >
      {children}
    </ResponsiveDialog>
  );
}
