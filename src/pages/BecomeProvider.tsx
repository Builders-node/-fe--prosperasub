import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CarFront, Check, CheckCircle2, Clock, HelpCircle, Mail, MapPin, MessageCircle, Store, XCircle } from "lucide-react";
import { toast } from "sonner";

import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useSeo } from "@/hooks/useSeo";
import { accountApi } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics/ga";
import { resolveCategoryIcon } from "@/lib/services/categoryIcons";
import { cn } from "@/lib/utils";

/**
 * /become-a-provider — the application form (Edge routes/provider-applications.ts).
 *
 * Open to guests: the form is the pitch's next step, so a wall in front of it
 * lost everyone the landing page sent here. Signing in is asked for at Submit,
 * and what was typed survives the round trip (sessionStorage).
 *
 * The applicant sees exactly one thing at a time: the form, the application
 * under review, or the approved business with the door into it.
 */

type Kind = "service" | "vehicles" | "other";
interface ArchetypeOption { key: string; label: string; description: string | null; icon: string | null }
interface Application {
  id: string; service: string; archetype_key: string | null; unit: string; business_name: string;
  contact_email: string | null; contact_phone: string | null; status: "pending" | "approved" | "rejected";
  review_notes: string | null; created_provider_id: string | null; created_at: string;
}

const DRAFT_KEY = "everysub_provider_application_draft";
const EMPTY = { kind: "" as Kind | "", archetypeKey: "", businessName: "", contactPhone: "", contactEmail: "", residence: "", description: "" };
type Draft = typeof EMPTY;

function readDraft(): Draft {
  try { return { ...EMPTY, ...JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "{}") }; } catch { return EMPTY; }
}

export default function BecomeProvider() {
  useSeo({
    title: "Apply to sell on EverySub",
    description: "Apply to put your Roatán business on EverySub — subscriptions, bookings and rentals, paid up front by Lightning, Bitcoin or PayPal. No setup or monthly fee.",
    path: "/become-a-provider",
  });
  const { userData } = useAuth();
  const { openAuthModal } = useAuthModal();
  const qc = useQueryClient();

  const [draft, setDraft] = useState<Draft>(readDraft);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  useEffect(() => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* private mode */ } }, [draft]);
  // The account's email is the default contact — editable, never silently swapped.
  useEffect(() => {
    if (userData?.email && !draft.contactEmail) set("contactEmail", userData.email);
  }, [userData?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: options = [] } = useQuery({
    queryKey: ["provider-application-options"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await accountApi("/provider-applications/options");
      return ((data as { archetypes?: ArchetypeOption[] } | null)?.archetypes ?? []);
    },
  });

  const { data: apps = [], isLoading: appsLoading } = useQuery({
    queryKey: ["my-provider-applications", userData?.id],
    enabled: !!userData?.id,
    queryFn: async () => {
      const { data, error } = await accountApi("/account/provider-applications");
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Application[];
    },
  });

  const latest = apps[0];
  const pending = apps.find((a) => a.status === "pending");
  const approved = !pending && latest?.status === "approved" ? latest : undefined;
  const rejected = !pending && latest?.status === "rejected" ? latest : undefined;

  const valid = useMemo(() => {
    const kindOk = draft.kind === "vehicles" || draft.kind === "other" || (draft.kind === "service" && !!draft.archetypeKey);
    return kindOk && draft.businessName.trim().length >= 2 && (draft.contactPhone.match(/\d/g) ?? []).length >= 7;
  }, [draft]);

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await accountApi("/account/provider-applications", {
        method: "POST",
        body: JSON.stringify({
          kind: draft.kind, archetypeKey: draft.archetypeKey || undefined,
          businessName: draft.businessName, contactPhone: draft.contactPhone, contactEmail: draft.contactEmail,
          residence: draft.residence, description: draft.description,
        }),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      trackEvent("generate_lead", { lead_type: "provider_application" });
      setDraft(EMPTY);
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      window.scrollTo({ top: 0, behavior: "smooth" });
      void qc.invalidateQueries({ queryKey: ["my-provider-applications", userData?.id] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not send the application"),
  });

  const onSubmit = () => {
    if (!userData) {
      toast.info("Create an account or sign in — your answers are kept.");
      openAuthModal("signup", "/become-a-provider");
      return;
    }
    submit.mutate();
  };

  return (
    <UserLayout title="Apply to sell" showBackButton allowGuest showBottomNav={false}>
      <div className="mx-auto w-full max-w-[640px] space-y-1 py-4">
        <section className="rounded-radius-lg bg-card p-4 md:p-6">
          <h1 className="text-heading font-semibold text-foreground">Sell on EverySub</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Tell us about your business. We reply within a day on WhatsApp or email.{" "}
            <Link to="/for-business" className="font-semibold text-foreground underline-offset-4 hover:underline">How it works</Link>
          </p>
        </section>

        {userData && appsLoading ? null : pending ? (
          <StatusCard
            icon={Clock} tone="attention" title="Your application is under review"
            text={`${pending.business_name} — we'll message you at ${pending.contact_phone ?? pending.contact_email ?? "your contact"} within a day. Nothing else to do for now.`}
          />
        ) : approved ? (
          <StatusCard
            icon={CheckCircle2} tone="positive" title={`${approved.business_name} is approved`}
            text="Your business is waiting as a draft. Add photos and your first offer, then go live."
            action={<Button asChild className="w-full sm:w-auto"><Link to="/my-business">Open my business</Link></Button>}
          />
        ) : (
          <>
            {rejected && (
              <StatusCard
                icon={XCircle} tone="negative" title={`About ${rejected.business_name}`}
                text={rejected.review_notes ? `We couldn't approve it: ${rejected.review_notes} You're welcome to apply again below.` : "We couldn't approve the last application. You're welcome to apply again below."}
              />
            )}

            {/* ─── What it sells ─── */}
            <section className="rounded-radius-lg bg-card p-4 md:p-6">
              <h2 className="text-title font-semibold text-foreground">What do you sell?</h2>
              <div role="radiogroup" aria-label="What do you sell?" className="mt-3 grid grid-cols-2 gap-2">
                {options.map((a) => (
                  <KindTile
                    key={a.key}
                    icon={resolveCategoryIcon(a.icon)}
                    label={a.label}
                    hint={a.description}
                    selected={draft.kind === "service" && draft.archetypeKey === a.key}
                    onSelect={() => setDraft((d) => ({ ...d, kind: "service", archetypeKey: a.key }))}
                  />
                ))}
                <KindTile
                  icon={CarFront} label="Vehicle rentals" hint="Cars, scooters, boats"
                  selected={draft.kind === "vehicles"}
                  onSelect={() => setDraft((d) => ({ ...d, kind: "vehicles", archetypeKey: "" }))}
                />
                <KindTile
                  icon={HelpCircle} label="Something else" hint="Tours, classes, anything — we'll find it a home"
                  selected={draft.kind === "other"}
                  onSelect={() => setDraft((d) => ({ ...d, kind: "other", archetypeKey: "" }))}
                />
              </div>
            </section>

            {/* ─── The business ─── */}
            <section className="space-y-4 rounded-radius-lg bg-card p-4 md:p-6">
              <h2 className="text-title font-semibold text-foreground">About your business</h2>
              <Input label="Business name" value={draft.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="e.g. Casa Verde Kitchen" maxLength={80} leftIcon={<Store className="h-4 w-4" />} />
              <Input label="WhatsApp" type="tel" inputMode="tel" value={draft.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} placeholder="+504 …" leftIcon={<MessageCircle className="h-4 w-4" />} />
              <Input label="Email" type="email" value={draft.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="you@business.com" leftIcon={<Mail className="h-4 w-4" />} />
              <Input label="Where are you? (optional)" value={draft.residence} onChange={(e) => set("residence", e.target.value)} placeholder="West Bay, Próspera, French Harbour…" leftIcon={<MapPin className="h-4 w-4" />} />
              <Textarea label="Tell us about it (optional)" rows={4} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="What you offer, your prices, how long you've been running" maxLength={1500} />
            </section>

            {/* ─── What happens next ─── */}
            <section className="rounded-radius-lg bg-card p-4 md:p-6">
              <h2 className="text-title font-semibold text-foreground">What happens next</h2>
              <ol className="mt-3 space-y-3">
                {[
                  ["We review it", "Usually within a day. We'll reach you on WhatsApp."],
                  ["We set you up together", "Your page, photos, offers and schedule."],
                  ["You go live", "Customers pay up front; you withdraw when you like."],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-meta font-semibold text-background">{i + 1}</span>
                    <span><span className="block text-body font-semibold text-foreground">{t}</span><span className="block text-meta text-muted-foreground">{d}</span></span>
                  </li>
                ))}
              </ol>
            </section>

            <div className="space-y-2 px-4 pt-3 md:px-0">
              <Button className="w-full" size="lg" disabled={!valid} loading={submit.isPending} onClick={onSubmit}>
                {userData ? "Send application" : "Sign in and send"}
              </Button>
              {!valid && (
                <p className="text-center text-meta text-muted-foreground">
                  Pick what you sell, and add a name and a WhatsApp number.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </UserLayout>
  );
}

function KindTile({ icon: Icon, label, hint, selected, onSelect }: {
  icon: React.ComponentType<{ className?: string }>; label: string; hint?: string | null; selected: boolean; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "relative flex min-h-[112px] flex-col items-start gap-2 rounded-radius-md p-3 text-left transition-colors",
        selected ? "bg-foreground text-background" : "bg-inset text-foreground hover:bg-muted",
      )}
    >
      <Icon className="h-6 w-6" />
      <span className="text-body font-semibold">{label}</span>
      {hint && <span className={cn("line-clamp-2 text-meta", selected ? "text-background/70" : "text-muted-foreground")}>{hint}</span>}
      {selected && (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

function StatusCard({ icon: Icon, tone, title, text, action }: {
  icon: React.ComponentType<{ className?: string }>; tone: "attention" | "positive" | "negative"; title: string; text: string; action?: React.ReactNode;
}) {
  return (
    <section className="rounded-radius-lg bg-card p-4 md:p-6">
      <div className="flex items-start gap-3">
        <span className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md",
          tone === "attention" && "bg-attention/15 text-attention",
          tone === "positive" && "bg-positive/15 text-positive",
          tone === "negative" && "bg-negative/15 text-negative",
        )}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-body text-muted-foreground">{text}</p>
          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </section>
  );
}
