import { useState } from "react";
import { useSeo } from "@/hooks/useSeo";
import { Bell, CheckCheck } from "lucide-react";
import { PageLoader } from "@/components/ui/spinner";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { UserLayout } from "@/components/layout/UserLayout";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { QueryError } from "@/components/patterns/QueryError";
import { Button } from "@/components/ui/button";
import type { NotificationFilter } from "@/lib/notifications/present";
import { FilterPills, NotificationList, useNotificationFeed } from "@/components/notifications/NotificationFeed";
import { tr } from "@/lib/tr";

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-1 rounded-radius-lg bg-card p-1.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="animate-pulse px-3 py-3.5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-48 rounded bg-muted" />
              <div className="h-2.5 w-72 max-w-full rounded bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


// ─── Page ─────────────────────────────────────────────────────────────────────

const Notifications = () => {
  useSeo({ title: tr("Notifications") });
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const feed = useNotificationFeed(filter);
  const { groups, unreadCount, isLoading, isError, error, refetch, isFetching, markAllRead } = feed;

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => toast.success(tr("All notifications marked as read")),
    });
  };

  // ── Auth gate ──────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <UserLayout title={tr("Notifications")}>
        <PageLoader />
      </UserLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <UserLayout title={tr("Notifications")}>
        {/* `EmptyState` was never a component in this codebase — this branch
            threw a ReferenceError and showed the error boundary instead of a
            sign-in prompt. The empty state ten lines down is the real one. */}
        <div className="app-container pt-5">
          <YdEmptyState
            icon={Bell}
            title={tr("Log in to see your notifications")}
            subtitle={tr("Stay updated on your bookings, payments, and plan activity.")}
            action={<Button onClick={() => openAuthModal("login", "/notifications")}>{tr("Log in")}</Button>}
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
      title={tr("Notifications")}
      showBackButton
      backTo="/discovery"
      // A screen opened from the bell: Back is the way out, so no tab bar, and
      // the bell's slot does this page's one action instead of pointing here.
      showBottomNav={false}
      headerAction={unreadCount > 0 ? (
        <button
          type="button"
          aria-label={tr("Mark all read")}
          title={tr("Mark all read")}
          onClick={handleMarkAllRead}
          disabled={markAllRead.isPending}
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <CheckCheck className="h-6 w-6" />
        </button>
      ) : <span className="h-10 w-10" aria-hidden />}
    >
      {/* A column, not the full 1280px: a notification is a sentence, and a
          sentence across the whole screen is hard to read. */}
      <div className="app-container pb-space-8 pt-4 md:pt-8">
        <div className="mx-auto w-full max-w-[720px] space-y-4">
          <div className="hidden items-center justify-between gap-4 md:flex">
            <h1 className="text-[28px] font-bold tracking-tight text-foreground">{tr("Notifications")}</h1>
            {unreadCount > 0 && (
              <Button variant="secondary" size="sm" onClick={handleMarkAllRead} loading={markAllRead.isPending}>
                <CheckCheck />{" "}{tr("Mark all read")}</Button>
            )}
          </div>

          <FilterPills value={filter} onChange={setFilter} unreadCount={unreadCount} hasBusiness={feed.hasBusiness} />

          {isLoading ? (
            <Skeleton />
          ) : isError ? (
            <QueryError
              title={tr("Couldn't load notifications")}
              error={error instanceof Error ? error.message : undefined}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          ) : groups.length === 0 ? (
            <YdEmptyState
              icon={Bell}
              title={filter === "unread" ? tr("You're all caught up") : tr("No notifications")}
              subtitle={filter === "unread"
                ? tr("Nothing new since you last looked.")
                : tr("Activity on your account will appear here.")}
            />
          ) : (
            <div className="rounded-radius-lg bg-card p-1.5 md:p-2">
              <NotificationList
                groups={groups}
                filter={filter}
                onRead={feed.onRead}
                onArchive={feed.onArchive}
              />
            </div>
          )}
          {groups.length > 0 && (
            <p className="px-1 text-center text-meta text-muted-foreground md:hidden">{tr("Swipe a notification left to archive it.")}</p>
          )}
        </div>
      </div>
    </UserLayout>
  );
};

export default Notifications;
