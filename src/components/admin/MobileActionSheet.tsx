import { type ReactNode, useState } from "react";
import { MoreVertical } from "lucide-react";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { cn } from "@/lib/utils";

export interface MobileAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

interface MobileActionSheetProps {
  title?: string;
  actions: MobileAction[];
  className?: string;
}

export function MobileActionSheet({ title, actions, className }: MobileActionSheetProps) {
  const [open, setOpen] = useState(false);
  const visible = actions.filter((a) => !a.hidden);
  if (!visible.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-radius-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        aria-label="More actions"
      >
        <MoreVertical className="h-5 w-5" />
      </button>

      {/* Named for the phone, but this list renders on every viewport, so on a
          desktop the bare sheet was a full-width bar on the bottom edge.
          ResponsiveDialog keeps the sheet on a phone and centres it above. */}
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={title ?? "Actions"}
        bodyClassName="p-2"
      >
        <div className="flex flex-col gap-1">
          {visible.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                setTimeout(() => action.onClick(), 150);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-radius-md px-4 py-3.5 text-left text-sm font-medium transition-colors",
                "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                action.danger && "text-destructive hover:bg-destructive/10",
                action.disabled && "pointer-events-none opacity-40",
              )}
            >
              {action.icon && <span className="flex h-5 w-5 shrink-0 items-center justify-center">{action.icon}</span>}
              {action.label}
            </button>
          ))}
        </div>
      </ResponsiveDialog>
    </>
  );
}
