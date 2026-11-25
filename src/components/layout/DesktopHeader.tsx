import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/patterns/Breadcrumbs";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useI18n } from "@/i18n";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { LocationSelector } from "@/components/patterns/LocationSelector";
import { HeaderSearch } from "@/components/layout/HeaderSearch";
import { FavoriteIcon, NotificationsIcon, ShoppingBagIcon } from "@/components/icons/FigmaIcons";
import {
  HeaderAccountSlot, HeaderBonusChip, HeaderIconLink, useHeaderSession, type HeaderSession,
} from "@/components/layout/HeaderParts";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/tr";

interface DesktopHeaderProps {
  showBackButton?: boolean;
  onBack?: () => void;
  breadcrumb?: string;
}

/**
 * The desktop bar, on every customer page (md and up).
 *
 *   EverySub  [ search ··························· ]  [➤ address  ›]  ♡ bag bell (F)
 *
 * Drawn after Yandex Lavka's bar: 80px tall, the logo, then the search
 * starting right after it and taking the room, the address in an outlined box
 * on the right, then the icons. The search always starts at the same x (the
 * logo is fixed) and the address box is always there (LocationSelector
 * `always`), so the bar has one shape on every page.
 *
 * One white panel (`--card`), like the phone's header, and no border: the
 * panel against the page is the separation (DESIGN.md — borderless). The
 * optional breadcrumb is drawn below the panel, above the page content.
 */
export function DesktopHeader({ breadcrumb }: DesktopHeaderProps) {
  const session = useHeaderSession();
  const { openAuthModal } = useAuthModal();
  const { t } = useI18n();

  // The header is sticky, and so is a detail page's own bar below it. The
  // header publishes its real height (it grows with the second row) and
  // anything sticky beneath it sticks at `--desktop-header-h`.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty("--desktop-header-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--desktop-header-h");
    };
  }, []);

  // No Back row on a desktop: the browser's own back, the logo and the
  // breadcrumb do that job, and the extra band under the bar only pushed the
  // page down. A page with a breadcrumb gets it as a quiet line of text above
  // the content, outside the header panel. (showBackButton/onBack still drive
  // the phone header.)
  return (
    <>
      <DesktopHeaderView
        ref={headerRef}
        session={session}
        location={<LocationSelector always />}
        search={<HeaderSearch />}
        account={<AccountMenu />}
        bell={<NotificationsBell count={session.unread} />}
        onLogin={() => openAuthModal("login")}
      />
      {breadcrumb && (
        <div className="hidden md:app-container md:block md:pt-space-6">
          <Breadcrumbs items={[{ label: t("common.home"), href: "/" }, { label: breadcrumb }]} />
        </div>
      )}
    </>
  );
}

/** The bar as a picture of its inputs — what the states sheet draws. */
interface DesktopHeaderViewProps {
  session: HeaderSession;
  location?: ReactNode;
  search?: ReactNode;
  /** What a signed-in person sees in the account slot (the menu). */
  account: ReactNode;
  /** The live bar's bell opens a panel; the states sheet draws the plain link. */
  bell?: ReactNode;
  onLogin: () => void;
  subRow?: ReactNode;
  sticky?: boolean;
  className?: string;
}

export const DesktopHeaderView = forwardRef<HTMLElement, DesktopHeaderViewProps>(function DesktopHeaderView(
  { session, location, search, account, bell, onLogin, subRow, sticky = true, className },
  ref,
) {
  return (
    <header ref={ref} className={cn("hidden bg-card md:block", sticky && "sticky top-0 z-40", className)}>
      <div className="app-container flex h-20 items-center gap-4">
        <Link
          to="/"
          className="shrink-0 text-[24px] font-black tracking-tight text-primary transition-opacity hover:opacity-80"
        >{tr("EverySub")}</Link>

        <div className="flex min-w-0 flex-1 justify-start">
          <div className="w-full max-w-[640px]">{search}</div>
        </div>

        {location}

        <div className="flex shrink-0 items-center gap-1">
          <HeaderIconLink to="/favorites" label={tr("Favorites")} icon={FavoriteIcon} count={session.favorites} />
          <HeaderIconLink to="/cart" label={tr("Cart")} icon={ShoppingBagIcon} count={session.cart} />
          {session.status === "signedIn" && (
            bell ?? <HeaderIconLink to="/notifications" label={tr("Notifications")} icon={NotificationsIcon} count={session.unread} />
          )}
          {session.status === "signedIn" && (
            <div className="ml-2"><HeaderBonusChip cents={session.bonusCents} /></div>
          )}
          <div className="ml-2">
            <HeaderAccountSlot session={session} onLogin={onLogin} signedIn={account} />
          </div>
        </div>
      </div>
      {subRow}
    </header>
  );
});

/** Back and a breadcrumb, under the bar on account pages — same panel, no rule. */
export function DesktopSubRow({ onBack, backLabel = "Back", crumbs }: {
  onBack?: () => void;
  backLabel?: string;
  crumbs?: Array<{ label: string; href?: string }>;
}) {
  return (
    <div className="app-container flex h-12 items-center gap-3 text-[14px] text-muted-foreground">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="-ml-3 flex h-10 items-center gap-1.5 rounded-full px-3 font-semibold text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
          {backLabel}
        </button>
      )}
      {crumbs && <Breadcrumbs items={crumbs} />}
    </div>
  );
}
