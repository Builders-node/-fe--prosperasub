import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  Bell,
  CalendarDays,
  CheckCheck,
  Clock,
  CreditCard,
  Megaphone,
  Sparkles,
} from "lucide-react";
import { PageLoader } from "@/components/ui/spinner";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { UserLayout } from "@/components/layout/UserLayout";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { QueryError } from "@/components/patterns/QueryError";
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
    case "announcement": return Megaphone;
    default:             return Bell;
  }
}

/** Emoji at the start of a title ("🧹 Cleaning Reminder") — the icon tile already says what it is. */
const stripLeadingEmoji = (t: string) => t.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, "");

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
  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true });

  const handleOpen = () => {
    if (!notification.isRead) onRead(notification.id);
    if (notification.actionUrl) {
      // The platform spans two origins now — a car booking's notification
      // points at vehicles.everysub.net. Router navigation would treat that as
      // a path and land on a blank route.
      if (/^https?:\/\//i.test(notification.actionUrl)) window.location.href = notification.actionUrl;
      else navigate(notification.actionUrl);
    }
  };

  // The account page's row: a 40px neutral tile, 16 semibold title, 12
  // captions. Colour is not the category's job — the tinted plates were five
  // accents on one screen. Unread is a dot; the archive action is always
  // there, because a phone has no hover to reveal it.
  return (
    <div className="flex items-start gap-3 rounded-radius-md p-2.5 transition-colors hover:bg-inset">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-inset text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>

      <div
        className={cn("min-w-0 flex-1", notification.actionUrl && "cursor-pointer")}
        onClick={handleOpen}
        role={notification.actionUrl ? "button" : undefined}
      >
        <div className="flex items-center gap-2">
          <p className="min-w-0 text-title font-semibold text-foreground">{stripLeadingEmoji(notification.title)}</p>
          {!notification.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
        </div>
        <p className="mt-0.5 text-meta text-muted-foreground">{notification.body}</p>
        <p className="mt-1 text-meta text-muted-foreground/70">{timeAgo}</p>
      </div>

      <Button variant="ghost" size="iconSm" aria-label="Archive" title="Archive"
        onClick={() => onArchive(notification.id)} className="text-muted-foreground">
        <Archive />
      </Button>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-1 rounded-radius-lg bg-card p-1.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="animate-pulse p-2.5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-[8px] bg-muted" />
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
        {/* `EmptyState` was never a component in this codebase — this branch
            threw a ReferenceError and showed the error boundary instead of a
            sign-in prompt. The empty state ten lines down is the real one. */}
        <div className="app-container pt-5">
          <YdEmptyState
            icon={Bell}
            title="Sign in to view notifications"
            subtitle="Stay updated on your bookings, payments, and plan activity."
            action={<Button onClick={() => openAuthModal("login", "/notifications")}>Sign in</Button>}
          />
        </div>
      </UserLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <UserLayout
      title="Notifications"
      showBackButton
      backTo="/discovery"
      // A screen opened from the bell: Back is the way out, so no tab bar, and
      // the bell's slot does this page's one action instead of pointing here.
      showBottomNav={false}
      headerAction={unreadCount > 0 ? (
        <button
          type="button"
          aria-label="Mark all read"
          title="Mark all read"
          onClick={handleMarkAllRead}
          disabled={markAllRead.isPending}
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <CheckCheck className="h-6 w-6" />
        </button>
      ) : <span className="h-10 w-10" aria-hidden />}
    >
      <div className="app-container space-y-3 pb-space-8 pt-4">
        {/* Desktop has no title bar, so the action shows here instead. */}
        {unreadCount > 0 && (
          <div className="hidden justify-end md:flex">
            <Button variant="secondary" size="sm" onClick={handleMarkAllRead} loading={markAllRead.isPending}>
              <CheckCheck /> Mark all read
            </Button>
          </div>
        )}

        {/* One line that scrolls sideways — it used to cut "Bookings" off at the edge. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-body font-semibold transition-colors",
                activeTab === tab.key
                  ? "bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.key === "unread" && unreadCount > 0 && (
                <span className="tabular-nums opacity-60">{unreadCount}</span>
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
          <YdEmptyState
            icon={Bell}
            title="No notifications"
            subtitle={activeTab === "unread"
              ? "You're all caught up!"
              : "Activity on your account will appear here."}
          />
        ) : (
          <div className="space-y-1 rounded-radius-lg bg-card p-1.5">
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
