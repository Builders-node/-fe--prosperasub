import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { DialogBlock, groupIntoBlocks, preventTouchAutoFocus } from "@/components/ui/dialog-blocks";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * Yandex-style Dialog:
 *  – Mobile: bottom-sheet (slides up from bottom, rounded top corners, safe-area aware)
 *  – Desktop (sm:): centered modal (no shadow, no border)
 *  – Flat surface in both modes
 */
interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /**
   * Classes for the scrolling body.
   *
   * A caller that lays its own sections out — ResponsiveDialog, with a bordered
   * header and footer — needs to cancel the default gap between them.
   */
  bodyClassName?: string;
  /**
   * Put loose content on a white card (the default). Off for the few dialogs
   * that draw their whole surface themselves.
   */
  blocks?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, bodyClassName, blocks = true, onOpenAutoFocus, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      onOpenAutoFocus={preventTouchAutoFocus(onOpenAutoFocus)}
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)" }}
      className={cn(
        // base
        //
        // The shell does NOT scroll — the body inside it does. When the shell
        // was the scroller, the close button (absolutely positioned against
        // it) scrolled away with the content: measured at +16px from the top
        // before scrolling and -784px after, so a tall form had no way to be
        // closed once you had scrolled down. The header only stayed because it
        // is sticky; nothing made the button stay.
        // No side padding: the blocks ARE the sheet's width, like the cards on a
        // workspace page; only the title row and the buttons keep 16px.
        "fixed z-50 flex flex-col bg-background pt-4 duration-200 overflow-hidden",
        // mobile: bottom sheet
        "inset-x-0 bottom-0 rounded-t-radius-lg max-h-[92vh]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        // desktop: centered modal
        "sm:inset-x-auto sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-radius-lg sm:max-h-[85vh]",
        "sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%]",
        "sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]",
        "sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
        "sm:data-[state=closed]:fade-out-0 sm:data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    >
      {/* Mobile drag handle (visual cue that this is a bottom sheet) */}
      <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/20 sm:hidden" />
      {/*
        The scrolling half. Children keep the grid they have always been laid
        out in, so nothing about how a dialog composes its header, fields and
        footer changes — only which box owns the overflow. `min-h-0` is what
        lets a flex child actually shrink and scroll instead of growing past
        its parent. The one column is `minmax(0,1fr)`, not `auto`: an auto
        track grows to its widest child, so a single wide row (a gallery
        strip) pushed every field 20px past the sheet's right edge on a phone.
      */}
      <div className={cn("grid min-h-0 grid-cols-[minmax(0,1fr)] gap-1 overflow-y-auto", bodyClassName)}>
        {blocks ? groupIntoBlocks(children, dialogChrome()) : children}
      </div>
      <DialogPrimitive.Close className="absolute right-4 top-[17px] z-20 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

/**
 * The title row, on the sheet's grey — left-aligned at every width, with the
 * close button on the same line (hence pr-10). It used to centre on a phone
 * and left-align on a desktop, so one dialog had two layouts.
 */
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "sticky top-0 z-10 flex flex-col gap-1 bg-background px-4 pb-2 pr-14 pt-1 text-left",
      "before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-background",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

/**
 * The buttons, pinned under the blocks. On a phone the main action is a
 * full-width button with the secondary one under it; from sm: up they sit
 * right-aligned in a row. Callers put the main action LAST.
 */
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "sticky bottom-0 z-10 flex flex-col-reverse gap-2 bg-background px-4 pt-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      // Left-aligned on every screen; the header keeps it clear of the close button.
      "text-heading font-semibold text-foreground",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-body text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

/** What groupIntoBlocks leaves on the grey instead of putting on a card. */
const dialogChrome = () => new Set<unknown>([DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose]);

export {
  DialogBlock,
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
