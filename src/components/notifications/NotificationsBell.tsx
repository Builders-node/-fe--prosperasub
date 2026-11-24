import { useState } from "react";
import { Link } from "react-router-dom";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Bell, CheckCheck } from "lucide-react";
import { NotificationsIcon } from "@/components/icons/FigmaIcons";
import { HeaderBadge } from "@/components/layout/HeaderBadge";
import { HEADER_ACTION_CLASS, HEADER_ACTION_ICON_CLASS } from "@/components/layout/headerAction";
import { Spinner } from "@/components/ui/spinner";
import type { NotificationFilter } from "@/lib/notifications/present";
import { cn } from "@/lib/utils";
import { FilterPills, NotificationList, useNotificationFeed } from "./NotificationFeed";

/** How many stories the panel shows before "See all". */
const PANEL_LIMIT = 8;

/**
 * The desktop bell: a 420px panel under it instead of a trip to a full-width
 * page. The newest stories, All / Unread / Business, Mark all read, and "See
 * all" for the page. (A phone keeps the page — a panel that size is a page.)
 */
export function NotificationsBell({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const aria = count > 0 ? `Notifications (${count})` : "Notifications";

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button type="button" aria-label={aria} className={cn("relative", HEADER_ACTION_CLASS, open && "bg-muted")}>
          <NotificationsIcon className={HEADER_ACTION_ICON_CLASS} />
          <HeaderBadge count={count} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={14}
          collisionPadding={16}
          className={cn(
            "z-50 flex max-h-[min(640px,calc(100vh-120px))] w-[420px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-radius-xl border border-[hsl(var(--app-divider))] bg-card text-card-foreground shadow-figma outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          {open && <Panel onClose={() => setOpen(false)} />}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const feed = useNotificationFeed(filter);

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <h2 className="text-heading font-bold text-foreground">Notifications</h2>
        {feed.unreadCount > 0 && (
          <button
            type="button"
            onClick={() => feed.markAllRead.mutate()}
            disabled={feed.markAllRead.isPending}
            className="-mr-2 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-inset hover:text-foreground disabled:opacity-50"
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        )}
      </div>
      <div className="px-4 pb-3">
        <FilterPills value={filter} onChange={setFilter} unreadCount={feed.unreadCount} hasBusiness={feed.hasBusiness} size="sm" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {feed.isLoading ? (
          <div className="flex justify-center py-10"><Spinner className="text-primary" /></div>
        ) : feed.isError ? (
          <p className="px-3 py-8 text-center text-[14px] text-muted-foreground">
            Couldn't load notifications.{" "}
            <button type="button" className="font-semibold text-foreground underline" onClick={() => feed.refetch()}>Retry</button>
          </p>
        ) : feed.groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-inset text-muted-foreground"><Bell className="h-6 w-6" /></span>
            <p className="text-title font-semibold text-foreground">{filter === "unread" ? "You're all caught up" : "No notifications yet"}</p>
          </div>
        ) : (
          <NotificationList
            groups={feed.groups}
            filter={filter}
            onRead={feed.onRead}
            onArchive={feed.onArchive}
            onNavigate={onClose}
            compact
            limit={PANEL_LIMIT}
          />
        )}
      </div>

      <Link
        to="/notifications"
        onClick={onClose}
        className="flex h-12 shrink-0 items-center justify-center border-t border-[hsl(var(--app-divider))] text-[14px] font-semibold text-primary transition-colors hover:bg-inset"
      >
        See all notifications
      </Link>
    </>
  );
}
