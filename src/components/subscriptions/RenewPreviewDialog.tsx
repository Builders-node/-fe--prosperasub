import { CalendarDays, ArrowRight, RefreshCw } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatUSD } from "@/lib/pricing";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Plan/package/membership label shown as the dialog title. */
  title: string;
  /** ISO date string (YYYY-MM-DD) when the current period ends. Optional — if
   *  unknown we skip the "current period" line and show only the new one. */
  currentEndDate?: string | null;
  /** ISO date string when the renewed period will start. */
  newStartDate: string;
  /** ISO date string when the renewed period will end. */
  newEndDate: string;
  /** Amount that will be charged, in cents. */
  amountCents: number;
  /** Called when the user confirms the renewal — usually navigates to the
   *  checkout page with ?renew=<subId>. */
  onConfirm: () => void;
}

/**
 * Confirmation modal shown before we push the user into the renewal checkout.
 * Tells them exactly what they're paying for and what dates they'll get so a
 * mis-click doesn't turn into a "why did I get charged" support ticket.
 */
export function RenewPreviewDialog({
  open, onOpenChange, title, currentEndDate, newStartDate, newEndDate, amountCents, onConfirm,
}: Props) {
  const fmt = (d: string) => {
    // Parse as local date-only so we don't shift a day around midnight.
    const dt = new Date(`${d}T00:00:00`);
    return dt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };
  const days = Math.max(
    Math.round((Date.parse(`${newEndDate}T00:00:00Z`) - Date.parse(`${newStartDate}T00:00:00Z`)) / 86400000),
    1,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
              <RefreshCw className="h-4 w-4" />
            </span>
            <DialogTitle className="text-lg font-black leading-tight">Renew subscription</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">{title}</DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          {currentEndDate && (
            <div className="flex items-center gap-3 rounded-2xl bg-muted/40 p-3 text-sm">
              <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Current period ends</p>
                <p className="mt-0.5 font-bold text-foreground">{fmt(currentEndDate)}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 rounded-2xl bg-primary/10 p-3 text-sm">
            <RefreshCw className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wider text-primary/80">New period</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 font-bold text-foreground">
                {fmt(newStartDate)} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {fmt(newEndDate)}
                <span className="text-xs font-normal text-muted-foreground">({days} day{days === 1 ? "" : "s"})</span>
              </p>
            </div>
          </div>

          <div className="flex items-end justify-between rounded-2xl border border-border/60 p-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Amount</p>
              <p className="mt-0.5 text-2xl font-black tabular-nums text-foreground">
                {formatUSD(amountCents)}
              </p>
            </div>
            <p className="mb-1 text-xs text-muted-foreground">Paid at checkout</p>
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-full gap-1.5"
            onClick={() => { onOpenChange(false); onConfirm(); }}
          >
            <RefreshCw className="h-4 w-4" />
            Renew and pay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
