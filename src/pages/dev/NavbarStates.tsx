import { useEffect, type ReactNode } from "react";
import { getNavigationForRoles } from "@/config/navigation";
import { DesktopHeaderView, DesktopSubRow } from "@/components/layout/DesktopHeader";
import { HomeHeaderView } from "@/components/layout/HomeHeader";
import { BottomNavView } from "@/components/layout/BottomNav";
import { HeaderSearch } from "@/components/layout/HeaderSearch";
import { HeaderAvatarButton, type HeaderSession } from "@/components/layout/HeaderParts";
import { LocationChipView, LocationRowView } from "@/components/patterns/LocationSelector";
import { cn } from "@/lib/utils";

/**
 * /dev/navbar — every state of the app's bars on one page, light and dark side
 * by side. Development builds only (see App.tsx).
 *
 * It draws the SAME view components the live bars render (DesktopHeaderView,
 * HomeHeaderView, BottomNavView), fed fixed sessions instead of the real one —
 * so a state cannot look one way here and another way on the site.
 */

const OUT: HeaderSession = { status: "signedOut", favorites: 0, cart: 0, unread: 0, initial: "F" };
const LOADING: HeaderSession = { ...OUT, status: "loading" };
const IN: HeaderSession = { status: "signedIn", favorites: 0, cart: 0, unread: 0, initial: "F" };
const IN_COUNTS: HeaderSession = { ...IN, favorites: 2, cart: 3, unread: 5 };
const IN_MANY: HeaderSession = { ...IN, favorites: 14, cart: 1, unread: 120 };
const OUT_COUNTS: HeaderSession = { ...OUT, favorites: 2, cart: 1 };

const noop = () => {};
const avatar = (s: HeaderSession) => <HeaderAvatarButton initial={s.initial} />;
const chip = (label: string | null) => <LocationChipView label={label} />;
const row = (label: string | null, className?: string) => <LocationRowView label={label} className={className} />;

function Label({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p className="mb-2 flex items-baseline gap-2 text-[13px] text-muted-foreground">
      <span className="font-mono font-semibold text-foreground">{n}</span>
      {children}
    </p>
  );
}

function DesktopState({ n, label, session, location, search, subRow, tall }: {
  n: string; label: string; session: HeaderSession; location?: ReactNode; search?: ReactNode; subRow?: ReactNode; tall?: boolean;
}) {
  return (
    <div className={cn(tall && "pb-[470px]")}>
      <Label n={n}>{label}</Label>
      <div className="overflow-visible rounded-radius-md bg-background ring-1 ring-foreground/10">
        <DesktopHeaderView
          session={session}
          location={location}
          search={search ?? <HeaderSearch />}
          account={avatar(session)}
          onLogin={noop}
          subRow={subRow}
          sticky={false}
          className="md:block"
        />
        <div className="h-6" />
      </div>
    </div>
  );
}

function Phone({ n, label, children }: { n: string; label: string; children: ReactNode }) {
  return (
    <div>
      <Label n={n}>{label}</Label>
      <div className="w-[390px] overflow-hidden rounded-[28px] bg-background ring-1 ring-foreground/10">
        {children}
      </div>
    </div>
  );
}

const PHONE = "md:!block";

function Column({ theme }: { theme: "light" | "dark" }) {
  const items = getNavigationForRoles([]);
  const signedOutItems = items.filter((i) => i.path === "/account" || !i.requiresAuth);
  const tab = (active: string, signedIn: boolean, cart: number) => (
    <BottomNavView
      items={signedIn ? items : signedOutItems}
      isActive={(i) => i.path === active}
      label={(i) => ({ "/discovery": "Home", "/my-subscriptions": "Subs", "/cart": "Cart", "/account": "Account" } as Record<string, string>)[i.path] ?? i.path}
      cart={cart}
      signedIn={signedIn}
      fixed={false}
      className={PHONE}
    />
  );
  const home = (s: HeaderSession, place: string | null) => (
    <HomeHeaderView variant="brand" session={s} onLogin={noop} location={row(place)} sticky={false} className={PHONE} />
  );
  const sub = (s: HeaderSession, title: string, extra?: { rightAction?: ReactNode; place?: string | null }) => (
    <HomeHeaderView
      title={title}
      showBackButton
      session={s}
      onLogin={noop}
      rightAction={extra?.rightAction}
      location={extra && "place" in extra ? row(extra.place ?? null, "py-2") : undefined}
      sticky={false}
      className={PHONE}
    />
  );

  return (
    <section className={cn(theme, "min-w-0 space-y-10 bg-background p-8 text-foreground")}>
      <h1 className="text-[32px] font-semibold tracking-tight">{theme === "light" ? "Light" : "Dark"}</h1>

      <div className="space-y-6">
        <h2 className="text-[20px] font-semibold">Desktop header</h2>
        <DesktopState n="D1" label="Signed out · page with no location" session={OUT} />
        <DesktopState n="D2" label="Signed out · saved items in the bag and favourites" session={OUT_COUNTS} location={chip(null)} />
        <DesktopState n="D3" label="Reading the session (no Log in → avatar flash)" session={LOADING} location={chip(null)} />
        <DesktopState n="D4" label="Signed in · nothing to count" session={IN} location={chip(null)} />
        <DesktopState n="D5" label="Signed in · counts · location chosen" session={IN_COUNTS} location={chip("Prospera Village")} />
        <DesktopState n="D6" label="Signed in · 99+ unread" session={IN_MANY} location={chip("Pristine Bay")} />
        <DesktopState
          n="D7"
          label="Account page · back + breadcrumb row"
          session={IN}
          location={chip(null)}
          subRow={<DesktopSubRow onBack={noop} crumbs={[{ label: "Home", href: "/" }, { label: "My subscriptions" }]} />}
        />
        <DesktopState n="D8" label="Searching · results drop down" session={IN} location={chip(null)} search={<HeaderSearch initialQuery="scuba" />} tall />
      </div>

      <div className="space-y-6">
        <h2 className="text-[20px] font-semibold">Phone · top bar</h2>
        <div className="grid grid-cols-3 gap-6">
          <Phone n="M1" label="Home · signed out">{home(OUT, null)}</Phone>
          <Phone n="M2" label="Home · signed in · counts">{home(IN_COUNTS, "Prospera Village")}</Phone>
          <Phone n="M3" label="Home · reading the session">{home(LOADING, null)}</Phone>
          <Phone n="M4" label="Subpage · signed out">{sub(OUT, "Cleaning", { place: null })}</Phone>
          <Phone n="M5" label="Subpage · signed in · 5 unread">{sub(IN_COUNTS, "Cleaning", { place: "Prospera Village" })}</Phone>
          <Phone n="M6" label="Detail · its own action (Share)">
            {sub(IN, "Beach Club Membership", {
              rightAction: <button type="button" className="h-10 rounded-full px-3 text-[14px] font-semibold text-foreground hover:bg-muted">Share</button>,
            })}
          </Phone>
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-[20px] font-semibold">Phone · tab bar</h2>
        <div className="grid grid-cols-3 gap-6">
          <Phone n="T1" label="Signed out (Subs hidden)">{tab("/discovery", false, 0)}</Phone>
          <Phone n="T2" label="Home · 3 in the bag">{tab("/discovery", true, 3)}</Phone>
          <Phone n="T3" label="Subs">{tab("/my-subscriptions", true, 3)}</Phone>
          <Phone n="T4" label="Cart">{tab("/cart", true, 3)}</Phone>
          <Phone n="T5" label="Account">{tab("/account", true, 0)}</Phone>
        </div>
      </div>
    </section>
  );
}

export default function NavbarStates() {
  // The page draws both themes itself; the document stays light underneath.
  useEffect(() => {
    const root = document.documentElement;
    const had = root.classList.contains("dark");
    root.classList.remove("dark");
    return () => { if (had) root.classList.add("dark"); };
  }, []);

  return (
    <div className="grid min-w-[2760px] grid-cols-2">
      <Column theme="light" />
      <Column theme="dark" />
    </div>
  );
}
