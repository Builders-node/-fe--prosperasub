import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Store, CheckCircle2, Clock, XCircle } from "lucide-react";
import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { toast } from "sonner";
import { SERVICES as SERVICE_REGISTRY, type ServiceKey } from "@/lib/services/registry";
import { useServiceCategories } from "@/hooks/useServiceCategories";

const STATUS_META: Record<string, { label: string; className: string; Icon: typeof Clock }> = {
  pending:  { label: "Under review", className: "bg-amber-500/15 text-amber-400",   Icon: Clock },
  approved: { label: "Approved",     className: "bg-green-500/15 text-green-400",   Icon: CheckCircle2 },
  rejected: { label: "Not approved", className: "bg-red-500/15 text-red-400",       Icon: XCircle },
};

export default function BecomeProvider() {
  const { userData } = useAuth();
  const { openAuthModal } = useAuthModal();
  const qc = useQueryClient();

  const { categories } = useServiceCategories(true);
  // The selected category key — read live from the DB so admin edits in
  // /admin/categories (adding a new domain, disabling one) are picked up
  // without any code change here.
  const [service, setService] = useState<string>("");
  useEffect(() => {
    if (!service && categories.length > 0) setService(categories[0].key);
  }, [categories, service]);
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [residence, setResidence] = useState("");
  const [description, setDescription] = useState("");

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
      toast.success("Application submitted! We'll review it shortly.");
      setBusinessName(""); setContactPhone(""); setResidence(""); setDescription("");
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
            <Button className="mt-4" onClick={() => openAuthModal("login", "/become-a-provider")}>Sign in</Button>
          </div>
        ) : (
          <>
            {/* Existing applications */}
            {!isLoading && myApps.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Your applications</h2>
                {myApps.map((a) => {
                  const meta = STATUS_META[a.status] ?? STATUS_META.pending;
                  const cat = categories.find((c) => c.key === a.service);
                  const svc = SERVICE_REGISTRY[a.service as ServiceKey];
                  const label = cat?.label ?? svc?.label ?? a.service;
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

            {/* Application form */}
            <section className="rounded-2xl bg-card p-5">
              <h2 className="mb-4 font-black">New application</h2>

              <Label className="mb-2 block">Category</Label>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {categories.map((c) => {
                  const Icon = c.Icon;
                  const selected = service === c.key;
                  // Prefer a legacy `singular` label from the code registry
                  // if the DB category maps to one — otherwise fall back to
                  // the category label itself.
                  const singular = SERVICE_REGISTRY[c.key as ServiceKey]?.providers?.labels.singular;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setService(c.key)}
                      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
                        selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-sm font-semibold">{singular ?? c.label}</span>
                      <span className="text-[11px] text-muted-foreground">{c.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Business name *</Label>
                  <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Elias Cuisine" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Contact email</Label>
                    <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="example@gmail.com" />
                  </div>
                  <div>
                    <Label>WhatsApp / phone</Label>
                    <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+504 …" />
                  </div>
                </div>
                <div>
                  <Label>Location / residence</Label>
                  <Input value={residence} onChange={(e) => setResidence(e.target.value)} placeholder="Prospera Village…" />
                </div>
                <div>
                  <Label>Tell us about your business</Label>
                  <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What you offer, experience, etc." />
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
