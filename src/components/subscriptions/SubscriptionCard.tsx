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
  /** Icon shown in the tile when there is no photo — the service's, muted. */
  icon: React.ComponentType<{ className?: string }>;
  /** Photograph for the leading tile. Falls back to the icon when absent. */
  image?: string | null;
  /** Primary card title. */
  title: ReactNode;
  /** One muted line under the title: who, how many, which dates. */
  subtitle?: ReactNode;
  /** The price. Pinned to the bottom-right of the tile's body. */
  metadata?: ReactNode;
  /** Status pill, top-right beside the title. */
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
 * The layout is the Figma My Subs redesign, mapped onto the project's tokens so
 * the exact light palette (#f6f6f6 page, white card, #2a2a2a ink, #7d7d7d
 * secondary, #f7a21b accent) comes out of `bg-background`/`bg-card`/
 * `text-foreground`/`text-muted-foreground`/`text-primary` and the dark theme
 * comes for free.
 *
 * The measurements are the design's, to the pixel: a 104px photo tile at
 * radius 8 on the left; the body padded 8 top and bottom with the title at the
 * top (16 semibold) and the price pinned to the bottom-right (16 semibold),
 * the description filling the space between; the card at radius 16 with
 * `--shadow-figma` — the one soft shadow that keeps a white card off a #f6f6f6
 * page and resolves to nothing in the dark.
 *
 * A subscription carries no photo yet, so the tile falls back to the service
 * glyph on `bg-inset`. Status rides top-right and actions/rating flow below the
 * tile — the mock had neither, but a real card has to renew, cancel and rate.
 */
export function SubscriptionCard({
  icon: Icon, image, title, subtitle, metadata, statusBadge,
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
        "rounded-radius-md bg-card p-2 pr-4 shadow-figma tracking-[-0.02em]",
        isRowClickable && "cursor-pointer transition-colors hover:bg-muted/40",
        className,
      )}
    >
      <div className="flex gap-4">
        {/* The 104px tile — photo, or the service glyph when there is none. */}
        <div className="relative size-[104px] shrink-0 overflow-hidden rounded-[8px] bg-inset">
          {image ? (
            <img
              src={image}
              alt=""
              className="absolute inset-0 size-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="flex size-full items-center justify-center">
              <Icon className="size-8 text-muted-foreground" />
            </span>
          )}
        </div>

        {/* Body: title at the top, price pinned to the bottom, description
            filling the gap — the design's exact vertical rhythm. */}
        <div className="flex min-w-0 flex-1 flex-col py-2">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-[19px] text-foreground">
              {title}
            </p>
            {statusBadge && <div className="shrink-0">{statusBadge}</div>}
          </div>

          <div className="mt-1 flex flex-1 flex-col justify-end gap-1">
            {subtitle && (
              <p className="line-clamp-2 text-[12px] leading-[16px] tracking-[-0.24px] text-muted-foreground">
                {subtitle}
              </p>
            )}
            {metadata && (
              <div className="flex items-end justify-end">
                <span className="text-[16px] font-semibold leading-[19px] tabular-nums text-foreground">
                  {metadata}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
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

      {rate && <div className="mt-3" onClick={(e) => e.stopPropagation()}>{rate}</div>}
    </div>
  );
}
