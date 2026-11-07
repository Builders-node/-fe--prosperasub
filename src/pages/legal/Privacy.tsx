import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

/**
 * Privacy Policy. Every item below is something the platform actually
 * collects or a service it actually uses (Supabase, Vercel, Google sign-in and
 * Calendar, Blink, PayPal, the email sender). Keep it in step with the code:
 * a new processor or a new field means a new line here. Draft for legal review.
 */
const SECTIONS: LegalSection[] = [
  {
    title: "What we collect",
    body: [
      "We collect what is needed to run your orders and your account:",
      "• Account: your name, email, password (stored only as a secure hash) or your Google or Lightning sign-in identifier.",
      "• Contact: phone, WhatsApp and Telegram, if you add them.",
      "• Where services happen: the addresses you save, and the access notes you write (gate codes, floor, doorman).",
      "• Orders: what you bought, from whom, for which dates, its status, and the visits, deliveries and bookings that come from it.",
      "• Payments: the amount, the method, and the payment reference (a Lightning payment hash, a Bitcoin transaction or a PayPal order id). We do not receive card numbers.",
      "• What you send us: reviews, ratings, tips, support messages and notification preferences.",
      "• Access checks: when your access QR code is scanned, we record the time and the result.",
      "• If you run a business on EverySub: your business profile, team members, earnings and the payout address (Lightning address or Bitcoin address) you give us.",
    ],
  },
  {
    title: "How we use it",
    body: [
      "• To deliver what you ordered: the provider sees your name, contact and the address and notes for each visit, delivery or booking.",
      "• To take and confirm payments, and to send payouts to providers.",
      "• To send you what you need to know: order confirmations, reminders before a subscription ends, schedule changes and replies to support.",
      "• To keep the platform safe: preventing fraud and abuse, and keeping an audit record of admin actions.",
      "• To improve EverySub using totals and trends (for example revenue by service), and — only if you allow it — Google Analytics (see Cookies below). We do not run ads and we do not sell your data.",
    ],
  },
  {
    title: "Who we share it with",
    body: [
      "• The provider of a service you buy — only what they need to deliver it.",
      "• Payment processors: Blink (Bitcoin and Lightning) and PayPal, for the payments you make through them.",
      "• Google, if you sign in with Google, and for the booking calendars providers use to schedule visits.",
      "• Our infrastructure: Supabase (database and storage) and Vercel (hosting), and our email delivery provider.",
      "• Google Analytics, only if you allowed it: which pages were viewed, the device and browser type, the rough location derived from your IP (shortened before storage), and anonymous events such as starting a checkout. Never your name, email, phone or address.",
      "• Authorities, when the law requires it.",
      "Each of these handles data under its own terms and only for the purpose above.",
    ],
  },
  {
    title: "Cookies and storage on your device",
    body: [
      "We keep your sign-in session, your cart, your theme (light or dark) and a few interface choices in your browser's storage so the app works between visits.",
      "Google Analytics cookies are set only after you press \"Allow\" on the analytics notice. If you press \"Decline\", nothing is loaded and we remember your choice. To change your mind, clear this site's data in your browser and choose again.",
      "We use no advertising or cross-site tracking cookies.",
    ],
  },
  {
    title: "How long we keep it",
    body: [
      "We keep your account while it is open. Order and payment records are kept as long as accounting and tax rules require, even after an account is closed. Access-check and audit records are kept for security and are deleted when no longer needed.",
    ],
  },
  {
    title: "Your choices and rights",
    body: [
      "• See and change your details in Account at any time.",
      "• Turn reminders on or off in Account → Reminders.",
      "• Ask us for a copy of your data, to correct it, or to delete your account. We will do it unless we must keep certain records by law (for example, payment records).",
      "Write to us using the contact below and we will reply within 30 days.",
    ],
  },
  {
    title: "Security",
    body: [
      "Data travels over encrypted connections, passwords are stored as hashes, and addresses and access notes are readable only by our servers and by the provider serving you. No system is perfectly secure; if a breach affects you, we will tell you.",
    ],
  },
  {
    title: "Children",
    body: [
      "EverySub is not meant for children under 13, and we do not knowingly collect their data.",
    ],
  },
  {
    title: "Changes to this policy",
    body: [
      "If we change how we use your data, we will update this page and, for significant changes, tell you in the app or by email first.",
    ],
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="November 7, 2026"
      intro="This policy explains what EverySub collects when you use everysub.net, why, who it is shared with, and what you can ask us to do with it."
      sections={SECTIONS}
      path="/privacy"
      other={{ label: "Terms of Service", to: "/terms" }}
    />
  );
}
