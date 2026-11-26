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
    <div className="pt-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="animate-pulse py-4 pl-6 pr-5">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 shrink-0 rounded-[10px] bg-muted" />
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
      {/* On a phone the feed runs edge to edge (still a rounded panel) — a card inside the page's
          gutters wasted 32px of every line. A desktop keeps the column. */}
      <div className="pb-space-8 pt-4 md:app-container md:pt-8">
        <div className="mx-auto w-full max-w-[720px] space-y-4 md:space-y-5">
          <div className="hidden items-end justify-between gap-4 md:flex">
            <h1 className="text-[28px] font-bold tracking-tight text-foreground">{tr("Notifications")}</h1>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markAllRead.isPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-body font-semibold text-muted-foreground transition-colors hover:bg-inset hover:text-foreground disabled:opacity-50"
              >
                <CheckCheck className="h-4 w-4" />{tr("Mark all read")}
              </button>
            )}
          </div>

          <div className="px-4 md:px-0">
            <FilterPills value={filter} onChange={setFilter} unreadCount={unreadCount} hasBusiness={feed.hasBusiness} />
          </div>

          <div className="overflow-hidden rounded-radius-lg bg-card">

            {isLoading ? (
              <Skeleton />
            ) : isError ? (
              <div className="p-4">
                <QueryError
                  title={tr("Couldn't load notifications")}
                  error={error instanceof Error ? error.message : undefined}
                  onRetry={() => refetch()}
                  retrying={isFetching}
                />
              </div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-inset text-foreground/70"><Bell className="h-6 w-6" strokeWidth={1.75} /></span>
                <p className="mt-4 text-title font-semibold text-foreground">{filter === "unread" ? tr("You're all caught up") : tr("No notifications")}</p>
                <p className="mt-1 max-w-[300px] text-body text-muted-foreground">
                  {filter === "unread" ? tr("Nothing new since you last looked.") : tr("Activity on your account will appear here.")}
                </p>
              </div>
            ) : (
              <div className="pb-2">
                <NotificationList
                  groups={groups}
                  filter={filter}
                  onRead={feed.onRead}
                  onArchive={feed.onArchive}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </UserLayout>
  );
};

export default Notifications;
