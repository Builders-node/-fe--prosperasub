import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { LocationSelector } from "@/components/patterns/LocationSelector";
import { useI18n } from "@/i18n";
import { prefetchRoute } from "@/lib/routeChunks";
import { cn } from "@/lib/utils";
import {
  KeyboardArrowLeftIcon, NotificationsIcon, SearchIcon, FavoriteIcon,
} from "@/components/icons/FigmaIcons";
import {
  HeaderAccountSkeleton, HeaderBonusChip, HeaderIconLink, HeaderLoginButton, useHeaderSession, type HeaderSession,
} from "@/components/layout/HeaderParts";
import { HEADER_ACTION_CLASS, HEADER_ACTION_ICON_CLASS } from "@/components/layout/headerAction";

interface HomeHeaderProps {
  title?: string;
  showBackButton?: boolean;
  onBack?: () => void;
  /**
   * The home layout from the Figma screen: the brand sits on the LEFT next to
   * the bag mark, with the location and notification icon buttons on the
   * right. Every other screen keeps the centred-title chrome, because a back
   * button plus a centred title is what a subpage is expected to look like.
   */
  variant?: "brand" | "title";
  /**
   * The title bar alone, with no rounding and no location row — for a page
   * that continues the white panel underneath it (see ListingHeader).
   */
  bare?: boolean;
  /**
   * Replaces the right-hand action on the title bar.
   *
   * A notification bell is the right thing on most subpages, but not on a page
   * whose whole purpose is one thing a person might want to send to someone
   * else. A plan puts Share there instead.
   */
  rightAction?: React.ReactNode;
  /** Drop the location row — a page that asks for its own address (the cart, a checkout). */
  noLocation?: boolean;
}

export function HomeHeader(props: HomeHeaderProps) {
  const navigate = useNavigate();
  const session = useHeaderSession();
  const { openAuthModal } = useAuthModal();
  const { t } = useI18n();
  return (
    <HomeHeaderView
      {...props}
      session={session}
      searchLabel={t("nav.search")}
      onBack={props.onBack ?? (() => navigate(-1))}
      onSearch={() => navigate("/search")}
      onLogin={() => openAuthModal("login")}
      location={props.noLocation ? undefined : <LocationSelector variant="row" className={props.variant === "brand" ? undefined : "py-2"} />}
    />
  );
}

/**
 * The phone's top bar, as a picture of its inputs — the live one above and
 * the states sheet (/dev/navbar) both draw this.
 *
 * Two shapes, one set of parts:
 *   brand  — home: bag · search · account        (64px, then the location row)
 *   title  — subpage: back · TITLE · account     (56px, then the location row)
 *
 * The right-hand slot: on home, the bell (with its unread count) when signed
 * in, "Log in" when not, a placeholder while the session loads. On a subpage,
 * only "Log in" for a visitor, or the page's own action. It used to be a bell that opened the login on home, a "Log
 * in" text on subpages, and a bell with no count anywhere on a phone.
 */
export function HomeHeaderView({
  title, showBackButton = false, onBack, variant = "title", bare = false, rightAction,
  session, searchLabel = "Search", onSearch, onLogin, location, sticky = true, className,
}: HomeHeaderProps & {
  className?: string;
  session: HeaderSession;
  searchLabel?: string;
  onSearch?: () => void;
  onLogin: () => void;
  location?: ReactNode;
  sticky?: boolean;
}) {
  const account = session.status === "loading" ? <HeaderAccountSkeleton />
    : session.status === "signedOut" ? <HeaderLoginButton onClick={onLogin} />
    : (
      <HeaderIconLink
        to="/notifications"
        label="Notifications"
        icon={NotificationsIcon}
        count={session.unread}
        onPointerDown={() => prefetchRoute("/notifications")}
      />
    );

  if (variant === "brand") {
    return (
      <header className={cn("bg-card md:hidden", sticky && "sticky top-0 z-40", className)}>
        <div className="flex h-16 items-center gap-2 px-2">
          {/* Orange, top-left, where the design puts the brand mark. It used
              to be a second door to the cart, which the tab bar already is;
              favorites had no door on a phone at all, so this is it. */}
          <HeaderIconLink
            to="/favorites"
            label="Favorites"
            icon={FavoriteIcon}
            tone="brand"
            onPointerDown={() => prefetchRoute("/favorites")}
          />

          {/* A button, not an input: typing happens on the search screen, and a
              field that quietly does nothing where you tapped it is worse than
              one that takes you somewhere. */}
          <button
            type="button"
            onClick={onSearch}
            onPointerDown={() => prefetchRoute("/search")}
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-radius-md bg-background px-3 text-left transition-colors hover:bg-muted"
          >
            <SearchIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
            <span className="truncate text-title text-muted-foreground">{searchLabel}</span>
          </button>

          {session.status === "signedIn" && <HeaderBonusChip cents={session.bonusCents} compact />}
          {account}
        </div>
        {location}
      </header>
    );
  }

  return (
    // 56px of white: two 40px slots inside 8px of padding, the title centred
    // between them. No bottom border — the white is the separation.
    <header className={cn("bg-card md:hidden", sticky && "sticky top-0 z-40", !bare && "overflow-hidden rounded-b-radius-lg", className)}>
      <div className="relative flex h-14 items-center justify-between p-2">
        <div className="h-10 min-w-10 shrink-0">
          {showBackButton && (
            <button type="button" aria-label="Back" onClick={onBack} className={HEADER_ACTION_CLASS}>
              <KeyboardArrowLeftIcon className={HEADER_ACTION_ICON_CLASS} />
            </button>
          )}
        </div>

        {/* Centred on the header, not on what is left of it — a long title has
            to stay centred whether or not there is a back button. */}
        <div className="pointer-events-none absolute inset-0 flex select-none items-center justify-center px-24">
          <span className="truncate text-title font-semibold text-foreground">{title ?? "EverySub"}</span>
        </div>

        <div className="flex h-10 min-w-10 shrink-0 items-center justify-end">
          {/* The bell lives on the home screen only. On every subpage it was a
              second, unrelated way out sitting opposite Back — the cart, a
              checkout, a listing — and read as noise on a phone. A signed-out
              visitor still gets "Log in"; a page with its own action (Share,
              Edit) passes it in. */}
          {rightAction ?? (session.status === "signedOut" ? <HeaderLoginButton onClick={onLogin} /> : null)}
        </div>
      </div>

      {/* A listing continues the white panel with its own search and location
          rows, so it takes the rounding off this one (bare). */}
      {!bare && location}
    </header>
  );
}
