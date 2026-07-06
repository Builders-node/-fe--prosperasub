import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Store, Check, X } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabaseDb } from "@/integrations/supabase/client";
import { LEGACY_SERVICES, DEFAULT_CAPABILITIES, type LegacySourceKey } from "@/lib/services/providerBridge";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { SERVICES as SERVICE_REGISTRY, type ServiceKey } from "@/lib/services/registry";
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400",
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
  const [filter, setFilter] = useState<"pending" | "all" | "approved" | "rejected">("pending");
  const [search, setSearch] = useState("");

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

      if (table) {
        // Legacy path — service key maps to a per-service *_providers table.
        const adminUserId = await resolveUserId(app.user_id, app.contact_email);
        const { data, error } = await supabaseDb.from(table).insert({
          name: app.business_name,
          description: app.description ?? null,
          admin_user_id: adminUserId,
          status: "active",
        }).select("id").single();
        if (error) throw error;
        createdProviderId = data.id as string;

        // Also create the universal `providers` mirror so the provider shows up
        // in the single /admin/marketplace/providers list and the unified
        // portal (bridged by source_service_key + source_provider_id).
        const meta = LEGACY_SERVICES[app.service as LegacySourceKey];
        if (meta) {
          const { error: mErr } = await supabaseDb.from("providers").insert({
            category_key: meta.universalCategoryKey,
            name: app.business_name,
            description: app.description ?? null,
            contact_email: app.contact_email ?? null,
            contact_phone: app.contact_phone ?? null,
            admin_user_id: adminUserId,
            status: "active",
            capabilities: DEFAULT_CAPABILITIES[app.service as LegacySourceKey] ?? [],
            source_service_key: app.service,
            source_provider_id: createdProviderId,
          });
          if (mErr) throw mErr;
        }
      } else {
        // New-schema path — service key is a DB category (home / activities /
        // wellness / …). Create the provider directly in the universal
        // `providers` table so no per-service scaffolding is needed to
        // onboard a brand-new domain (e.g. Activities → tennis clubs).
        const adminUserId = await resolveUserId(app.user_id, app.contact_email);
        const { data, error } = await supabaseDb.from("providers").insert({
          category_key: app.service,
          name: app.business_name,
          description: app.description ?? null,
          contact_email: app.contact_email ?? null,
          contact_phone: app.contact_phone ?? null,
          admin_user_id: adminUserId,
          status: "active",
          capabilities: [],
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
    onSuccess: () => { toast.success("Application rejected"); qc.invalidateQueries({ queryKey: ["admin-provider-applications"] }); },
    onError: (e: any) => toast.error(e?.message || "Could not reject"),
  });

  const q = search.trim().toLowerCase();
  const visible = apps
    .filter((a) => filter === "all" || a.status === filter)
    .filter((a) => !q || [a.business_name, a.contact_email, a.contact_phone, a.residence].some((v) => (v ?? "").toLowerCase().includes(q)));
  const pendingCount = apps.filter((a) => a.status === "pending").length;

  return (
    <SuperAdminLayout title="Provider Applications">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight"><Store className="h-6 w-6" /> Provider Applications</h1>
            <p className="mt-1 text-sm text-muted-foreground">Review requests to become a provider. Approving creates the provider and links it to the applicant.</p>
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="h-9 w-[170px] rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending{pendingCount ? ` (${pendingCount})` : ""}</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <AdminListShell
          search={search} onSearch={setSearch} searchPlaceholder="Search applications…"
          isLoading={isLoading} isEmpty={apps.length === 0}
          isNoResults={apps.length > 0 && visible.length === 0} count={visible.length}
          emptyTitle="No applications yet" emptySubtitle="Provider applications will appear here."
          onClearFilters={() => { setSearch(""); setFilter("all"); }}
        >
          <div className="space-y-3">
            {visible.map((a) => {
              const svc = SERVICE_REGISTRY[a.service as ServiceKey];
              const Icon = svc?.icon ?? Store;
              const serviceLabel = svc?.providers?.labels.singular ?? svc?.label ?? a.service;
              const hasProviderTable = !!svc?.providers?.table;
              return (
                <div key={a.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-foreground">{a.business_name}</span>
                        <Badge variant="secondary" className="rounded-full text-xs">{serviceLabel}</Badge>
                        <Badge className={`rounded-full text-xs ${STATUS_COLORS[a.status] ?? ""}`}>{a.status}</Badge>
                        {!hasProviderTable && <Badge variant="outline" className="rounded-full text-[10px]">manual setup</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[a.contact_email, a.contact_phone, a.residence].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {a.description && <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>}
                      {a.status === "rejected" && a.review_notes && <p className="mt-1 text-xs text-red-400">Reason: {a.review_notes}</p>}
                    </div>
                    {a.status === "pending" && (
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" className="gap-1.5 rounded-full bg-green-600 text-white hover:bg-green-600/90"
                          onClick={() => approve.mutate(a)} disabled={approve.isPending}>
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 rounded-full text-red-400 hover:text-red-400"
                          onClick={() => { const notes = window.prompt("Reason for rejection (optional):") ?? ""; reject.mutate({ app: a, notes }); }}
                          disabled={reject.isPending}>
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </AdminListShell>
      </div>
    </SuperAdminLayout>
  );
}
