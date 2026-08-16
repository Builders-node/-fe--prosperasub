import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Store, Check, X, Mail, Phone, MapPin, Clock } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { AdminPageTabs } from "@/components/admin/AdminPageTabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabaseDb, adminApi, accountApi } from "@/integrations/supabase/client";
import { LEGACY_SERVICES, DEFAULT_CAPABILITIES, type LegacySourceKey } from "@/lib/services/providerBridge";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { SERVICES as SERVICE_REGISTRY, type ServiceKey } from "@/lib/services/registry";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/patterns/StatusPill";

type Filter = "pending" | "approved" | "rejected" | "all";

// The colour map that used to live here is gone: it printed the raw lowercase
// value ("pending") while every other list on the platform humanises it, and
// its greens and reds were a third set of shades. StatusPill owns both now —
// with context="application", so `pending` reads "Under review" rather than
// the "Awaiting payment" that word means on a subscription.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The applicant's canonical `users.id`, or null.
 *
 * Never the raw value from the application: a Google sub is not a uuid, and
 * writing one into an owner column is how approval used to fail halfway
 * through. A business whose owner cannot be resolved is still approved — it
 * simply starts platform-owned, and the admin hands it over from the Team tab
 * once the person has signed in.
 */
async function resolveOwnerUuid(userId: string | null, email: string | null): Promise<string | null> {
  if (userId && UUID_RE.test(userId)) return userId;
  if (email) {
    const { data } = await supabaseDb.from("users").select("id").eq("email", email).maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

export interface ProviderApplicationsProps {
  /** Mounted as a tab inside the service detail page — skip the page chrome. */
  embedded?: boolean;
  /** Only show applications for this service. */
  archetypeKey?: string;
}

export default function ProviderApplications({ embedded = false, archetypeKey }: ProviderApplicationsProps = {}) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [filter, setFilter] = useState<Filter>("pending");
  const [search, setSearch] = useState("");
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  const { data: apps = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-provider-applications"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_applications").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const approve = useMutation({
    mutationFn: async (app: any) => {
      // ── Idempotency guard ──
      // If a previous approve run half-completed (legacy insert ok, universal
      // insert or status update failed) an admin retry could otherwise create
      // a *second* legacy provider row. Re-read the application in this
      // transaction and refuse to insert anything if it's already approved.
      const { data: fresh } = await supabaseDb
        .from("provider_applications").select("status, created_provider_id")
        .eq("id", app.id).maybeSingle();
      if (fresh?.status === "approved" || fresh?.created_provider_id) {
        return { table: null, alreadyApproved: true } as const;
      }

      const svc = SERVICE_REGISTRY[app.service as ServiceKey];
      const table = svc?.providers?.table ?? null;
      let createdProviderId: string | null = null;

      let archetypeDefaultCaps: string[] = [];
      if (app.archetype_key) {
        const { data: a } = await supabaseDb
          .from("service_archetypes").select("default_capabilities")
          .eq("key", app.archetype_key).maybeSingle();
        const raw = (a as { default_capabilities?: unknown } | null)?.default_capabilities;
        if (Array.isArray(raw)) archetypeDefaultCaps = raw.filter((x): x is string => typeof x === "string");
      }

      // The applicant's canonical users.id, or nothing.
      //
      // This used to fall back to whatever the application carried — a Google
      // sub like "google-1009…" for anyone who signed up with Google and has
      // no `users` row yet. `food_providers.admin_user_id` is TEXT so that
      // insert went through; `providers.admin_user_id` is UUID so the next one
      // died with 22P02, leaving the application pending, `created_provider_id`
      // empty, and a legacy provider behind — which the retry then duplicated.
      const adminUserId = await resolveOwnerUuid(app.user_id, app.contact_email);
      let legacyProviderId: string | null = null;

      /**
       * Resolve a category that actually exists.
       *
       * providers.category_key is NOT NULL with an FK to service_categories,
       * and the value used here was `LEGACY_SERVICES[...].universalCategoryKey`
       * — "transport" / "food" / "home". None of those is a row in
       * service_categories, so approving ANY application failed with
       *   23503 providers_category_key_fkey
       * and a business that applied could never be let onto the platform.
       *
       * Asking the database beats another hard-coded map: that map is what
       * drifted. The registry value is still preferred when it happens to name
       * a real row, so an intentional mapping keeps working.
       */
      const resolveCategoryKey = async (): Promise<string | null> => {
        const preferred = LEGACY_SERVICES[app.service as LegacySourceKey]?.universalCategoryKey;
        if (preferred) {
          const { data } = await supabaseDb
            .from("service_categories").select("key").eq("key", preferred).maybeSingle();
          if (data?.key) return data.key as string;
        }
        if (app.archetype_key) {
          const { data } = await supabaseDb
            .from("service_categories").select("key")
            .eq("archetype_key", app.archetype_key).eq("is_active", true)
            .order("sort_order", { ascending: true }).limit(1).maybeSingle();
          if (data?.key) return data.key as string;
        }
        return null;
      };

      const categoryKey = await resolveCategoryKey();
      if (!categoryKey) {
        throw new Error(
          `No category exists for this service yet. Add one under ${app.archetype_key ?? app.service} in Marketplace → Categories, then approve again.`,
        );
      }

      /**
       * The universal row goes FIRST, and its id is stamped on the application
       * before anything else is attempted.
       *
       * The old order — legacy insert, then universal — meant a failure in the
       * second step left an orphan legacy provider that nothing pointed at, so
       * the next "Approve" made another one. Now the first thing that can fail
       * is also the first thing that is recorded: whatever happens after,
       * `created_provider_id` short-circuits the retry.
       */
      const legacyCaps = DEFAULT_CAPABILITIES[app.service as LegacySourceKey] ?? [];
      const mergedCaps = Array.from(new Set([...legacyCaps, ...archetypeDefaultCaps]));
      const { data: uRow, error: mErr } = await supabaseDb.from("providers").insert({
        category_key: categoryKey,
        name: app.business_name,
        description: app.description ?? null,
        contact_email: app.contact_email ?? null,
        contact_phone: app.contact_phone ?? null,
        status: "active",
        capabilities: mergedCaps.length ? mergedCaps : archetypeDefaultCaps,
        archetype_key: app.archetype_key ?? null,
      }).select("id").single();
      if (mErr) throw mErr;
      createdProviderId = uRow?.id as string;

      await supabaseDb.from("provider_applications")
        .update({ created_provider_id: createdProviderId, updated_at: new Date().toISOString() })
        .eq("id", app.id);

      if (table) {
        const { data, error } = await supabaseDb.from(table).insert({
          name: app.business_name,
          description: app.description ?? null,
          admin_user_id: adminUserId,
          status: "active",
        }).select("id").single();
        if (error) throw error;
        legacyProviderId = data.id as string;

        // Bridge the two id spaces — see lib/services/providerBridge.ts.
        const { error: bridgeErr } = await supabaseDb.from("providers").update({
          source_service_key: app.service,
          source_provider_id: legacyProviderId,
          updated_at: new Date().toISOString(),
        }).eq("id", createdProviderId);
        if (bridgeErr) throw bridgeErr;
      }

      /**
       * The owner is set through the API: `providers.admin_user_id` is what the
       * payout endpoint calls ownership, so the column refuses writes from the
       * browser's key. An applicant with no account yet leaves the business
       * platform-owned rather than blocking the approval.
       */
      let ownerAssigned = false;
      if (adminUserId) {
        const { error: ownerErr } = await accountApi(`/account/providers/${createdProviderId}/owner`, {
          method: "PUT",
          body: JSON.stringify({ userId: adminUserId }),
        });
        if (ownerErr) console.warn("[approve] owner assignment failed", ownerErr);
        else ownerAssigned = true;
      }

      const { error: uErr } = await supabaseDb.from("provider_applications").update({
        status: "approved",
        created_provider_id: createdProviderId,
        reviewed_by: userData?.id ?? null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", app.id);
      if (uErr) throw uErr;
      await logAuditEvent(userData!.id, "approve", "provider_application", app.id, { service: app.service, createdProviderId });

      // The provider does not bring a calendar — the platform makes one and
      // shares it with them. Deliberately not fatal: a Google outage (or a
      // deployment without Calendar credentials) must not leave a business
      // approved-but-not-created. The endpoint is idempotent, so the repair is
      // to call it again from the provider workspace.
      let calendar: { calendarId?: string | null; skipped?: string } | null = null;
      if (createdProviderId) {
        try {
          const { data } = await adminApi(`/admin/providers/${createdProviderId}/calendar/provision`, { method: "POST" });
          calendar = data ?? null;
        } catch (err) {
          console.warn("[approve] calendar provisioning failed", err);
        }
      }
      return { table, alreadyApproved: false, calendar, ownerAssigned, hasApplicant: !!adminUserId } as const;
    },
    onSuccess: (r) => {
      if (r.alreadyApproved) {
        toast.info("Already approved — refreshed list");
      } else {
        toast.success(r.table ? "Approved — provider created. They can manage it from My Business." : "Approved (no auto-provider for this service — set up manually).");
        // An applicant who has never signed in has no users row to own the
        // business. Saying so beats a workspace nobody can open.
        if (!r.ownerAssigned) {
          toast.warning(r.hasApplicant
            ? "Owner could not be assigned — set it from the business's Team tab."
            : "The applicant has no account yet — the business is platform-owned until you set an owner in its Team tab.");
        }
        if (r.calendar && !r.calendar.calendarId) {
          toast.warning("No Google calendar was created — provision it from the provider's Overview tab.");
        }
      }
      qc.invalidateQueries({ queryKey: ["admin-provider-applications"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not approve"),
  });

  const reject = useMutation({
    mutationFn: async ({ app, notes }: { app: any; notes: string }) => {
      const { error } = await supabaseDb.from("provider_applications").update({
        status: "rejected",
        review_notes: notes || null,
        reviewed_by: userData?.id ?? null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", app.id);
      if (error) throw error;
      await logAuditEvent(userData!.id, "reject", "provider_application", app.id, {});
    },
    onSuccess: () => { toast.success("Application rejected"); qc.invalidateQueries({ queryKey: ["admin-provider-applications"] }); setRejectTarget(null); setRejectNotes(""); },
    onError: (e: any) => toast.error(e?.message || "Could not reject"),
  });

  // Applications carry the archetype the applicant picked in BecomeProvider.
  // Rows written before archetype_key existed have null and only surface in the
  // unscoped list — scoping them to an arbitrary service would be a lie.
  const inScope = archetypeKey ? apps.filter((a) => a.archetype_key === archetypeKey) : apps;

  const counts = {
    pending:  inScope.filter((a) => a.status === "pending").length,
    approved: inScope.filter((a) => a.status === "approved").length,
    rejected: inScope.filter((a) => a.status === "rejected").length,
    all:      inScope.length,
  };

  const q = search.trim().toLowerCase();
  const visible = inScope
    .filter((a) => filter === "all" || a.status === filter)
    .filter((a) => !q || [a.business_name, a.contact_email, a.contact_phone, a.residence].some((v) => (v ?? "").toLowerCase().includes(q)));

  const FILTERS: { label: string; value: Filter; count: number }[] = [
    { label: "Pending",  value: "pending",  count: counts.pending  },
    { label: "Approved", value: "approved", count: counts.approved },
    { label: "Rejected", value: "rejected", count: counts.rejected },
    { label: "All",      value: "all",      count: counts.all      },
  ];

  const body = (
    <>
      <div className="space-y-5">
        {!embedded && (
          <AdminPageTabs tabs={[
            { label: "Providers", to: "/admin/marketplace/providers" },
            { label: "Applications", to: "/admin/marketplace/providers/applications", badge: counts.pending },
          ]} />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {f.label}
              <span className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                filter === f.value
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted-foreground/15 text-muted-foreground",
              )}>{f.count}</span>
            </button>
          ))}
        </div>

        <AdminListShell
          search={search} onSearch={setSearch} searchPlaceholder="Search applications…"
          isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
          isEmpty={inScope.length === 0}
          isNoResults={inScope.length > 0 && visible.length === 0} count={visible.length}
          emptyTitle="No applications yet" emptySubtitle="Provider applications will appear here."
          onClearFilters={() => { setSearch(""); setFilter("all"); }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {visible.map((a) => {
              const svc = SERVICE_REGISTRY[a.service as ServiceKey];
              const Icon = svc?.icon ?? Store;
              const serviceLabel = svc?.label ?? a.service;
              const hasProviderTable = !!svc?.providers?.table;
              const isPending = a.status === "pending";
              const isApproved = a.status === "approved";
              const isRejected = a.status === "rejected";
              return (
                <div key={a.id} className={cn(
                  "flex flex-col gap-4 rounded-2xl bg-card p-4 transition-colors",
                  isPending && "ring-1 ring-amber-500/25",
                )}>
                  {/* ── Header ── */}
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white",
                      svc?.accent ?? "bg-muted",
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-bold text-foreground">{a.business_name}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{serviceLabel}</p>
                    </div>
                    <StatusPill status={a.status} context="application" />
                  </div>

                  {/* ── Contact grid ── */}
                  <div className="grid gap-1.5 text-sm">
                    {a.contact_email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate text-foreground">{a.contact_email}</span>
                      </div>
                    )}
                    {a.contact_phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate text-foreground">{a.contact_phone}</span>
                      </div>
                    )}
                    {a.residence && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate text-foreground">{a.residence}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Applied {a.created_at ? format(new Date(a.created_at), "MMM d, yyyy") : "—"}
                        {a.reviewed_at && ` · Reviewed ${format(new Date(a.reviewed_at), "MMM d")}`}
                      </span>
                    </div>
                  </div>

                  {a.description && (
                    <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">{a.description}</p>
                  )}

                  {isRejected && a.review_notes && (
                    <p className="rounded-xl bg-red-500/10 p-3 text-xs text-red-300">
                      <span className="font-semibold">Rejection reason:</span> {a.review_notes}
                    </p>
                  )}

                  {isApproved && !hasProviderTable && (
                    <p className="text-[11px] text-muted-foreground">
                      Auto-provider skipped for this service — set up manually in Providers.
                    </p>
                  )}

                  {/* ── Actions ── */}
                  {isPending && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5 rounded-full bg-green-600 text-white hover:bg-green-600/90"
                        onClick={() => approve.mutate(a)}
                        disabled={approve.isPending}
                        loading={approve.isPending}
                        loadingText="Approving…"
                      >
                        <Check className="h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1.5 rounded-full text-red-400 hover:text-red-400"
                        onClick={() => { setRejectTarget(a); setRejectNotes(""); }}
                        disabled={reject.isPending}
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </AdminListShell>
      </div>

      {/* Reject dialog — replaces the old window.prompt */}
      <AlertDialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectNotes(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject application?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark <strong>{rejectTarget?.business_name}</strong>'s application as rejected. You can leave an optional note explaining why — it's stored on the application for the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Reason (optional)"
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reject.mutate({ app: rejectTarget, notes: rejectNotes })}
              className="bg-red-600 text-white hover:bg-red-600/90"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (embedded) return body;
  return (
    <SuperAdminLayout title="Provider applications" subtitle="Pending sign-ups from businesses that want to join a service">
      {body}
    </SuperAdminLayout>
  );
}
