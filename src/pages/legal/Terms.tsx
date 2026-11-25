import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { tr } from "@/lib/tr";

/**
 * Terms of Service. Written from how the platform actually works (marketplace
 * of independent businesses, prepaid periods, Bitcoin / PayPal, a commission
 * the platform keeps). A draft for legal review — the operator's legal name
 * and the governing law are the owner's to confirm.
 */
const SECTIONS: LegalSection[] = [
  {
    title: tr("What EverySub is"),
    body: [
      tr("EverySub is a marketplace for services in Roatán, Honduras. Independent local businesses (\"providers\") offer subscriptions, bookings, rentals and one-time purchases — meals, cleaning, memberships, vehicles and more — and you buy them through EverySub."),
      tr("Each service is delivered by the provider that offers it. EverySub runs the platform: the listings, accounts, checkout, payments, scheduling and support. Some services are operated by EverySub itself; the listing says so."),
    ],
  },
  {
    title: tr("Your account"),
    body: [
      tr("You can sign in with email and password, with Google, or with a Bitcoin Lightning wallet. Keep your sign-in details to yourself — you are responsible for what is done with your account."),
      tr("Give us accurate details, especially your name, phone or WhatsApp and the address where a service is delivered. A provider cannot clean, deliver or hand over a vehicle at an address that is wrong."),
      tr("You must be at least 18 years old, or have a parent or guardian agree to these terms for you."),
    ],
  },
  {
    title: tr("Buying a plan or a booking"),
    body: [
      tr("The listing tells you what is included, what is not, how often and for how long. The price shown at checkout is the price you pay for the period you choose."),
      tr("Subscriptions are paid in advance for the period you select (for example a week, a month or several months). A one-time purchase is paid once. Your access starts when the payment is confirmed."),
      tr("Some payment methods add a fee on top of the price to cover the processor's cost; checkout shows it before you pay."),
      tr("Vehicle rentals may require a refundable deposit, which is returned after the vehicle comes back as agreed."),
    ],
  },
  {
    title: tr("Payments"),
    body: [
      tr("We accept Bitcoin over the Lightning Network, on-chain Bitcoin and PayPal (including cards through PayPal). Methods can be switched on or off; checkout shows what is available."),
      tr("Bitcoin payments are final once confirmed on the network and cannot be reversed by us. Send the exact amount shown on the invoice before it expires; an invoice that expires unpaid is not an order."),
      tr("PayPal payments are processed by PayPal under its own terms. If you chose automatic renewal through PayPal, it renews at the end of each period until you cancel it."),
      tr("We never see or store your card number."),
    ],
  },
  {
    title: tr("Changing, pausing and cancelling"),
    body: [
      tr("You can cancel a subscription from My subscriptions. Cancelling stops the next renewal; the period you already paid for runs until its end date."),
      tr("Where a provider allows it, you can pause or reschedule visits and deliveries within the rules shown in the listing (for example, how far in advance)."),
      tr("A booked time (a court, a session, a rental) can be cancelled within the provider's cancellation window shown at booking."),
    ],
  },
  {
    title: tr("Refunds"),
    body: [
      tr("If a service was not delivered as described — a missed visit, a delivery that did not arrive — contact us within 7 days. We will work it out with the provider and, where it is fair, give you a refund, a replacement or credit on your EverySub account."),
      tr("Paid periods that were used are not refunded because you changed your mind part-way through."),
      tr("Refunds go back the way you paid where that is possible. Bitcoin refunds are sent to an address or Lightning invoice you give us, at the US dollar value of the original payment."),
    ],
  },
  {
    title: tr("Providers"),
    body: [
      tr("Providers are responsible for the services they offer: their quality, safety, licences and taxes, and the accuracy of their listing."),
      tr("EverySub keeps a commission on each sale and pays the rest to the provider. Providers agree to additional terms when they join."),
      tr("Customers that a business brings to EverySub with its own code are its clients; the platform may charge that business a different commission for them."),
    ],
  },
  {
    title: tr("Featured places and ads"),
    body: [
      tr("Places marked “Ad” or shown under Featured are paid for by the business. Paying never changes a business's reviews or ratings."),
      tr("A business may pay a fixed price for a featured week, taken from what it has earned on EverySub, or a higher commission on orders that came from a featured place. We note which place, if any, an order came from to settle that commission."),
    ],
  },
  {
    title: tr("Reviews and what you post"),
    body: [
      tr("Reviews must be honest and about your own experience. We may hide reviews that are abusive, off-topic, fake or share someone's personal details."),
      tr("You keep the rights to what you post, and you allow EverySub to show it on the platform."),
    ],
  },
  {
    title: tr("Fair use"),
    body: [
      tr("Don't misuse the platform: no fraud, no fake orders, no attempts to get around payments, no scraping, no interfering with how it runs, and no harassment of providers, their staff or other customers."),
      tr("We may suspend or close an account that breaks these rules. Paid periods for services already delivered are not refunded in that case."),
    ],
  },
  {
    title: tr("Liability"),
    body: [
      tr("We work to keep EverySub available and correct, but we can't promise it will never be interrupted or contain a mistake."),
      tr("To the extent the law allows, EverySub is not liable for indirect or consequential losses, and our total liability for any claim about an order is limited to the amount you paid for that order."),
      tr("Nothing in these terms limits rights you have under the law that cannot be limited."),
    ],
  },
  {
    title: tr("Changes to these terms"),
    body: [
      tr("We may update these terms as the platform changes. The date at the top shows the latest version. If a change is significant, we will tell you in the app or by email before it applies. Using EverySub after a change means you accept it."),
    ],
  },
];

export default function Terms() {
  return (
    <LegalPage
      title={tr("Terms of Service")}
      updated="November 7, 2026"
      intro={tr("These terms apply when you use EverySub — the website and app at everysub.net — to find, buy and manage services. By creating an account or placing an order you agree to them.")}
      sections={SECTIONS}
      path="/terms"
      other={{ label: tr("Privacy Policy"), to: "/privacy" }}
    />
  );
}
