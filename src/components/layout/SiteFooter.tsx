import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "next-themes";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight, ArrowUp, Check, ChevronDown, Globe, Monitor, Moon, Sun } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AppDropdownContent, AppDropdownItem } from "@/components/ui/app-dropdown";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { useCategoryHighlights } from "@/hooks/useCategoryHighlights";
import { serviceListingHref } from "@/lib/services/serviceUrls";
import { tr, trx, LANG, LANGUAGE_STORAGE_KEY, type Lang } from "@/lib/tr";
import { langPath, splitLang } from "@/lib/seo/lang";
import { cn } from "@/lib/utils";
import { PopularLinks } from "@/components/seo/PopularLinks";
import { SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_HREF } from "@/lib/support";

/**
 * The site footer, at the foot of every browsing and account page.
 *
 * Top to bottom: a "sell on EverySub" banner, four link columns (customers,
 * businesses, services, about), then a utility row — a QR code that opens the
 * page on a phone, the theme and language pickers, WhatsApp and the
 * copyright — and a floating "back to top" button.
 *
 * Every link goes to a page that exists — services come from
 * `service_archetypes`, so a new service appears here with no code. No
 * Instagram/app-store icons: EverySub has neither, and a footer that promises
 * them would be the first broken thing a visitor finds. WhatsApp is the one
 * channel we answer on, so it is the one icon.
 *
 * Desktop only (`hidden md:block`): on a phone the tab bar is the site map.
 * Hidden with CSS, not left out, so the footer links and the "Popular" chips
 * stay in the rendered HTML that Google's phone crawler reads; raw-HTML
 * robots get the same chips from middleware.ts.
 */

const WHATSAPP_NUMBER = SUPPORT_WHATSAPP;
const WHATSAPP_HREF = SUPPORT_WHATSAPP_HREF;

type FooterLink = { label: string; to: string; external?: boolean };

const LANGUAGES: Array<{ code: Lang; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

function switchLanguage(code: Lang) {
  try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code); } catch { /* private mode */ }
  const { path } = splitLang(window.location.pathname);
  window.location.assign(`${langPath(path, code)}${window.location.search}${window.location.hash}`);
}

/** The pill a picker opens from: icon, "Label · value", chevron. */
function PickerTrigger({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenuTrigger className="inline-flex h-10 items-center gap-2 rounded-full bg-inset px-4 text-body font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
      {icon}
      {children}
      <ChevronDown className="h-4 w-4 text-muted-foreground" />
    </DropdownMenuTrigger>
  );
}

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  // next-themes knows the choice only after mount; until then show nothing
  // rather than a wrong label.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const options = [
    { value: "light", label: tr("Light"), icon: Sun },
    { value: "dark", label: tr("Dark"), icon: Moon },
    { value: "system", label: tr("As on device"), icon: Monitor },
  ];
  const current = options.find((o) => o.value === (mounted ? theme : "system")) ?? options[2];
  const Icon = current.icon;
  return (
    <DropdownMenu modal={false}>
      <PickerTrigger icon={<Icon className="h-4 w-4 text-muted-foreground" />}>
        <span><span className="text-muted-foreground">{tr("Theme")}:</span> {current.label}</span>
      </PickerTrigger>
      <AppDropdownContent side="top" align="start" sideOffset={8} className="w-60">
        {options.map((o) => (
          <AppDropdownItem
            key={o.value}
            icon={o.value === current.value ? Check : o.icon}
            title={o.label}
            active={o.value === current.value}
            onSelect={() => setTheme(o.value)}
          />
        ))}
      </AppDropdownContent>
    </DropdownMenu>
  );
}

/**
 * English | Español. The same page in the other language is a real address
 * (Spanish lives under /es), so the switch reloads onto it; the choice is
 * saved for the next visit. The hidden links below keep both addresses in the
 * HTML for crawlers, as the old pill switch did.
 */
function LanguagePicker() {
  const { path } = splitLang(typeof window === "undefined" ? "/" : window.location.pathname);
  const current = LANGUAGES.find((l) => l.code === LANG) ?? LANGUAGES[0];
  return (
    <>
      <DropdownMenu modal={false}>
        <PickerTrigger icon={<Globe className="h-4 w-4 text-muted-foreground" />}>
          <span>{current.label}</span>
        </PickerTrigger>
        <AppDropdownContent side="top" align="start" sideOffset={8} className="w-56">
          {LANGUAGES.map((l) => (
            <AppDropdownItem
              key={l.code}
              icon={l.code === LANG ? Check : Globe}
              title={l.label}
              active={l.code === LANG}
              onSelect={() => { if (l.code !== LANG) switchLanguage(l.code); }}
            />
          ))}
        </AppDropdownContent>
      </DropdownMenu>
      <nav aria-label={tr("Language")} className="sr-only">
        {LANGUAGES.map((l) => (
          <a key={l.code} href={langPath(path, l.code)} hrefLang={l.code} lang={l.code}>{l.label}</a>
        ))}
      </nav>
    </>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.23 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  );
}

function FooterLinkItem({ l }: { l: FooterLink }) {
  const cls = "text-body text-muted-foreground transition-colors hover:text-foreground";
  return l.external ? (
    <a href={l.to} target="_blank" rel="noreferrer" className={cls}>{l.label}</a>
  ) : (
    <Link to={l.to} className={cls}>{l.label}</Link>
  );
}

function Column({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div className="min-w-0">
      <p className="text-title font-semibold text-foreground">{title}</p>
      <ul className="mt-4 space-y-3">
        {links.map((l) => <li key={l.label}><FooterLinkItem l={l} /></li>)}
      </ul>
    </div>
  );
}

/** The wide "sell on EverySub" banner over the columns. */
function SellBanner() {
  return (
    <Link
      to="/for-business"
      className="group relative block overflow-hidden rounded-radius-lg bg-[#2a0f02] text-white"
    >
      <img
        src="/for-business/cta.jpg"
        alt=""
        aria-hidden
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover object-left"
      />
      <div className="relative flex flex-col gap-5 p-6 md:ml-[47%] md:flex-row md:items-center md:justify-between md:gap-8 md:px-10 md:py-9">
        <div className="max-w-xl">
          <p className="text-meta font-semibold uppercase tracking-wide text-white/70">{tr("For businesses on Roatán")}</p>
          <p className="mt-2 text-[1.5rem] font-bold leading-tight md:text-[2rem]">{tr("Sell your services as subscriptions")}</p>
          <p className="mt-2 text-body text-white/80">{tr("Customers pay up front, you withdraw in Bitcoin whenever you want.")}</p>
        </div>
        <span className="inline-flex h-12 shrink-0 items-center justify-center gap-2 self-start rounded-full bg-primary px-6 text-title font-semibold text-primary-foreground transition-colors group-hover:bg-[hsl(var(--brand-accent-hover))] md:self-auto">
          {tr("Start selling")}
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

/** A round button that floats in once the visitor has scrolled a screen down. */
function BackToTop() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > window.innerHeight);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button
      type="button"
      aria-label={tr("Back to top")}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={cn(
        "fixed bottom-24 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-card text-foreground shadow-figma ring-1 ring-border transition-all hover:bg-inset md:bottom-8 md:right-8",
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}

/** "Open on your phone": a QR code of the page being looked at. */
function PhoneQr() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => setUrl(window.location.href), []);
  return (
    <div className="hidden items-center gap-4 md:flex">
      <div className="rounded-radius-lg bg-white p-2">
        {url ? <QRCodeSVG value={url} size={84} level="M" /> : <div className="h-[84px] w-[84px]" />}
      </div>
      <p className="max-w-[12rem] text-meta text-muted-foreground">{tr("Scan the QR code to open this page on your phone")}</p>
    </div>
  );
}

export function SiteFooter({ sellBanner = true }: {
  /** The "sell on EverySub" banner; off on the for-business page itself. */
  sellBanner?: boolean;
} = {}) {
  const { archetypes } = useServiceArchetypes(true);
  const { highlights, isLoading } = useCategoryHighlights();
  // A service with nothing on sale is a link to an empty page — "Healthcare"
  // led there. Shown once something under it has a price.
  const selling = new Set(highlights.filter((h) => h.fromCents !== null).map((h) => h.archetype?.key));

  const services: FooterLink[] = [
    ...archetypes.filter((a) => isLoading || selling.has(a.key)).map((a) => ({ label: a.label, to: serviceListingHref(a.key) })),
    { label: tr("Vehicles"), to: "/vehicles" },
    { label: tr("Collections"), to: "/collections" },
    { label: tr("Guides to Roatán"), to: "/guides" },
  ];

  return (
    <footer className="mt-space-8 hidden bg-card md:block">
      {/* Page-aware link chips — popular businesses, plans, services (SEO). */}
      <PopularLinks />
      {sellBanner && (
        <div className="app-container pt-6 md:pt-8">
          <SellBanner />
        </div>
      )}

      <div className="app-container grid grid-cols-4 gap-8 py-10">
        <Column title={tr("For customers")} links={[
          { label: tr("How it works"), to: "/how-it-works" },
          { label: tr("Support"), to: "/support" },
          { label: tr("Pay with Bitcoin"), to: "/pay-with-bitcoin" },
          { label: tr("My subscriptions"), to: "/my-subscriptions" },
          { label: tr("Order history"), to: "/history" },
          { label: tr("My account"), to: "/account" },
          { label: tr("Cart"), to: "/cart" },
        ]} />
        <Column title={tr("For businesses")} links={[
          { label: tr("Sell on EverySub"), to: "/for-business" },
          { label: tr("Become a provider"), to: "/become-a-provider" },
          { label: tr("My business"), to: "/my-business" },
          { label: tr("Talk to us on WhatsApp"), to: WHATSAPP_HREF, external: true },
        ]} />
        <Column title={tr("Services")} links={services} />
        <Column title={tr("About EverySub")} links={[
          { label: tr("About us"), to: "/about" },
          { label: tr("Search"), to: "/search" },
          { label: tr("Terms of Service"), to: "/terms" },
          { label: tr("Privacy Policy"), to: "/privacy" },
        ]} />
      </div>

      <div className="border-t border-border">
        <div className="app-container flex flex-col gap-6 py-6 md:flex-row md:items-center md:justify-between md:gap-8">
          <PhoneQr />
          <div className="flex flex-wrap items-center gap-3">
            <ThemePicker />
            <LanguagePicker />
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <a
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-body font-semibold text-foreground transition-colors hover:text-primary"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-inset">
                <WhatsAppIcon className="h-5 w-5" />
              </span>
              {trx("WhatsApp {WHATSAPP_NUMBER}", { WHATSAPP_NUMBER })}
            </a>
            <p className="text-meta text-muted-foreground">{trx("© EverySub, {getFullYear} · Roatán, Honduras", { getFullYear: new Date().getFullYear() })}</p>
          </div>
        </div>
      </div>

      <BackToTop />
    </footer>
  );
}

/**
 * What EverySub is, in plain words, at the foot of the home page — for a
 * visitor who scrolled past every tile, and for search engines. The first
 * paragraph is always visible; "Read more" opens the rest in place.
 *
 * The whole text is ALWAYS in the DOM and only hidden with CSS while closed:
 * a crawler that does not click still reads every section. Claims here must
 * stay true of the product (no prices, no commission figures, no areas a
 * business has not drawn) — the plan page is where the specifics live.
 */
const P = "mt-3 max-w-4xl text-body text-muted-foreground";
const H = "mt-8 text-title font-semibold text-foreground";
const A = "font-semibold text-foreground underline-offset-4 hover:underline";

export function AboutEverySub() {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-space-8 hidden md:block" aria-labelledby="about-everysub">
      <div className="app-container py-6">
        <h2 id="about-everysub" className="text-heading font-semibold text-foreground">{tr("EverySub — subscriptions for everyday life on Roatán")}</h2>
        <p className={P}>{tr("Meals delivered to your door every week, a cleaner on the same day each week, a beach club membership, a car for the month — EverySub puts the services you use again and again on one subscription. Pick a plan, pay for the period up front, and get it on schedule, without messaging and chasing every time.")}</p>

        <div className={open ? undefined : "hidden"}>
          <p className={P}>{tr("Every plan is run by a local business on the island. You see what is included, how often it comes and what it costs before you pay, and you manage, pause or renew it from My subscriptions. Pay with Bitcoin over Lightning or on-chain, by card, or with PayPal.")}</p>

          <h3 className={H}>{tr("What you can subscribe to on Roatán")}</h3>
          <p className={P}>
            <Link to={serviceListingHref("food")} className={A}>{tr("Meal plans and food delivery.")}</Link>{" "}{tr("Local restaurants and private chefs cook a weekly menu and bring breakfast, lunch or dinner to your home, villa or office. Choose how many meals a day and how many weeks, see this week's dishes before you order, and skip the daily question of what to eat. A meal plan suits families, people working from home, long-stay visitors without a full kitchen and anyone who would rather spend the evening on the beach than in a supermarket.")}</p>
          <p className={P}>
            <Link to={serviceListingHref("cleaning")} className={A}>{tr("House cleaning.")}</Link>{" "}{tr("A regular cleaner for apartments, houses and vacation rentals: weekly or every other week, the same team and the same time slot, booked once instead of arranged again every week. You leave access instructions once; the business sees your visits in its own calendar and you see each visit in yours. Rental owners use it for turnovers between guests.")}</p>
          <p className={P}>
            <Link to={serviceListingHref("clubs")} className={A}>{tr("Clubs and sport.")}</Link>{" "}{tr("Beach club memberships with court booking by the hour, dive courses and Divemaster training, snorkeling trips, kids' after-school programs and other activities sold by the week, the month or as a one-time course. The Bay Islands sit on the Mesoamerican Barrier Reef, one of the largest reef systems in the world, and Roatán's dive shops are a big part of island life — on EverySub you can buy a course or a package of dives the same way you buy a meal plan.")}</p>
          <p className={P}>
            <Link to={serviceListingHref("healthcare")} className={A}>{tr("Healthcare and wellbeing.")}</Link>{" "}{tr("Clinics, therapists and practitioners on the island offer visit packages and monthly plans, so regular care is paid for once and simply booked when you need it.")}</p>
          <p className={P}>
            <Link to="/vehicles" className={A}>{tr("Car rental.")}</Link>{" "}{tr("Rent a car or SUV on Roatán for a day, a week or a month. The price is worked out for the exact dates you choose, longer rentals cost less per day, and insurance and extras are shown before you pay. A monthly rental is often the simplest way for expats and long-stay visitors to get around the island between West Bay, West End, Sandy Bay, French Harbour and the east end.")}</p>

          <h3 className={H}>{tr("How a subscription works")}</h3>
          <p className={P}>{tr("1. Find a plan — browse by service, search by name, or open a business and see everything it sells. 2. Read what is included: how many visits, meals, hours or items, how often, for how long, and whether the business comes to you, delivers, or you go to it. 3. Pay for the period up front. 4. Receive it on schedule. Every active subscription is in")}{" "}<Link to="/my-subscriptions" className={A}>{tr("My subscriptions")}</Link>{tr(", with its dates, what is left, and a personal QR code you can show at the business to prove it is paid. We remind you before a plan ends, and you can renew in a tap or turn on automatic renewal.")}</p>
          <p className={P}>{tr("Some things are bought once rather than every week — a course, a session, a single item. Those are sold on the same pages and paid the same way; they simply do not repeat.")}</p>

          <h3 className={H}>{tr("Paying with Bitcoin, card or PayPal")}</h3>
          <p className={P}>{tr("Prices are in US dollars. At checkout you choose how to pay: Bitcoin over the Lightning Network (instant, scan a QR code with any Lightning wallet), Bitcoin on-chain, or PayPal, which also takes debit and credit cards. Bitcoin is widely used on Roatán, and EverySub was built so you can pay for everyday island life with it. Read more on")}{" "}<Link to="/pay-with-bitcoin" className={A}>{tr("paying with Bitcoin")}</Link>{tr(". Any payment method fee is shown before you pay, never added afterwards.")}</p>

          <h3 className={H}>{tr("Where EverySub works")}</h3>
          <p className={P}>{tr("EverySub is made for Roatán in the Bay Islands of Honduras — Próspera and Prospera Village, West Bay, West End, Sandy Bay, Coxen Hole, French Harbour, Jonesville, Oak Ridge and the rest of the island. Each business decides where it delivers or comes to, and the plan page says so before you order: choose your location at the top of the page and you see what reaches you. Times are in Honduras time, and weeks start on Monday.")}</p>

          <h3 className={H}>{tr("Who uses it")}</h3>
          <p className={P}>{tr("Residents who want their routine sorted once a month instead of every day. Expats and digital nomads who have just arrived and do not yet know who to call. Families renting a villa for the season. Property managers running several homes. Remote teams and coworking members who want lunch delivered. And visitors staying a few weeks who want the island to work like home from the first day.")}</p>

          <h3 className={H}>{tr("For businesses on Roatán")}</h3>
          <p className={P}>{tr("Restaurants, cleaners, dive shops, beach clubs, gyms, clinics, tour operators and rental companies sell on EverySub. Anything your customers buy more than once can become a plan: you set the price, what is included, how often it comes and where you serve. You get a workspace with your orders, calendar, customers, team, reviews and money; payment is taken up front; and you withdraw your earnings in Bitcoin whenever you want. A QR code at your counter lets subscribers collect what they paid for, and customers you bring yourself pay no commission.")}{" "}<Link to="/for-business" className={A}>{tr("Sell on EverySub")}</Link>{" "}{tr("or")}{" "}<Link to="/become-a-provider" className={A}>{tr("become a provider")}</Link>{" "}{tr("today.")}</p>

          <h3 className={H}>{tr("Questions people ask")}</h3>
          <p className={P}>
            <span className="font-semibold text-foreground">{tr("Can I pause or cancel?")}</span>{" "}{tr("Yes — from My subscriptions. What happens to the time you already paid for depends on the plan, and the plan page says so before you buy.")}</p>
          <p className={P}>
            <span className="font-semibold text-foreground">{tr("Who provides the service?")}</span>{" "}{tr("A local, independent business. EverySub takes the order and the payment, tells the business, and keeps your history in one place; the business does the work. You can rate it after a visit or delivery, and the ratings are on its page.")}</p>
          <p className={P}>
            <span className="font-semibold text-foreground">{tr("Do I need an account?")}</span>{" "}{tr("You can browse and add plans to your cart without one; you sign in with Google or email at checkout, so your subscriptions and receipts are kept for you.")}</p>
          <p className={P}>
            <span className="font-semibold text-foreground">{tr("Something went wrong with an order?")}</span>{" "}{tr("Write to")}{" "}<Link to="/support" className={A}>{tr("support")}</Link>{" "}{tr("or message us on")}{" "}<a href={WHATSAPP_HREF} target="_blank" rel="noreferrer" className={A}>{tr("WhatsApp")}</a>{" "}{tr("— we answer from the island.")}</p>
        </div>

        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="mt-4 text-title font-semibold text-foreground transition-colors hover:text-primary"
        >
          {open ? tr("Show less") : tr("Read more")}
        </button>
      </div>
    </section>
  );
}
