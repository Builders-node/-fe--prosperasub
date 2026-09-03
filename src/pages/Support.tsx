import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, LifeBuoy, Mail, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";

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
 */

// Same resolution as the other pages that talk to NestJS directly.
const API_URL = (import.meta.env.VITE_API_URL as string) || "https://api.prosperasub.com";

const SUPPORT_WHATSAPP = "+50488776655";
// Change alongside the mailbox itself — a support address that bounces is
// worse than none. Kept on the old domain until everysub.net mail is live.
const SUPPORT_EMAIL = "support@prosperasub.com";

export default function Support() {
  const navigate = useNavigate();
  const { userData, isAuthenticated } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Prefill from the account so a signed-in customer types the problem and
  // nothing else.
  useEffect(() => {
    setName((n) => n || userData?.name || userData?.display_name || "");
    setEmail((e) => e || userData?.email || "");
  }, [userData]);

  const valid =
    name.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(email) &&
    subject.trim().length >= 3 &&
    message.trim().length >= 10;

  const submit = async () => {
    if (!valid || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/support/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Attaches the sender's account when we have one; the endpoint
          // accepts the message either way.
          ...(isAuthenticated && localStorage.getItem("prospera_owned_session")
            ? (() => {
                try {
                  const t = JSON.parse(localStorage.getItem("prospera_owned_session")!)?.access_token;
                  return t ? { Authorization: `Bearer ${t}` } : {};
                } catch { return {}; }
              })()
            : {}),
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
          Array.isArray(body?.message) ? body.message[0] : body?.message || "Could not send your message.",
        );
      }
      setSent(true);
    } catch (e: any) {
      toast.error(e?.message || "Could not send your message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <UserLayout title="Support" showBackButton allowGuest>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 className="mb-4 h-14 w-14 text-emerald-500" />
          <h2 className="text-xl font-semibold text-foreground">Message sent</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            We&apos;ll reply to <span className="font-semibold text-foreground">{email}</span>. Most
            messages get an answer the same day.
          </p>
          <Button className="mt-6 rounded-full" onClick={() => navigate("/discovery")}>
            Back to services
          </Button>
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout title="Support" showBackButton allowGuest>
      <div className="space-y-6 pb-8">
        <div className="flex items-start gap-3 rounded-radius-md bg-card p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <LifeBuoy className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">How can we help?</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Tell us what happened and we&apos;ll get back to you by email. If it&apos;s urgent,
              WhatsApp is faster.
            </p>
          </div>
        </div>

        {/* Direct channels first — someone who needs an answer now shouldn't
            have to fill in a form to discover the phone number exists. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-radius-md bg-card p-4 transition-colors hover:bg-muted/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
              <MessageCircle className="h-5 w-5 text-emerald-500" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">WhatsApp</p>
              <p className="truncate text-caption text-muted-foreground">{SUPPORT_WHATSAPP}</p>
            </div>
          </a>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-center gap-3 rounded-radius-md bg-card p-4 transition-colors hover:bg-muted/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
              <Mail className="h-5 w-5 text-primary" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Email</p>
              <p className="truncate text-caption text-muted-foreground">{SUPPORT_EMAIL}</p>
            </div>
          </a>
        </div>

        <div className="space-y-4 rounded-radius-md bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="support-name">Your name</Label>
              <Input id="support-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria Lopez" />
            </div>
            <div>
              <Label htmlFor="support-email">Email</Label>
              <Input id="support-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
          </div>

          <div>
            <Label htmlFor="support-phone">WhatsApp <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="support-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+504 …" />
          </div>

          <div>
            <Label htmlFor="support-subject">Subject</Label>
            <Input id="support-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Cleaning didn't arrive" />
          </div>

          <div>
            <Label htmlFor="support-message">What happened?</Label>
            <Textarea
              id="support-message"
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Nobody came on Tuesday and the slot still shows as booked."
            />
            <p className="mt-1 text-caption text-muted-foreground">
              {message.trim().length < 10
                ? "A sentence or two is enough — the more detail, the faster we can fix it."
                : `${message.trim().length} characters`}
            </p>
          </div>

          <Button className="h-12 w-full rounded-radius-md" disabled={!valid || sending} onClick={submit}>
            {sending ? <Spinner size="sm" className="mr-2" /> : <Send className="mr-2 h-4 w-4" />}
            {sending ? "Sending…" : "Send message"}
          </Button>
          {!valid && (
            <p className="text-center text-caption text-muted-foreground">
              Fill in your name, email, a subject and a short description.
            </p>
          )}
        </div>
      </div>
    </UserLayout>
  );
}
