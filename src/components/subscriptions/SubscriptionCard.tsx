import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Action {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  /** "primary" = filled foreground button; "secondary" = subtle muted button.
   *  Default is secondary. Use primary sparingly — max one per card. */
  variant?: "primary" | "secondary";
  key?: string;
}

interface Props {
  /** Icon shown in the top-left tile. */
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind bg class for the icon tile (e.g. `bg-primary/15`). */
  iconTint?: string;
  /** Tailwind text class for the icon glyph (e.g. `text-primary`). */
  iconColor?: string;
  /** Primary card title (bold). */
  title: ReactNode;
  /** Optional single-line subtitle under the title (muted). */
  subtitle?: ReactNode;
  /** Optional second metadata line (e.g. date range, price · period). */
  metadata?: ReactNode;
  /** Right-aligned badge in the header (status, plan name, etc). */
  statusBadge?: ReactNode;
  /** Zero or more buttons rendered in a grid below the header. Two-per-row
   *  when there are 2, one-per-row otherwise. */
  actions?: Action[];
  /** Bottom slot for the rate strip (or any other subtle info). */
  rate?: ReactNode;
  /** Optional row-click handler (Enter/Space keyboard support included). */
  onClick?: () => void;
  className?: string;
}

/**
 * Canonical subscription/booking card. Every row in MySubs (Food / Cleaning /
 * Cars / Beach) renders through this component so the visual language stays
 * identical across services — only the content differs.
 *
 * Structure:
 *   ┌───────────────────────────────────────┐
 *   │  [icon]  Title                 Status │  ← header
 *   │          Subtitle                     │
 *   │          Metadata · price · dates     │
 *   ├───────────────────────────────────────┤
 *   │  [Action 1]        [Action 2]         │  ← actions grid (optional)
 *   ├───────────────────────────────────────┤
 *   │  How was it?    ★ ★ ★ ★ ★             │  ← rate strip (optional)
 *   └───────────────────────────────────────┘
 */
export function SubscriptionCard({
  icon: Icon, iconTint = "bg-primary/15", iconColor = "text-primary",
  title, subtitle, metadata, statusBadge,
  actions = [], rate, onClick, className,
}: Props) {
  const isRowClickable = !!onClick;

  return (
    <div
      role={isRowClickable ? "button" : undefined}
      tabIndex={isRowClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={isRowClickable ? (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick!(); }
      } : undefined}
      className={cn(
        "rounded-2xl bg-card p-4 space-y-3",
        isRowClickable && "cursor-pointer transition-colors hover:bg-muted/30",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconTint)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold leading-tight text-foreground">{title}</p>
              {subtitle && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
            {statusBadge && <div className="shrink-0">{statusBadge}</div>}
          </div>
          {metadata && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{metadata}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div
          className={cn(
            "grid gap-2",
            actions.length === 2 ? "grid-cols-2" : "grid-cols-1",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {actions.map((a, i) => {
            const IconEl = a.icon;
            const isPrimary = a.variant === "primary";
            return (
              <button
                key={a.key ?? `${i}-${a.label}`}
                type="button"
                onClick={a.onClick}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-colors",
                  isPrimary
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-muted/40 text-foreground hover:bg-muted",
                )}
              >
                {IconEl && <IconEl className="h-4 w-4" />}
                {a.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Rate strip / other bottom slot */}
      {rate && <div onClick={(e) => e.stopPropagation()}>{rate}</div>}
    </div>
  );
}
