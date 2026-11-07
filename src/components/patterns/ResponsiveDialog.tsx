import type { ReactNode } from "react";
import {
  Dialog, DialogBlock, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
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
  /** Extra class for the content wrapper, both breakpoints. */
  className?: string;
  /** Extra class for the phone sheet only (heights like `h-[92vh]`). */
  sheetClassName?: string;
  /** Class for the content block — a list passes tighter padding. */
  bodyClassName?: string;
}

/**
 * A bottom sheet on a phone, a centred dialog on a desktop — now simply the
 * Dialog, which already is both.
 *
 * It used to switch to a separate Sheet on a phone, with its own title size,
 * hairlines between header, body and footer and no drag handle, so the same
 * screen looked like two different products depending on the width. One
 * shell now: title on the grey, the content on a white block, the footer
 * pinned under it (DESIGN.md §6, Dialogs).
 */
export function ResponsiveDialog({
  open, onOpenChange, title, description, children, footer, className, bodyClassName, sheetClassName,
}: Props) {
  const isMobile = useIsMobile();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-[480px]", className, isMobile && sheetClassName)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogBlock className={bodyClassName}>{children}</DialogBlock>
        {footer && <DialogFooter className="block">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
