import { useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { serviceListingHref } from "@/lib/services/serviceUrls";

/**
 * The desktop footer: the site map a laptop visitor scrolls down to look for.
 *
 * On a phone the tab bar does this job, so the footer is desktop-only
 * (`hidden md:block`). Every link goes to a page that exists — services come
 * from `service_archetypes`, so a new service appears here with no code. No
 * social or app-store row: EverySub has neither, and a footer that promises
 * them would be the first broken thing a visitor finds.
 *
 * Flat like the rest of the system: one card surface, no rules between the
 * columns — the columns and the space carry the structure.
 */

const WHATSAPP_NUMBER = "+504 9706-7865";
const WHATSAPP_HREF = "https://wa.me/50497067865";

type FooterLink = { label: string; to: string; external?: boolean };

function Column({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div className="min-w-0">
      <p className="text-title font-semibold text-foreground">{title}</p>
      <ul className="mt-3 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            {l.external ? (
              <a href={l.to} target="_blank" rel="noreferrer" className="text-body text-muted-foreground transition-colors hover:text-foreground">
                {l.label}
              </a>
            ) : (
              <Link to={l.to} className="text-body text-muted-foreground transition-colors hover:text-foreground">
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  const { archetypes } = useServiceArchetypes(true);

  const services: FooterLink[] = [
    ...archetypes.map((a) => ({ label: a.label, to: serviceListingHref(a.key) })),
    { label: "Vehicles", to: "/vehicles" },
  ];

  return (
    <footer className="mt-space-8 hidden bg-card md:block">
      <div className="app-container grid grid-cols-4 gap-8 py-10">
        <Column title="EverySub" links={[
          { label: "Home", to: "/discovery" },
          { label: "Search", to: "/search" },
          { label: "Cart", to: "/cart" },
          { label: "My subscriptions", to: "/my-subscriptions" },
        ]} />
        <Column title="Services" links={services} />
        <Column title="For businesses" links={[
          { label: "Sell on EverySub", to: "/for-business" },
          { label: "Become a provider", to: "/become-a-provider" },
          { label: "My business", to: "/my-business" },
          { label: "Talk to us on WhatsApp", to: WHATSAPP_HREF, external: true },
        ]} />
        <Column title="Help" links={[
          { label: "How it works", to: "/how-it-works" },
          { label: "Pay with Bitcoin", to: "/pay-with-bitcoin" },
          { label: "About EverySub", to: "/about" },
          { label: "Support", to: "/support" },
          { label: "My account", to: "/account" },
          { label: "Order history", to: "/history" },
          { label: "Terms of Service", to: "/terms" },
          { label: "Privacy Policy", to: "/privacy" },
        ]} />
      </div>

      <div className="app-container flex items-end justify-between gap-8 pb-10">
        <div>
          <p className="text-meta text-muted-foreground">Questions about an order or a business</p>
          <a
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-2 text-title font-semibold text-foreground transition-colors hover:text-primary"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-inset">
              <MessageCircle className="h-4 w-4" />
            </span>
            WhatsApp {WHATSAPP_NUMBER}
          </a>
        </div>
        <p className="text-meta text-muted-foreground">
          Pay with Bitcoin, by card or PayPal
        </p>
      </div>

      <div className="bg-inset">
        <div className="app-container py-4">
          <p className="text-meta text-muted-foreground">© EverySub, {new Date().getFullYear()} · Roatán, Honduras</p>
        </div>
      </div>
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
        <h2 id="about-everysub" className="text-heading font-semibold text-foreground">
          EverySub — subscriptions for everyday life on Roatán
        </h2>
        <p className={P}>
          Meals delivered to your door every week, a cleaner on the same day each week, a beach club
          membership, a car for the month — EverySub puts the services you use again and again on one
          subscription. Pick a plan, pay for the period up front, and get it on schedule, without
          messaging and chasing every time.
        </p>

        <div className={open ? undefined : "hidden"}>
          <p className={P}>
            Every plan is run by a local business on the island. You see what is included, how often
            it comes and what it costs before you pay, and you manage, pause or renew it from My
            subscriptions. Pay with Bitcoin over Lightning or on-chain, by card, or with PayPal.
          </p>

          <h3 className={H}>What you can subscribe to on Roatán</h3>
          <p className={P}>
            <Link to={serviceListingHref("food")} className={A}>Meal plans and food delivery.</Link>{" "}
            Local restaurants and private chefs cook a weekly menu and bring breakfast, lunch or dinner
            to your home, villa or office. Choose how many meals a day and how many weeks, see this
            week's dishes before you order, and skip the daily question of what to eat. A meal plan
            suits families, people working from home, long-stay visitors without a full kitchen and
            anyone who would rather spend the evening on the beach than in a supermarket.
          </p>
          <p className={P}>
            <Link to={serviceListingHref("cleaning")} className={A}>House cleaning.</Link>{" "}
            A regular cleaner for apartments, houses and vacation rentals: weekly or every other week,
            the same team and the same time slot, booked once instead of arranged again every week.
            You leave access instructions once; the business sees your visits in its own calendar and
            you see each visit in yours. Rental owners use it for turnovers between guests.
          </p>
          <p className={P}>
            <Link to={serviceListingHref("clubs")} className={A}>Clubs and sport.</Link>{" "}
            Beach club memberships with court booking by the hour, dive courses and Divemaster
            training, snorkeling trips, kids' after-school programs and other activities sold by the
            week, the month or as a one-time course. The Bay Islands sit on the Mesoamerican Barrier
            Reef, one of the largest reef systems in the world, and Roatán's dive shops are a big part
            of island life — on EverySub you can buy a course or a package of dives the same way you
            buy a meal plan.
          </p>
          <p className={P}>
            <Link to={serviceListingHref("healthcare")} className={A}>Healthcare and wellbeing.</Link>{" "}
            Clinics, therapists and practitioners on the island offer visit packages and monthly
            plans, so regular care is paid for once and simply booked when you need it.
          </p>
          <p className={P}>
            <Link to="/vehicles" className={A}>Car rental.</Link>{" "}
            Rent a car or SUV on Roatán for a day, a week or a month. The price is worked out
            for the exact dates you choose, longer rentals cost less per day, and insurance and extras
            are shown before you pay. A monthly rental is often the simplest way for expats and
            long-stay visitors to get around the island between West Bay, West End, Sandy Bay, French
            Harbour and the east end.
          </p>

          <h3 className={H}>How a subscription works</h3>
          <p className={P}>
            1. Find a plan — browse by service, search by name, or open a business and see everything
            it sells. 2. Read what is included: how many visits, meals, hours or items, how often, for
            how long, and whether the business comes to you, delivers, or you go to it. 3. Pay for the
            period up front. 4. Receive it on schedule. Every active subscription is in{" "}
            <Link to="/my-subscriptions" className={A}>My subscriptions</Link>, with its dates, what
            is left, and a personal QR code you can show at the business to prove it is paid. We remind
            you before a plan ends, and you can renew in a tap or turn on automatic renewal.
          </p>
          <p className={P}>
            Some things are bought once rather than every week — a course, a session, a single item.
            Those are sold on the same pages and paid the same way; they simply do not repeat.
          </p>

          <h3 className={H}>Paying with Bitcoin, card or PayPal</h3>
          <p className={P}>
            Prices are in US dollars. At checkout you choose how to pay: Bitcoin over the Lightning
            Network (instant, scan a QR code with any Lightning wallet), Bitcoin on-chain, or PayPal,
            which also takes debit and credit cards. Bitcoin is widely used on Roatán, and EverySub
            was built so you can pay for everyday island life with it. Read more on{" "}
            <Link to="/pay-with-bitcoin" className={A}>paying with Bitcoin</Link>. Any payment method
            fee is shown before you pay, never added afterwards.
          </p>

          <h3 className={H}>Where EverySub works</h3>
          <p className={P}>
            EverySub is made for Roatán in the Bay Islands of Honduras — Próspera and Prospera Village,
            West Bay, West End, Sandy Bay, Coxen Hole, French Harbour, Jonesville, Oak Ridge and the
            rest of the island. Each business decides where it delivers or comes to, and the plan page
            says so before you order: choose your location at the top of the page and you see what
            reaches you. Times are in Honduras time, and weeks start on Monday.
          </p>

          <h3 className={H}>Who uses it</h3>
          <p className={P}>
            Residents who want their routine sorted once a month instead of every day. Expats and
            digital nomads who have just arrived and do not yet know who to call. Families renting a
            villa for the season. Property managers running several homes. Remote teams and coworking
            members who want lunch delivered. And visitors staying a few weeks who want the island to
            work like home from the first day.
          </p>

          <h3 className={H}>For businesses on Roatán</h3>
          <p className={P}>
            Restaurants, cleaners, dive shops, beach clubs, gyms, clinics, tour operators and rental
            companies sell on EverySub. Anything your customers buy more than once can become a plan:
            you set the price, what is included, how often it comes and where you serve. You get a
            workspace with your orders, calendar, customers, team, reviews and money; payment is taken
            up front; and you withdraw your earnings in Bitcoin whenever you want. A QR code at your
            counter lets subscribers collect what they paid for, and customers you bring yourself pay
            no commission.{" "}
            <Link to="/for-business" className={A}>Sell on EverySub</Link> or{" "}
            <Link to="/become-a-provider" className={A}>become a provider</Link> today.
          </p>

          <h3 className={H}>Questions people ask</h3>
          <p className={P}>
            <span className="font-semibold text-foreground">Can I pause or cancel?</span> Yes — from My
            subscriptions. What happens to the time you already paid for depends on the plan, and the
            plan page says so before you buy.
          </p>
          <p className={P}>
            <span className="font-semibold text-foreground">Who provides the service?</span> A local,
            independent business. EverySub takes the order and the payment, tells the business, and
            keeps your history in one place; the business does the work. You can rate it after a visit
            or delivery, and the ratings are on its page.
          </p>
          <p className={P}>
            <span className="font-semibold text-foreground">Do I need an account?</span> You can browse
            and add plans to your cart without one; you sign in with Google or email at checkout, so
            your subscriptions and receipts are kept for you.
          </p>
          <p className={P}>
            <span className="font-semibold text-foreground">Something went wrong with an order?</span>{" "}
            Write to <Link to="/support" className={A}>support</Link> or message us on{" "}
            <a href={WHATSAPP_HREF} target="_blank" rel="noreferrer" className={A}>WhatsApp</a>{" "}
            — we answer from the island.
          </p>
        </div>

        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="mt-4 text-title font-semibold text-foreground transition-colors hover:text-primary"
        >
          {open ? "Show less" : "Read more"}
        </button>
      </div>
    </section>
  );
}
