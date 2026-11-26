import { useEffect, useState } from "react";
import { useSeo } from "@/hooks/useSeo";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, Mail, MessageCircle, Receipt, Send } from "lucide-react";
import { toast } from "sonner";
import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { apiUrlFor } from "@/integrations/supabase/config";
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_HREF } from "@/lib/support";
import { cn } from "@/lib/utils";
import { tr, trx } from "@/lib/tr";

/**
 * Contact support.
 *
 * One message in — an admin reads it in the panel and replies over email or
 * WhatsApp. There is no thread here on purpose: showing a conversation the
 * customer can't actually continue in-app would promise something the product
 * doesn't do.
 *
 * Reachable signed out. Someone whose payment failed or who can't log in is
 * exactly who needs to reach a human.
 *
 * Layout follows Notifications: a 720px column, a real page title on desktop,
 * cards on the page background. A form is read top to bottom; across 1440px
 * it was a row of empty boxes.
 */

type Topic = { key: string; label: string; example: string };

// A topic fills the subject (the admin panel sorts by it) and swaps the
// example under "What happened?" for one that fits.
const TOPICS: Topic[] = [
  { key: "order", label: tr("An order or delivery"), example: tr("Nobody came on Tuesday and the slot still shows as booked.") },
  { key: "payment", label: tr("A payment"), example: tr("I paid with Bitcoin an hour ago and the order still says unpaid.") },
  { key: "account", label: tr("My account"), example: tr("I can't sign in — the code never arrives by email.") },
  { key: "business", label: tr("My business"), example: tr("I'd like to add a second location to my listing.") },
  { key: "other", label: tr("Something else"), example: tr("Tell us what's going on in a sentence or two.") },
];
const TOPIC_LABELS = new Set(TOPICS.map((t) => t.label));

const ownedToken = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem("prospera_owned_session");
    const t = raw ? JSON.parse(raw)?.access_token : null;
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
};

export default function Support() {
  useSeo({ title: tr("Support"), description: tr("Questions about an order, a payment or a business on EverySub? Write to us."), path: "/support" });
  const navigate = useNavigate();
  const { userData, isAuthenticated } = useAuth();

  const [topic, setTopic] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  // Errors show only after a send attempt — an empty form isn't a mistake.
  const [tried, setTried] = useState(false);

  // Prefill from the account so a signed-in customer types the problem and
  // nothing else.
  useEffect(() => {
    setName((n) => n || userData?.name || userData?.display_name || "");
    setEmail((e) => e || userData?.email || "");
  }, [userData]);

  const errors = {
    name: name.trim().length < 2 ? tr("Tell us your name.") : null,
    email: !/\S+@\S+\.\S+/.test(email) ? tr("We reply here — check the address.") : null,
    subject: subject.trim().length < 3 ? tr("A few words, or pick a topic above.") : null,
    message: message.trim().length < 10 ? tr("A sentence or two is enough.") : null,
  };
  const valid = !Object.values(errors).some(Boolean);
  const err = (k: keyof typeof errors) => (tried ? errors[k] : null);

  const activeTopic = TOPICS.find((t) => t.key === topic);

  const pickTopic = (t: Topic) => {
    const next = topic === t.key ? null : t.key;
    setTopic(next);
    // Only replace a subject the chips wrote — never one the customer typed.
    if (!subject.trim() || TOPIC_LABELS.has(subject.trim())) setSubject(next ? t.label : "");
  };

  const submit = async () => {
    if (sending) return;
    if (!valid) {
      setTried(true);
      const first = (Object.keys(errors) as Array<keyof typeof errors>).find((k) => errors[k]);
      if (first) document.getElementById(`support-${first}`)?.focus();
      return;
    }
    setSending(true);
    try {
      const res = await fetch(apiUrlFor("/support/messages"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Attaches the sender's account when we have one; the endpoint
          // accepts the message either way.
          ...(isAuthenticated ? ownedToken() : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          subject: subject.trim(),
          message: message.trim(),
          page_url: typeof window !== "undefined" ? window.location.origin : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          Array.isArray(body?.message) ? body.message[0] : body?.message || tr("Could not send your message."),
        );
      }
      setSent(true);
    } catch (e: any) {
      toast.error(e?.message || tr("Could not send your message. Please try again."));
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <UserLayout title={tr("Support")} showBackButton allowGuest>
        <div className="app-container pb-space-8 pt-4 md:pt-8">
          <div className="mx-auto flex w-full max-w-[720px] flex-col items-center rounded-radius-lg bg-card px-6 py-14 text-center">
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-positive/15">
              <CheckCircle2 className="h-8 w-8 text-positive" />
            </span>
            <h2 className="text-xl font-semibold text-foreground">{tr("Message sent")}</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              {trx("We'll reply to {email}. Most messages get an answer the same day.", { email: <span className="font-semibold text-foreground">{email}</span> })}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button onClick={() => navigate("/discovery")}>{tr("Back to services")}</Button>
              {isAuthenticated && (
                <Button variant="secondary" onClick={() => navigate("/my-subscriptions")}>{tr("My orders")}</Button>
              )}
            </div>
          </div>
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout title={tr("Support")} showBackButton allowGuest>
      <div className="app-container pb-space-8 pt-4 md:pt-8">
        <div className="mx-auto w-full max-w-[720px] space-y-5">
          <div className="space-y-1">
            <h1 className="hidden text-[28px] font-bold tracking-tight text-foreground md:block">{tr("How can we help?")}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground md:text-body">
              {tr("Write to us and a person replies by email, usually the same day. Urgent? WhatsApp is faster.")}
            </p>
          </div>

          {/* Direct channels first — someone who needs an answer now shouldn't
              have to fill in a form to discover the phone number exists. */}
          <div className="grid gap-2 sm:grid-cols-2">
            <ContactCard
              href={SUPPORT_WHATSAPP_HREF}
              external
              icon={<MessageCircle className="h-5 w-5 text-positive" />}
              iconClass="bg-positive/15"
              title={tr("WhatsApp")}
              detail={SUPPORT_WHATSAPP}
              badge={tr("Fastest")}
            />
            <ContactCard
              href={`mailto:${SUPPORT_EMAIL}`}
              icon={<Mail className="h-5 w-5 text-primary" />}
              iconClass="bg-primary/15"
              title={tr("Email")}
              detail={SUPPORT_EMAIL}
            />
          </div>

          {/* Most "where is my order" questions are answered by the order
              itself; one tap there beats a day's wait for a reply. */}
          {isAuthenticated && (
            <Link
              to="/my-subscriptions"
              className="flex items-center gap-3 rounded-radius-lg bg-card p-4 transition-colors hover:bg-muted/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <Receipt className="h-5 w-5 text-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{tr("Check your orders first")}</p>
                <p className="text-caption text-muted-foreground">
                  {tr("Status, next delivery and receipts for everything you've booked.")}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </Link>
          )}

          <form
            noValidate
            onSubmit={(e) => { e.preventDefault(); void submit(); }}
            className="space-y-5 rounded-radius-lg bg-card p-4 md:p-6"
          >
            <div>
              <h2 className="text-lg font-semibold text-foreground">{tr("Send us a message")}</h2>
              <p className="mt-0.5 text-caption text-muted-foreground">{tr("What's it about?")}</p>
              <div role="radiogroup" aria-label={tr("Topic")} className="mt-3 flex flex-wrap gap-1.5">
                {TOPICS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="radio"
                    aria-checked={topic === t.key}
                    onClick={() => pickTopic(t)}
                    className={cn(
                      "h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors",
                      topic === t.key ? "bg-foreground text-background" : "bg-inset text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {topic === "business" && (
                <p className="mt-2 text-caption text-muted-foreground">
                  {tr("Not listed yet?")}{" "}
                  <Link to="/for-business" className="font-semibold text-primary hover:underline">{tr("See how selling on EverySub works")}</Link>.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="support-name"
                label={tr("Your name")}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                errorText={err("name")}
              />
              <Input
                id="support-email"
                label={tr("Email")}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                errorText={err("email")}
              />
            </div>

            <Input
              id="support-phone"
              label={<>{tr("WhatsApp")} <span className="font-normal text-muted-foreground">· {tr("optional")}</span></>}
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              helperText={tr("Add it if you'd rather we reply there.")}
            />

            <Input
              id="support-subject"
              label={tr("Subject")}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              errorText={err("subject")}
            />

            <div>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <Label htmlFor="support-message">{tr("What happened?")}</Label>
                {message.trim().length > 0 && (
                  <span className="text-caption tabular-nums text-muted-foreground">{message.trim().length}</span>
                )}
              </div>
              <Textarea
                id="support-message"
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                state={err("message") ? "error" : "default"}
                aria-invalid={!!err("message")}
                aria-describedby="support-message-hint"
              />
              <p
                id="support-message-hint"
                className={cn("mt-1.5 text-caption", err("message") ? "text-destructive" : "text-muted-foreground")}
              >
                {err("message") ?? tr("For example: “{example}”", { example: (activeTopic ?? TOPICS[0]).example })}
              </p>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-border/50 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-caption text-muted-foreground">
                {tr("We reply to the email above. Your account is attached if you're signed in.")}
              </p>
              <Button type="submit" size="lg" className="w-full shrink-0 sm:w-auto" loading={sending} loadingText={tr("Sending…")}>
                <Send /> {tr("Send message")}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </UserLayout>
  );
}

function ContactCard({ href, external, icon, iconClass, title, detail, badge }: {
  href: string;
  external?: boolean;
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  detail: string;
  badge?: string;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="group flex items-center gap-3 rounded-radius-lg bg-card p-4 transition-colors hover:bg-muted/40"
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", iconClass)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          {title}
          {badge && (
            <span className="rounded-full bg-positive/15 px-2 py-0.5 text-meta font-semibold uppercase tracking-wide text-positive">
              {badge}
            </span>
          )}
        </p>
        <p className="truncate text-caption text-muted-foreground">{detail}</p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}
