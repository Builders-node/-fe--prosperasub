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
import { tr } from "@/lib/tr";

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
        onSuccess: () => toast(tr("Notification archived"), {
          action: { label: tr("Undo"), onClick: () => unarchive.mutate(ids) },
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
    { key: "all", label: tr("All") },
    { key: "unread", label: tr("Unread"), count: unreadCount },
    // Only for someone who runs a business — everyone else would see an
    // empty tab.
    ...(hasBusiness ? [{ key: "business" as const, label: tr("Business") }] : []),
  ];
  // The app's segmented control — the same track as My subscriptions and
  // the provider page: an inset rail, the chosen tab a card on it.
  return (
    <div role="tablist" className="flex w-full rounded-radius-md bg-inset p-0.5">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-radius-md px-3 text-center font-semibold leading-[22px] transition-colors",
            size === "sm" ? "py-1.5 text-body" : "py-2 text-title",
            value === t.key ? "bg-card text-foreground" : "text-foreground/70 hover:text-foreground",
          )}
        >
          {t.label}
          {!!t.count && (
            <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-meta font-semibold leading-5 tabular-nums text-primary-foreground">{t.count}</span>
          )}
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
    <div>
      {days.map(({ day, items }) => (
        <section key={day} aria-label={tr(day)}>
          <h2 className={cn("pb-1 pt-4 text-sm font-medium text-muted-foreground", compact ? "px-5" : "px-6")}>{tr(day)}</h2>
          <div>
            {items.map((g, i) => (
              <NotificationCard
                key={g.lead.id}
                divider={i > 0}
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
