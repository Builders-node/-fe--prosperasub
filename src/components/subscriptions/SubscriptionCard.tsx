import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Action {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  /**
   * "primary" = filled, at most one per card. "secondary" = an inset pill.
   * "ghost" = text only, for the action nobody came here to take (Cancel).
   */
  variant?: "primary" | "secondary" | "ghost";
  key?: string;
}

interface Props {
  /** Icon shown in the tile — the service's, drawn in the one neutral tile. */
  icon: React.ComponentType<{ className?: string }>;
  /** Primary card title. */
  title: ReactNode;
  /** One muted line under the title: who, how many, which dates. */
  subtitle?: ReactNode;
  /** The price. Sits opposite the status, not on a line of its own. */
  metadata?: ReactNode;
  /** Right-aligned status pill. */
  statusBadge?: ReactNode;
  /** Quiet pill buttons on one row. They wrap; they never stretch. */
  actions?: Action[];
  /** Bottom slot — the rating strip, shown only once something is rated. */
  rate?: ReactNode;
  onClick?: () => void;
  className?: string;
}

/**
 * One subscription, one card — every service.
 *
 * Rewritten against DESIGN.md after the mobile screen stopped scaling. What
 * changed and why:
 *
 * - **16px radius, not 24.** `rounded-2xl` maps to `--radius-lg` in this
 *   project; a card is `--radius-md`. Three cards at 24 read as three panels.
 * - **The type scale the design actually uses**: 16 semibold for the thing you
 *   act on, 12 for what explains it. It was 14 bold / 12, which is a different
 *   product's ramp.
 * - **No per-service colours.** Each service used to bring its own tinted tile
 *   — emerald, cyan, rose — so a list of three subscriptions was three
 *   accents. The palette is three greys and one orange; the tile is `bg-inset`
 *   and the glyph is muted, and the service is legible from its icon and name.
 * - **Actions do not stretch.** Two full-width buttons per card meant a card
 *   was mostly buttons, and a third action broke the grid. They are pills on
 *   one wrapping row now, sized to their label.
 * - **The rating strip only shows a rating that exists.** Asking belongs to
 *   the prompt at the top of the page, which asks once, about work that
 *   actually happened.
 */
export function SubscriptionCard({
  icon: Icon, title, subtitle, metadata, statusBadge,
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
        "space-y-3 rounded-radius-md bg-card p-4 tracking-[-0.02em]",
        isRowClickable && "cursor-pointer transition-colors hover:bg-muted/30",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-inset">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-[22px] text-foreground">
              {title}
            </p>
            {statusBadge && <div className="shrink-0">{statusBadge}</div>}
          </div>

          {/* Everything that explains it on one line, price at the end — a
              price on its own third line pushed the actions off the fold. */}
          <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[12px] leading-[16px] text-muted-foreground">
            {subtitle ? <span className="min-w-0 truncate">{subtitle}</span> : <span />}
            {metadata && <span className="shrink-0 tabular-nums text-foreground">{metadata}</span>}
          </div>
        </div>
      </div>

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {actions.map((a, i) => {
            const IconEl = a.icon;
            return (
              <button
                key={a.key ?? `${i}-${a.label}`}
                type="button"
                onClick={a.onClick}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors",
                  a.variant === "primary" ? "bg-foreground text-background hover:bg-foreground/90"
                  : a.variant === "ghost" ? "px-2 text-muted-foreground hover:text-foreground"
                  : "bg-inset text-foreground hover:bg-muted",
                )}
              >
                {IconEl && <IconEl className="h-3.5 w-3.5" />}
                {a.label}
              </button>
            );
          })}
        </div>
      )}

      {rate && <div onClick={(e) => e.stopPropagation()}>{rate}</div>}
    </div>
  );
}
