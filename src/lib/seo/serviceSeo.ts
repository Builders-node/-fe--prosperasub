/**
 * What a service page says to search engines — and, word for word, to people.
 *
 * Titles name what people actually type ("meal delivery Roatan", "house
 * cleaning Roatan", "car rental Roatan") rather than the archetype's label.
 * The FAQ is drawn on the page AND sent as FAQPage JSON-LD: Google only trusts
 * structured answers that a visitor can also read, so the two must never
 * differ — which is why both the app (ServicePage, Fleet) and the robot pages
 * (middleware.ts) read this one file.
 *
 * No imports on purpose: middleware.ts bundles it at the edge.
 *
 * Keep every answer TRUE for every business in the service. Nothing about a
 * deposit, a cancellation fee or a delivery area that only one of them has.
 */
export interface ServiceSeo {
  title: string;
  description: string;
  h1: string;
  faq: Array<{ q: string; a: string }>;
}

const PAY = "Lightning, on-chain Bitcoin, or card and PayPal — all paid up front at checkout.";
const CANCEL = "Cancel any time in My subscriptions. It keeps running to the end of the period you paid for and simply won't renew — nothing more is charged.";

const SEO: Record<string, ServiceSeo> = {
  food: {
    title: "Meal plans & food delivery in Roatán",
    description: "Weekly meal plans and food delivery from Roatán kitchens — lunch and dinner brought to your door. Pay with Bitcoin, Lightning, card or PayPal.",
    h1: "Meal plans and food delivery in Roatán",
    faq: [
      { q: "How do meal plans work?", a: "Pick a restaurant and a plan — how many meals a day and for how many weeks. The kitchen cooks the week's menu and brings it to you; you can see the menu and change which meals you get in My subscriptions." },
      { q: "Do you deliver to my address?", a: "At checkout you drop a pin on the map. Before you pay you see whether that spot is covered and what delivery costs." },
      { q: "How can I pay?", a: PAY },
      { q: "Can I stop my plan?", a: CANCEL },
    ],
  },
  cleaning: {
    title: "House & apartment cleaning in Roatán",
    description: "Recurring house and apartment cleaning in Roatán, booked online — pick a plan, choose your days, pay with Bitcoin, Lightning, card or PayPal.",
    h1: "House and apartment cleaning in Roatán",
    faq: [
      { q: "How does a cleaning plan work?", a: "Choose a plan with the number of cleanings you want, pay, then pick your days and times. Each visit appears in My subscriptions." },
      { q: "Can I move a cleaning?", a: "Yes — open the visit in My subscriptions to reschedule it, or cancel it up to a day before and the cleaning goes back to your plan." },
      { q: "How can I pay?", a: PAY },
      { q: "Can I cancel?", a: CANCEL },
    ],
  },
  clubs: {
    title: "Scuba diving, gym & beach club memberships in Roatán",
    description: "Dive packages, gym and beach club memberships in Roatán from local clubs — buy online, book your sessions, pay with Bitcoin, Lightning, card or PayPal.",
    h1: "Clubs, diving and sport in Roatán",
    faq: [
      { q: "What can I buy here?", a: "Memberships and packages from Roatán clubs — dive packages, gym and beach club memberships. Each club lists exactly what its plan includes." },
      { q: "How do I get in?", a: "Your membership shows an access QR in My subscriptions; staff scan it at the door. Courts and sessions are booked from the club's calendar." },
      { q: "How can I pay?", a: PAY },
      { q: "Can I cancel a membership?", a: CANCEL },
    ],
  },
  healthcare: {
    title: "Clinics & healthcare plans in Roatán",
    description: "Healthcare plans and clinic services in Roatán — see what's included and pay online with Bitcoin, Lightning, card or PayPal.",
    h1: "Healthcare in Roatán",
    faq: [
      { q: "What is offered?", a: "Plans and services from clinics on Roatán. Each plan lists what it covers and its price before you buy." },
      { q: "How can I pay?", a: PAY },
      { q: "Can I cancel?", a: CANCEL },
    ],
  },
  vehicles: {
    title: "Car rental in Roatán — cars, jeeps & scooters",
    description: "Rent a car, jeep or scooter in Roatán from local rental companies — by the day, week or month, delivered or picked up. Pay with Bitcoin, Lightning, card or PayPal.",
    h1: "Car rental in Roatán",
    faq: [
      { q: "How is the price worked out?", a: "By the day, with weekly and monthly rates that cap it: a longer rental never costs more than the week or month price for the same days." },
      { q: "Can the car be brought to me?", a: "Where the rental company delivers, you choose the area at booking and the delivery fee is shown before you pay. Otherwise you pick it up at their office." },
      { q: "How can I pay?", a: PAY },
      { q: "Can I change or cancel a booking?", a: "An unpaid booking can be cancelled from your bookings. For a paid one, message the rental company or EverySub support." },
    ],
  },
};

/** The copy for a service key, or null when it has none (a new service uses its own label). */
export function serviceSeo(key: string | null | undefined): ServiceSeo | null {
  return (key && SEO[key]) || null;
}

/** FAQPage JSON-LD for the answers shown on the page. */
export function faqJsonLd(faq: ServiceSeo["faq"]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
