import { useState } from "react";
import { Link } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bell, CheckCheck, X } from "lucide-react";
import { NotificationsIcon } from "@/components/icons/FigmaIcons";
import { HeaderBadge } from "@/components/layout/HeaderBadge";
import { HEADER_ACTION_CLASS, HEADER_ACTION_ICON_CLASS } from "@/components/layout/headerAction";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuthModal } from "@/contexts/AuthModalContext";
import type { NotificationFilter } from "@/lib/notifications/present";
import { cn } from "@/lib/utils";
import { FilterPills, NotificationList, useNotificationFeed } from "./NotificationFeed";
import { tr } from "@/lib/tr";

/** How many stories the drawer shows before "See all". */
const PANEL_LIMIT = 12;

/**
 * The bell, and the drawer it opens: a full-height panel that slides in from
 * the right over a dimmed page (440px on a desktop, the whole screen on a
 * phone). Signed in, it is the newest stories with All / Unread / Business,
 * Mark all read and "See all" for the page. Signed out, it says what the
 * notifications are for and offers Log in / Sign up — the bell is a door
 * for a visitor too, instead of being hidden until they have an account.
 */
export function NotificationsBell({ count, signedIn }: { count: number; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const aria = count > 0 ? `${tr("Notifications")} (${count})` : tr("Notifications");

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button type="button" aria-label={aria} className={cn("relative", HEADER_ACTION_CLASS, open && "bg-muted")}>
          <NotificationsIcon className={HEADER_ACTION_ICON_CLASS} />
          <HeaderBadge count={count} />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col bg-card text-card-foreground outline-none sm:w-[440px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right data-[state=closed]:duration-300 data-[state=open]:duration-300 ease-out",
          )}
        >
          {signedIn ? <Panel onClose={() => setOpen(false)} /> : <GuestPanel onClose={() => setOpen(false)} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DrawerHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-2 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
      <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-heading font-bold text-foreground">
        {tr("Notifications")}
      </DialogPrimitive.Title>
      {children}
      <DialogPrimitive.Close
        aria-label={tr("Close")}
        className="-mr-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-6 w-6" />
      </DialogPrimitive.Close>
    </div>
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const feed = useNotificationFeed(filter);

  return (
    <>
      <DrawerHeader>
        {feed.unreadCount > 0 && (
          <button
            type="button"
            onClick={() => feed.markAllRead.mutate()}
            disabled={feed.markAllRead.isPending}
            aria-label={tr("Mark all read")}
            title={tr("Mark all read")}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-muted-foreground transition-colors hover:bg-inset hover:text-foreground disabled:opacity-50 sm:h-9 sm:w-auto sm:px-3"
          >
            {/* Icon-only on a phone: the label pushed the title off in Spanish. */}
            <CheckCheck className="h-5 w-5 sm:h-4 sm:w-4" /><span className="hidden sm:inline">{tr("Mark all read")}</span></button>
        )}
      </DrawerHeader>
      <div className="shrink-0 px-5 pb-3">
        <FilterPills value={filter} onChange={setFilter} unreadCount={feed.unreadCount} hasBusiness={feed.hasBusiness} size="sm" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {feed.isLoading ? (
          <div className="flex justify-center py-10"><Spinner className="text-primary" /></div>
        ) : feed.isError ? (
          <p className="px-3 py-8 text-center text-[14px] text-muted-foreground">{tr("Couldn't load notifications.")}{" "}<button type="button" className="font-semibold text-foreground underline" onClick={() => feed.refetch()}>{tr("Retry")}</button>
          </p>
        ) : feed.groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-inset text-muted-foreground"><Bell className="h-7 w-7" /></span>
            <p className="text-title font-semibold text-foreground">{filter === "unread" ? tr("You're all caught up") : tr("No notifications yet")}</p>
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
        className="flex h-14 shrink-0 items-center justify-center border-t border-[hsl(var(--app-divider))] pb-[env(safe-area-inset-bottom)] text-[14px] font-semibold text-primary transition-colors hover:bg-inset"
      >{tr("See all notifications")}</Link>
    </>
  );
}

/** Signed out: what the bell is for, and the two ways in. */
function GuestPanel({ onClose }: { onClose: () => void }) {
  const { openAuthModal } = useAuthModal();
  const go = (view: "login" | "signup") => {
    onClose();
    openAuthModal(view, `${window.location.pathname}${window.location.search}`);
  };

  return (
    <>
      <DrawerHeader />
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-8 pt-8 text-center sm:px-10">
        <BellIllustration className="h-44 w-44" />
        <h3 className="mt-6 text-[22px] font-bold leading-tight text-foreground">{tr("Every update in one place")}</h3>
        <p className="mt-3 max-w-[340px] text-body text-muted-foreground">
          {tr("Log in or sign up to get renewal reminders, booking and order updates, and news from the businesses you follow.")}
        </p>
        <div className="mt-8 flex w-full max-w-[360px] flex-col gap-3">
          <Button size="lg" className="w-full" onClick={() => go("login")}>{tr("Log in")}</Button>
          <Button size="lg" variant="outline" className="w-full" onClick={() => go("signup")}>{tr("Sign up")}</Button>
        </div>
      </div>
    </>
  );
}

/**
 * A friendly bell with a couple of note cards around it, drawn in the brand
 * colour so it follows the theme (and dark mode) with no image to load.
 */
function BellIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" fill="none" aria-hidden="true" className={className}>
      <circle cx="100" cy="104" r="80" className="fill-primary/10" />
      <ellipse cx="100" cy="176" rx="46" ry="6" className="fill-foreground/10" />
      {/* a note card, top left */}
      <g transform="rotate(-10 52 62)">
        <rect x="22" y="44" width="62" height="36" rx="10" className="fill-card stroke-foreground/15" strokeWidth="2" />
        <circle cx="36" cy="62" r="6" className="fill-primary" />
        <rect x="48" y="55" width="28" height="5" rx="2.5" className="fill-foreground/25" />
        <rect x="48" y="65" width="18" height="5" rx="2.5" className="fill-foreground/15" />
      </g>
      {/* a note card, right */}
      <g transform="rotate(8 158 118)">
        <rect x="128" y="100" width="58" height="34" rx="10" className="fill-card stroke-foreground/15" strokeWidth="2" />
        <path d="M140 117l5 5 9-10" className="stroke-primary" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="160" y="111" width="18" height="5" rx="2.5" className="fill-foreground/25" />
        <rect x="160" y="121" width="12" height="5" rx="2.5" className="fill-foreground/15" />
      </g>
      {/* the bell */}
      <g transform="rotate(-8 100 110)">
        <path
          d="M100 52c-22 0-36 17-36 40v22l-10 16c-2 3 0 7 4 7h84c4 0 6-4 4-7l-10-16V92c0-23-14-40-36-40z"
          className="fill-primary"
        />
        <path d="M78 74c4-8 11-12 18-13" className="stroke-primary-foreground/50" strokeWidth="5" strokeLinecap="round" />
        <circle cx="100" cy="48" r="7" className="fill-primary" />
        <path d="M86 140a14 14 0 0028 0" className="fill-primary" />
        {/* a little face */}
        <circle cx="89" cy="104" r="4" className="fill-primary-foreground" />
        <circle cx="111" cy="104" r="4" className="fill-primary-foreground" />
        <path d="M92 116c5 5 11 5 16 0" className="stroke-primary-foreground" strokeWidth="3.5" strokeLinecap="round" />
      </g>
      {/* the count dot */}
      <circle cx="136" cy="60" r="13" className="fill-destructive stroke-card" strokeWidth="4" />
      <path d="M136 54v12" className="stroke-destructive-foreground" strokeWidth="3.5" strokeLinecap="round" />
      {/* sparkles */}
      <path d="M44 120v12M38 126h12" className="stroke-primary/60" strokeWidth="3" strokeLinecap="round" />
      <path d="M160 40v8M156 44h8" className="stroke-primary/60" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
