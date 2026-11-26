import { useRef, useState, type PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TONE_CLASS, openNotificationUrl, present, shortTime, stepLabel, type NotificationGroup,
} from "@/lib/notifications/present";
import { tr, trx } from "@/lib/tr";

/** How far a finger drags a card left before letting go archives it. */
const SWIPE_ARCHIVE_PX = 96;

/**
 * One story in the feed: a coloured icon by kind, the title, the copy, the one
 * thing to do about it (Renew, Subscribe again, Open order), and — when a
 * plan's lifecycle was told in several rows — the earlier steps folded in.
 *
 * Unread is the tinted background, not a speck after the title. Archive is
 * out of the way: it appears on hover with a mouse, and on a phone the card
 * swipes left (there is no hover there to reveal a button).
 */
export function NotificationCard({
  group,
  onRead,
  onArchive,
  onNavigate,
  showBusinessTag = false,
  compact = false,
  divider = false,
  now,
}: {
  group: NotificationGroup;
  onRead: (ids: string[]) => void;
  onArchive: (ids: string[]) => void;
  /** Called after the card sends the person somewhere — the panel closes. */
  onNavigate?: () => void;
  showBusinessTag?: boolean;
  compact?: boolean;
  /** A hairline above, starting where the text starts. */
  divider?: boolean;
  now?: Date;
}) {
  const navigate = useNavigate();
  const { lead, earlier, ids, isRead } = group;
  const p = present(lead, now);
  const Icon = p.icon;
  const [open, setOpen] = useState(false);

  // ── swipe to archive (touch only) ──
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const drag = useRef<{ x: number; y: number; active: boolean; moved: boolean } | null>(null);

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    drag.current = { x: e.clientX, y: e.clientY, active: false, moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { drag.current = null; return; } // a scroll
      if (Math.abs(mx) < 10) return;
      d.active = true;
    }
    d.moved = true;
    setDx(Math.min(0, mx));
  };
  const onPointerEnd = () => {
    const d = drag.current;
    drag.current = d?.moved ? { ...d, active: false } : null;
    if (!d?.active) return;
    if (dx <= -SWIPE_ARCHIVE_PX) {
      setLeaving(true);
      setDx(-window.innerWidth);
      window.setTimeout(() => onArchive(ids), 180);
    } else {
      setDx(0);
    }
  };

  const go = (url: string | null | undefined) => {
    if (!isRead) onRead(ids);
    if (!url) return;
    onNavigate?.();
    openNotificationUrl(url, navigate);
  };

  const handleCardClick = () => {
    // The tap that ended a swipe is not a tap on the card.
    if (drag.current?.moved) { drag.current = null; return; }
    go(lead.actionUrl);
  };

  return (
    <div className={cn("group relative overflow-hidden", leaving && "pointer-events-none")}>
      {/* What the swipe uncovers. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center justify-end bg-negative pr-6 text-white transition-opacity md:hidden",
          dx === 0 ? "opacity-0" : "opacity-100",
        )}
      >
        <Archive className="h-5 w-5" />
      </div>

      <div
        role={lead.actionUrl ? "link" : undefined}
        tabIndex={lead.actionUrl ? 0 : undefined}
        onClick={handleCardClick}
        onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget === e.target) go(lead.actionUrl); }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: drag.current?.active ? "none" : "transform 180ms ease, background-color 150ms",
        }}
        className={cn(
          "relative flex touch-pan-y select-none items-start gap-3 bg-card outline-none transition-colors md:select-auto",
          compact ? "py-3 pl-5 pr-4" : "py-4 pl-6 pr-4 md:pr-5",
          lead.actionUrl && "cursor-pointer hover:bg-inset/60",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        )}
      >
        {divider && (
          <span aria-hidden className={cn("pointer-events-none absolute right-0 top-0 h-px bg-[hsl(var(--app-divider))]", compact ? "left-[68px]" : "left-[72px]")} />
        )}
        {/* Unread is a dot in the left margin and a heavier title — nothing
            else. The old tinted card + dot + coloured circle said it three
            times and made the feed look like a template. */}
        {!isRead && (
          <span aria-label={tr("Unread")} className={cn("absolute h-2 w-2 rounded-full bg-primary", compact ? "left-2 top-[26px]" : "left-2.5 top-[30px]")} />
        )}

        {/* One quiet tile for every kind; colour only when something is wrong. */}
        <span
          className={cn(
            "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-inset",
            p.tone === "negative" ? "text-negative" : p.tone === "attention" ? "text-attention" : "text-foreground/70",
          )}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>

        <div className="relative min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <p className={cn("min-w-0 flex-1 text-base leading-5", isRead ? "font-normal text-foreground/80" : "font-semibold text-foreground")}>
              {p.title}
            </p>
            {/* Time, swapped for Archive on hover with a mouse. */}
            <span className="relative flex shrink-0 items-center">
              <span className="text-sm tabular-nums text-muted-foreground md:group-focus-within:opacity-0 md:group-hover:opacity-0">
                {shortTime(lead.createdAt, now)}
              </span>
              <button
                type="button"
                aria-label={tr("Archive")}
                title={tr("Archive")}
                onClick={(e) => { e.stopPropagation(); onArchive(ids); }}
                className={cn(
                  "absolute -right-2 -top-2 hidden h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground md:flex",
                  "pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100",
                )}
              >
                <Archive className="h-4 w-4" />
              </button>
            </span>
          </div>

          {p.body && (
            <p className={cn("mt-1 text-body leading-5 text-muted-foreground", compact ? "line-clamp-2" : "line-clamp-3")}>
              {p.body}
            </p>
          )}
          {showBusinessTag && p.isBusiness && (
            <p className="mt-1.5 text-sm font-medium text-muted-foreground">{tr("Your business")}</p>
          )}

          {(p.action || earlier.length > 0) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {p.action && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); go(p.action!.url); }}
                  className={cn(
                    "inline-flex h-8 items-center rounded-full px-3.5 text-sm font-semibold transition-colors",
                    p.action.primary ? "bg-foreground text-background hover:bg-foreground/90" : "bg-inset text-foreground hover:bg-muted",
                  )}
                >
                  {p.action.label}
                </button>
              )}
              {earlier.length > 0 && (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
                  className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >{trx("{length} earlier", { length: earlier.length })}{" "}{earlier.length === 1 ? "update" : "updates"}
                  <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                </button>
              )}
            </div>
          )}

          {open && earlier.length > 0 && (
            <ol className="mt-2 space-y-1.5 border-l-2 border-muted pl-3">
              {earlier.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-foreground/80">{stepLabel(e)}</span>
                  <span className="shrink-0 text-meta tabular-nums text-muted-foreground">{shortTime(e.createdAt, now)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
