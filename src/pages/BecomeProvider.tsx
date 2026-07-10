import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Store, CheckCircle2, Clock, XCircle, Building2, Mail, MessageCircle, MapPin, FileText } from "lucide-react";
import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { SectionOverline } from "@/components/subscriptions/MySubsPrimitives";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { toast } from "sonner";
import { SERVICES as SERVICE_REGISTRY, type ServiceKey } from "@/lib/services/registry";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";

const STATUS_META: Record<string, { label: string; className: string; Icon: typeof Clock }> = {
  pending:  { label: "Under review", className: "bg-amber-500/15 text-amber-400",   Icon: Clock },
  approved: { label: "Approved",     className: "bg-green-500/15 text-green-400",   Icon: CheckCircle2 },
  rejected: { label: "Not approved", className: "bg-red-500/15 text-red-400",       Icon: XCircle },
};

export default function BecomeProvider() {
  const { userData } = useAuth();
  const { openAuthModal } = useAuthModal();
  const qc = useQueryClient();

  const { archetypes } = useServiceArchetypes(true);
  // The applicant picks a SERVICE (archetype). At submit we derive the underlying
  // `service` key expected by the approval flow: prefer the archetype's
  // `source_service_key` (legacy dispatch), fall back to `category_key` (new
  // universal-only archetypes).
  const [archetypeKey, setArchetypeKey] = useState<string>("");
  useEffect(() => {
    if (!archetypeKey && archetypes.length > 0) setArchetypeKey(archetypes[0].key);
  }, [archetypes, archetypeKey]);
  const selectedArchetype = archetypes.find((a) => a.key === archetypeKey);
  const service = selectedArchetype?.source_service_key || selectedArchetype?.category_key || "";
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [residence, setResidence] = useState("");
  const [description, setDescription] = useState("");
  // Persistent post-submit confirmation banner — the plain toast disappears
  // in 3s and users are often left wondering "did that actually go through?".
  const [justSubmitted, setJustSubmitted] = useState(false);

  const { data: myApps = [], isLoading } = useQuery({
    queryKey: ["my-provider-applications", userData?.id],
    enabled: !!userData?.id,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_applications")
        .select("*")
        .eq("user_id", userData!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!businessName.trim()) throw new Error("Business name is required");
      const { error } = await supabaseDb.from("provider_applications").insert({
        user_id: userData!.id,
        service,
        archetype_key: archetypeKey || null,
        business_name: businessName.trim(),
        contact_email: contactEmail.trim() || userData?.email || null,
        contact_phone: contactPhone.trim() || null,
        residence: residence.trim() || null,
        description: description.trim() || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Application submitted!");
      setBusinessName(""); setContactPhone(""); setResidence(""); setDescription("");
      setJustSubmitted(true);
      qc.invalidateQueries({ queryKey: ["my-provider-applications", userData?.id] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not submit"),
  });

  return (
    <UserLayout title="Become a provider">
      <div className="app-container space-y-8 py-6">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Store className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Become a provider</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Offer your service on ProsperaSub. Submit an application — once approved, you'll manage
              your listings, plans and bookings from <strong>My Business</strong>.
            </p>
          </div>
        </div>

        {!userData ? (
          <div className="rounded-2xl bg-card p-8 text-center">
            <p className="font-semibold">Sign in to apply</p>
            <p className="mt-1 text-sm text-muted-foreground">You need an account to submit a provider application.</p>
            <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Button onClick={() => openAuthModal("login", "/become-a-provider")}>Sign in</Button>
              <Button variant="outline" onClick={() => openAuthModal("signup", "/become-a-provider")}>
                Create account
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Existing applications */}
            {!isLoading && myApps.length > 0 && (
              <section className="space-y-2">
                <SectionOverline label="Your applications" count={myApps.length} />
                {myApps.map((a) => {
                  const meta = STATUS_META[a.status] ?? STATUS_META.pending;
                  const arche = a.archetype_key ? archetypes.find((x) => x.key === a.archetype_key) : undefined;
                  const svc = SERVICE_REGISTRY[a.service as ServiceKey];
                  const label = arche?.label ?? svc?.label ?? a.service;
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{a.business_name}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        {a.status === "rejected" && a.review_notes && (
                          <p className="mt-1 text-xs text-red-400">Reason: {a.review_notes}</p>
                        )}
                      </div>
                      <Badge className={`shrink-0 gap-1 rounded-full ${meta.className}`}>
                        <meta.Icon className="h-3 w-3" /> {meta.label}
                      </Badge>
                    </div>
                  );
                })}
              </section>
            )}

            {/* Persistent post-submit confirmation. Sits above the form so
                the user sees the outcome even after scrolling down. */}
            {justSubmitted && (
              <section className="rounded-2xl bg-green-500/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-foreground">Application submitted</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      We usually review within 24 hours. You'll get an email when a decision is made — track status in the list above.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setJustSubmitted(false)}
                    className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Dismiss"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              </section>
            )}

            {/* Application form */}
            <section className="rounded-2xl bg-card p-5">
              <h2 className="mb-4 font-black">New application</h2>

              <div className="mb-4 space-y-1">
                <div className="mb-2 px-1">
                  <SectionOverline label="Choose a service" />
                </div>
                {archetypes.map((a) => {
                  const Icon = a.Icon;
                  const selected = archetypeKey === a.key;
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => setArchetypeKey(a.key)}
                      aria-pressed={selected}
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-muted/40"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15">
                        <Icon className="h-6 w-6 text-primary" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold text-foreground">{a.label}</span>
                        {a.description && (
                          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{a.description}</span>
                        )}
                      </span>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${
                          selected ? "bg-foreground" : "border border-border bg-transparent"
                        }`}
                        aria-hidden
                      >
                        {selected && <CheckCircle2 className="h-5 w-5 text-background" strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-4">
                <div className="px-1">
                  <SectionOverline label="About your business" />
                </div>
                <div className="overflow-hidden rounded-3xl bg-card divide-y divide-border/40">
                  <div className="flex items-center gap-3 px-4">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <label className="block pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Business name <span className="text-destructive">*</span>
                      </label>
                      <input
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="e.g. Elias Cuisine"
                        className="w-full border-0 bg-transparent px-0 pb-3 pt-0.5 text-base text-foreground outline-none placeholder:text-muted-foreground/60"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 px-4">
                    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <label className="block pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Contact email
                      </label>
                      <input
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="example@gmail.com"
                        className="w-full border-0 bg-transparent px-0 pb-3 pt-0.5 text-base text-foreground outline-none placeholder:text-muted-foreground/60"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 px-4">
                    <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <label className="block pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        WhatsApp / phone
                      </label>
                      <input
                        type="tel"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        placeholder="+504 …"
                        className="w-full border-0 bg-transparent px-0 pb-3 pt-0.5 text-base text-foreground outline-none placeholder:text-muted-foreground/60"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 px-4">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <label className="block pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Location / residence
                      </label>
                      <input
                        value={residence}
                        onChange={(e) => setResidence(e.target.value)}
                        placeholder="Prospera Village…"
                        className="w-full border-0 bg-transparent px-0 pb-3 pt-0.5 text-base text-foreground outline-none placeholder:text-muted-foreground/60"
                      />
                    </div>
                  </div>

                  <div className="flex items-start gap-3 px-4">
                    <FileText className="mt-4 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <label className="block pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Tell us about your business
                      </label>
                      <textarea
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What you offer, experience, etc."
                        className="w-full resize-none border-0 bg-transparent px-0 pb-3 pt-0.5 text-base text-foreground outline-none placeholder:text-muted-foreground/60"
                      />
                    </div>
                  </div>
                </div>

                <Button className="w-full" size="lg" disabled={!businessName.trim() || submit.isPending} onClick={() => submit.mutate()}>
                  {submit.isPending && <Spinner size="sm" className="mr-2" />}
                  Submit application
                </Button>
              </div>
            </section>
          </>
        )}
      </div>
    </UserLayout>
  );
}
