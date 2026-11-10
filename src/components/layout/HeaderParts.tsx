import { forwardRef, type ComponentType, type ReactNode, type SVGProps } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useFavorites } from "@/lib/favorites/useFavorites";
import { useUnreadCount } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { HeaderBadge } from "@/components/layout/HeaderBadge";
import { HEADER_ACTION_CLASS, HEADER_ACTION_ICON_CLASS } from "@/components/layout/headerAction";

/**
 * The pieces every bar in the app is built from — desktop header, the phone's
 * home and title bars, the tab bar.
 *
 * They are VIEWS: they take what to show as props and read nothing. The live
 * bars feed them from `useHeaderSession`; the states sheet (/dev/navbar) feeds
 * them fixed values, which is how every state can be seen at once — and why a
 * state cannot look different in the sheet than it does on the site.
 */

/** What the bars need to know about the visitor, and nothing else. */
export interface HeaderSession {
  status: "loading" | "signedOut" | "signedIn";
  favorites: number;
  cart: number;
  unread: number;
  /** The avatar's letter. */
  initial: string;
}

export function useHeaderSession(): HeaderSession {
  const { isAuthenticated, isLoading, userData } = useAuth();
  const { count: cart } = useCart();
  const { count: favorites } = useFavorites();
  const { data: unread = 0 } = useUnreadCount();
  const name = userData?.name || userData?.display_name || "";
  return {
    status: isLoading ? "loading" : isAuthenticated ? "signedIn" : "signedOut",
    favorites,
    cart,
    unread: isAuthenticated ? unread : 0,
    initial: (name.trim()[0] ?? "U").toUpperCase(),
  };
}

type Glyph = ComponentType<SVGProps<SVGSVGElement>>;

/** A 40px round action with a 24px glyph and an optional count. */
export function HeaderIconLink({ to, label, icon: Icon, count = 0, tone, onClick, onPointerDown }: {
  to?: string;
  label: string;
  icon: Glyph;
  count?: number;
  /** `brand` paints the glyph orange — only the phone home's bag mark uses it. */
  tone?: "brand";
  onClick?: () => void;
  onPointerDown?: () => void;
}) {
  const aria = count > 0 ? `${label} (${count})` : label;
  const cls = cn("relative", HEADER_ACTION_CLASS, tone === "brand" && "text-primary");
  const inner = (
    <>
      <Icon className={HEADER_ACTION_ICON_CLASS} />
      <HeaderBadge count={count} />
    </>
  );
  if (to && !onClick) {
    return <Link to={to} aria-label={aria} className={cls} onPointerDown={onPointerDown}>{inner}</Link>;
  }
  return <button type="button" aria-label={aria} className={cls} onClick={onClick} onPointerDown={onPointerDown}>{inner}</button>;
}

/**
 * "Log in" — one button, wherever the account would be.
 *
 * It was three: a 36px pill with inline CTA colours on the desktop, a 16px
 * ghost text on a phone subpage, and nothing at all on the phone's home bar
 * (a bell that opened the login instead). Same height as the avatar it stands
 * in for, so signing in does not move the row.
 */
export function HeaderLoginButton({ onClick, label = "Log in" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-full bg-primary px-4 text-[14px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  );
}

/** The signed-in account: an orange 40px circle with the person's initial. */
export const HeaderAvatarButton = forwardRef<HTMLButtonElement, { initial: string; label?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ initial, label = "Account", className, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-[16px] font-black text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...rest}
    >
      {initial}
    </button>
  ),
);
HeaderAvatarButton.displayName = "HeaderAvatarButton";

/**
 * While the session is being read: a placeholder the size of the avatar, so
 * the row does not flash Log in → avatar for someone who is signed in.
 */
export function HeaderAccountSkeleton() {
  return <div aria-hidden className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />;
}

/** The account slot: skeleton, Log in, or whatever the caller renders for a signed-in person. */
export function HeaderAccountSlot({ session, onLogin, signedIn }: {
  session: HeaderSession;
  onLogin: () => void;
  signedIn: ReactNode;
}) {
  if (session.status === "loading") return <HeaderAccountSkeleton />;
  if (session.status === "signedOut") return <HeaderLoginButton onClick={onLogin} />;
  return <>{signedIn}</>;
}
