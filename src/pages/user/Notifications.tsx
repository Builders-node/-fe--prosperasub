import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  Bell,
  CalendarDays,
  CheckCheck,
  Clock,
  CreditCard,
  Sparkles,
  X,
} from "lucide-react";
import { PageLoader } from "@/components/ui/spinner";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { UserLayout } from "@/components/layout/UserLayout";
import { TabEmptyState } from "@/components/subscriptions/MySubsPrimitives";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useNotifications,
  useMarkAsRead,
  useMarkAllRead,
  useArchiveNotification,
  type UserNotification,
} from "@/hooks/useNotifications";

// ─── Category config ──────────────────────────────────────────────────────────

const TABS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "payment", label: "Payments" },
  { key: "subscription", label: "Subscriptions" },
  { key: "booking", label: "Bookings" },
  { key: "reminder", label: "Reminders" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function categoryIcon(category: UserNotification["category"]) {
  switch (category) {
    case "payment":      return CreditCard;
    case "subscription": return Sparkles;
    case "booking":      return CalendarDays;
    case "reminder":     return Clock;
    case "plan":         return Sparkles;
    default:             return Bell;
  }
}

function categoryColor(category: UserNotification["category"]) {
  switch (category) {
    case "payment":      return "bg-green-500/10 text-green-500";
    case "subscription": return "bg-primary/10 text-primary";
    case "booking":      return "bg-blue-500/10 text-blue-500";
    case "reminder":     return "bg-orange-500/10 text-orange-500";
    case "plan":         return "bg-primary/10 text-primary";
    default:             return "bg-muted text-muted-foreground";
  }
}

// ─── Notification row ─────────────────────────────────────────────────────────

function NotificationRow({
  notification,
  onRead,
  onArchive,
}: {
  notification: UserNotification;
  onRead: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const navigate = useNavigate();
  const Icon = categoryIcon(notification.category);
  const iconClass = categoryColor(notification.category);
  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true });

  const handleOpen = () => {
    if (!notification.isRead) onRead(notification.id);
    if (notification.actionUrl) navigate(notification.actionUrl);
  };

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 py-3 transition-colors",
        !notification.isRead && "bg-primary/[0.02]",
      )}
    >
      {/* Category icon — smaller than the old card variant to compact the row */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          iconClass,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div
        className={cn("min-w-0 flex-1 cursor-pointer pr-2", notification.actionUrl && "hover:opacity-80")}
        onClick={handleOpen}
        role={notification.actionUrl ? "button" : undefined}
      >
        <div className="flex items-baseline gap-2">
          <p className={cn("text-sm leading-snug text-foreground", !notification.isRead && "font-bold")}>
            {notification.title}
          </p>
          {/* Unread dot inline with the title so we don't reserve a column for it */}
          {!notification.isRead && (
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          )}
        </div>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{notification.body}</p>
        <p className="mt-1 text-[11px] text-muted-foreground/60">{timeAgo}</p>
      </div>

      {/* Actions — visible on hover */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {!notification.isRead && (
          <button
            type="button"
            title="Mark as read"
            onClick={() => onRead(notification.id)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <CheckCheck className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          title="Archive"
          onClick={() => onArchive(notification.id)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="divide-y divide-border/60">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="animate-pulse py-3">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 shrink-0 rounded-lg bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-48 rounded bg-muted" />
              <div className="h-2.5 w-72 rounded bg-muted" />
              <div className="h-2 w-20 rounded bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const Notifications = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  const isUnreadTab = activeTab === "unread";
  const categoryFilter = isUnreadTab ? undefined : activeTab === "all" ? undefined : activeTab;

  const { data: notifications = [], isLoading, isError, error, refetch, isFetching } = useNotifications({
    category: categoryFilter,
    unreadOnly: isUnreadTab,
  });

  const markAsRead = useMarkAsRead();
  const markAllRead = useMarkAllRead();
  const archive = useArchiveNotification();

  const handleRead = (id: string) => {
    markAsRead.mutate(id);
  };

  const handleArchive = (id: string) => {
    archive.mutate(id, {
      onSuccess: () => toast.success("Notification archived"),
    });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => toast.success("All notifications marked as read"),
    });
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // ── Auth gate ──────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <UserLayout title="Notifications">
        <PageLoader />
      </UserLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <UserLayout title="Notifications">
        <div className="flex items-center justify-center py-20">
          <EmptyState
            title="Sign in to view notifications"
            description="Stay updated on your bookings, payments, and plan activity."
            className="mx-4 max-w-sm"
            action={
              <Button onClick={() => openAuthModal("login", "/notifications")}>
                Sign In
              </Button>
            }
          />
        </div>
      </UserLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <UserLayout title="Notifications">
      <div className="app-container pb-28 pt-5">

        {/* Header action row — page title lives in the mobile header, so we
            only need the mark-all-read action here. */}
        {unreadCount > 0 && (
          <div className="mb-4 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleMarkAllRead}
              loading={markAllRead.isPending}
              className="shrink-0"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                activeTab === tab.key
                  ? "bg-foreground text-background"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.key === "unread" && unreadCount > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <Skeleton />
        ) : isError ? (
          <QueryError
            title="Couldn't load notifications"
            error={error instanceof Error ? error.message : undefined}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        ) : notifications.length === 0 ? (
          <TabEmptyState
            icon={Bell}
            title="No notifications"
            subtitle={activeTab === "unread"
              ? "You're all caught up!"
              : "Activity on your account will appear here."}
          />
        ) : (
          <div className="divide-y divide-border/60">
            {notifications.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onRead={handleRead}
                onArchive={handleArchive}
              />
            ))}
          </div>
        )}
      </div>
    </UserLayout>
  );
};

export default Notifications;
