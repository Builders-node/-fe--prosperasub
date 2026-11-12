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
  HeaderAccountSlot, HeaderIconLink, useHeaderSession, type HeaderSession,
} from "@/components/layout/HeaderParts";
import { cn } from "@/lib/utils";

interface DesktopHeaderProps {
  showBackButton?: boolean;
  onBack?: () => void;
  breadcrumb?: string;
}

/**
 * The desktop bar, on every customer page (md and up).
 *
 *   [EverySub · location]      [ search ]      [♡ · bag · bell · avatar]
 *
 * Three columns, the outer two equal (1fr | auto | 1fr), so the search sits on
 * the page's centre line whatever is on either side of it. With a plain flex
 * row it slid sideways on every page that has no location to choose — the
 * same bar, a different shape from one page to the next.
 *
 * One white panel (`--card`), like the phone's header, and no border: the
 * panel against the page is the separation (DESIGN.md — borderless). The
 * optional second row (back · breadcrumb) is part of the same panel.
 */
export function DesktopHeader({ showBackButton = false, onBack, breadcrumb }: DesktopHeaderProps) {
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

  return (
    <DesktopHeaderView
      ref={headerRef}
      session={session}
      location={<LocationSelector always />}
      search={<HeaderSearch />}
      account={<AccountMenu />}
      onLogin={() => openAuthModal("login")}
      subRow={showBackButton || breadcrumb ? (
        <DesktopSubRow
          onBack={showBackButton ? (onBack ?? (() => window.history.back())) : undefined}
          backLabel={t("common.back")}
          crumbs={breadcrumb ? [{ label: t("common.home"), href: "/" }, { label: breadcrumb }] : undefined}
        />
      ) : null}
    />
  );
}

/** The bar as a picture of its inputs — what the states sheet draws. */
interface DesktopHeaderViewProps {
  session: HeaderSession;
  location?: ReactNode;
  search?: ReactNode;
  /** What a signed-in person sees in the account slot (the menu). */
  account: ReactNode;
  onLogin: () => void;
  subRow?: ReactNode;
  sticky?: boolean;
  className?: string;
}

export const DesktopHeaderView = forwardRef<HTMLElement, DesktopHeaderViewProps>(function DesktopHeaderView(
  { session, location, search, account, onLogin, subRow, sticky = true, className },
  ref,
) {
  return (
    <header ref={ref} className={cn("hidden bg-card md:block", sticky && "sticky top-0 z-40", className)}>
      <div className="app-container grid h-16 grid-cols-[1fr_minmax(0,420px)_1fr] items-center gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            className="shrink-0 text-[20px] font-black tracking-tight text-primary transition-opacity hover:opacity-80"
          >
            EverySub
          </Link>
          {location}
        </div>

        <div className="flex min-w-0 justify-center">{search}</div>

        <div className="flex items-center justify-end gap-1">
          <HeaderIconLink to="/favorites" label="Favourites" icon={FavoriteIcon} count={session.favorites} />
          <HeaderIconLink to="/cart" label="Cart" icon={ShoppingBagIcon} count={session.cart} />
          {session.status === "signedIn" && (
            <HeaderIconLink to="/notifications" label="Notifications" icon={NotificationsIcon} count={session.unread} />
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
