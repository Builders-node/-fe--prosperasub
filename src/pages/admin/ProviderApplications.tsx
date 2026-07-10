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
import { supabaseDb } from "@/integrations/supabase/client";
import { LEGACY_SERVICES, DEFAULT_CAPABILITIES, type LegacySourceKey } from "@/lib/services/providerBridge";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { SERVICES as SERVICE_REGISTRY, type ServiceKey } from "@/lib/services/registry";
import { cn } from "@/lib/utils";

type Filter = "pending" | "approved" | "rejected" | "all";

const STATUS_COLOR: Record<string, string> = {
  pending:  "bg-amber-500/15 text-amber-400",
  approved: "bg-green-500/15 text-green-400",
  rejected: "bg-red-500/15 text-red-400",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve a possibly-Google sub to the canonical users.id UUID via email. */
async function resolveUserId(userId: string | null, email: string | null): Promise<string | null> {
  if (userId && UUID_RE.test(userId)) return userId;
  if (email) {
    const { data } = await supabaseDb.from("users").select("id").eq("email", email).maybeSingle();
    if (data?.id) return data.id as string;
  }
  return userId;
}

export default function ProviderApplications() {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [filter, setFilter] = useState<Filter>("pending");
  const [search, setSearch] = useState("");
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  const { data: apps = [], isLoading } = useQuery({
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

      if (table) {
        const adminUserId = await resolveUserId(app.user_id, app.contact_email);
        const { data, error } = await supabaseDb.from(table).insert({
          name: app.business_name,
          description: app.description ?? null,
          admin_user_id: adminUserId,
          status: "active",
        }).select("id").single();
        if (error) throw error;
        createdProviderId = data.id as string;

        const meta = LEGACY_SERVICES[app.service as LegacySourceKey];
        if (meta) {
          const legacyCaps = DEFAULT_CAPABILITIES[app.service as LegacySourceKey] ?? [];
          const mergedCaps = Array.from(new Set([...legacyCaps, ...archetypeDefaultCaps]));
          const { error: mErr } = await supabaseDb.from("providers").insert({
            category_key: meta.universalCategoryKey,
            name: app.business_name,
            description: app.description ?? null,
            contact_email: app.contact_email ?? null,
            contact_phone: app.contact_phone ?? null,
            admin_user_id: adminUserId,
            status: "active",
            capabilities: mergedCaps,
            archetype_key: app.archetype_key ?? null,
            source_service_key: app.service,
            source_provider_id: createdProviderId,
          });
          if (mErr) throw mErr;
        }
      } else {
        const adminUserId = await resolveUserId(app.user_id, app.contact_email);
        const { data, error } = await supabaseDb.from("providers").insert({
          category_key: app.service,
          name: app.business_name,
          description: app.description ?? null,
          contact_email: app.contact_email ?? null,
          contact_phone: app.contact_phone ?? null,
          admin_user_id: adminUserId,
          status: "active",
          capabilities: archetypeDefaultCaps,
          archetype_key: app.archetype_key ?? null,
        }).select("id").single();
        if (error) throw error;
        createdProviderId = data.id as string;
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
      return { table };
    },
    onSuccess: (r) => {
      toast.success(r.table ? "Approved — provider created. They can manage it from My Business." : "Approved (no auto-provider for this service — set up manually).");
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

  const counts = {
    pending:  apps.filter((a) => a.status === "pending").length,
    approved: apps.filter((a) => a.status === "approved").length,
    rejected: apps.filter((a) => a.status === "rejected").length,
    all:      apps.length,
  };

  const q = search.trim().toLowerCase();
  const visible = apps
    .filter((a) => filter === "all" || a.status === filter)
    .filter((a) => !q || [a.business_name, a.contact_email, a.contact_phone, a.residence].some((v) => (v ?? "").toLowerCase().includes(q)));

  const FILTERS: { label: string; value: Filter; count: number }[] = [
    { label: "Pending",  value: "pending",  count: counts.pending  },
    { label: "Approved", value: "approved", count: counts.approved },
    { label: "Rejected", value: "rejected", count: counts.rejected },
    { label: "All",      value: "all",      count: counts.all      },
  ];

  return (
    <SuperAdminLayout title="Provider applications" subtitle="Pending sign-ups from businesses that want to join a service">
      <div className="space-y-5">
        <AdminPageTabs tabs={[
          { label: "Providers", to: "/admin/marketplace/providers" },
          { label: "Applications", to: "/admin/marketplace/providers/applications", badge: counts.pending },
        ]} />

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
          isLoading={isLoading} isEmpty={apps.length === 0}
          isNoResults={apps.length > 0 && visible.length === 0} count={visible.length}
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
                    <span className={cn(
                      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      STATUS_COLOR[a.status] ?? "bg-muted text-muted-foreground",
                    )}>{a.status}</span>
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
    </SuperAdminLayout>
  );
}
