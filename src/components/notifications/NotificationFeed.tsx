import { useMemo } from "react";
import { toast } from "sonner";
import {
  useArchiveNotification, useMarkAllRead, useMarkAsRead, useNotifications, useUnarchiveNotification,
} from "@/hooks/useNotifications";
import {
  applyFilter, collapseChains, groupByDay, isBusinessNotification, type NotificationFilter, type NotificationGroup,
} from "@/lib/notifications/present";
import { cn } from "@/lib/utils";
import { NotificationCard } from "./NotificationCard";

/**
 * Everything the page and the bell's panel share: one query (the newest 100,
 * filtered here so every tab's count is right at once), chains folded, and
 * the read / archive actions with an Undo.
 */
export function useNotificationFeed(filter: NotificationFilter) {
  const query = useNotifications();
  const all = useMemo(() => query.data ?? [], [query.data]);
  const markAsRead = useMarkAsRead();
  const markAllRead = useMarkAllRead();
  const archive = useArchiveNotification();
  const unarchive = useUnarchiveNotification();

  const chains = useMemo(() => collapseChains(all), [all]);
  const visible = useMemo(() => applyFilter(chains, filter), [chains, filter]);

  return {
    ...query,
    groups: visible,
    unreadCount: chains.filter((g) => !g.isRead).length,
    hasBusiness: all.some(isBusinessNotification),
    markAllRead,
    onRead: (ids: string[]) => markAsRead.mutate(ids),
    onArchive: (ids: string[]) =>
      archive.mutate(ids, {
        onSuccess: () => toast("Notification archived", {
          action: { label: "Undo", onClick: () => unarchive.mutate(ids) },
        }),
      }),
  };
}

export function FilterPills({ value, onChange, unreadCount, hasBusiness, size = "md" }: {
  value: NotificationFilter;
  onChange: (f: NotificationFilter) => void;
  unreadCount: number;
  hasBusiness: boolean;
  size?: "sm" | "md";
}) {
  const tabs: Array<{ key: NotificationFilter; label: string; count?: number }> = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread", count: unreadCount },
    // Only for someone who runs a business — everyone else would see an
    // empty tab.
    ...(hasBusiness ? [{ key: "business" as const, label: "Business" }] : []),
  ];
  return (
    <div role="tablist" className="flex gap-1.5">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full font-semibold transition-colors",
            size === "sm" ? "h-8 px-3 text-sm" : "h-9 px-4 text-[14px]",
            value === t.key ? "bg-foreground text-background" : "bg-inset text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {!!t.count && <span className="tabular-nums opacity-60">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** The list under Today / Yesterday / Earlier headings. */
export function NotificationList({ groups, filter, onRead, onArchive, onNavigate, compact, limit }: {
  groups: NotificationGroup[];
  filter: NotificationFilter;
  onRead: (ids: string[]) => void;
  onArchive: (ids: string[]) => void;
  onNavigate?: () => void;
  compact?: boolean;
  limit?: number;
}) {
  const now = new Date();
  const days = groupByDay(limit ? groups.slice(0, limit) : groups, now);
  return (
    <div className="space-y-4">
      {days.map(({ day, items }) => (
        <section key={day} aria-label={day}>
          <h2 className={cn("mb-1.5 text-sm font-semibold text-muted-foreground", compact ? "px-3" : "px-1")}>{day}</h2>
          <div className="space-y-1">
            {items.map((g) => (
              <NotificationCard
                key={g.lead.id}
                group={g}
                onRead={onRead}
                onArchive={onArchive}
                onNavigate={onNavigate}
                showBusinessTag={filter !== "business"}
                compact={compact}
                now={now}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
