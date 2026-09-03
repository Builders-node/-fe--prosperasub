import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { ServiceArchetypeDialog, type Archetype } from "@/components/admin/ServiceArchetypeDialog";
import CarRentals from "@/pages/admin/CarRentals";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { cn } from "@/lib/utils";
import ServiceCategories from "./ServiceCategories";
import MarketplaceProviders from "./MarketplaceProviders";
import MarketplacePlans from "./MarketplacePlans";
import ProviderApplications from "./ProviderApplications";

const TABS = ["categories", "providers", "plans", "applications"] as const;
type Tab = (typeof TABS)[number] | "vehicles";

const TAB_LABELS: Record<Tab, string> = {
  vehicles: "Vehicles",
  categories: "Categories",
  providers: "Providers",
  plans: "Plans",
  applications: "Applications",
};

/**
 * One service, everything about it — the second level of the drill-down IA
 * (see MarketplaceHub). Each tab mounts the existing flat admin page in
 * `embedded` mode, scoped to this archetype, so there's exactly one
 * implementation of each list.
 *
 * The tab lives in `?tab=` rather than the path so a reload, a bookmark or a
 * browser Back keeps the admin where they were.
 *
 * `:key` can be the literal `unassigned` — the bucket for rows whose
 * `archetype_key` went null when a service was deleted (the FK is ON DELETE SET
 * NULL). That bucket has no archetype row, so Categories and Applications are
 * hidden for it and only the reassignable lists show.
 */
export default function MarketplaceServiceDetail() {
  const { key = "" } = useParams<{ key: string }>();
  const [params, setParams] = useSearchParams();
  const { archetypes, isLoading } = useServiceArchetypes(false);

  const isUnassigned = key === "unassigned";
  const archetype = archetypes.find((a) => a.key === key);

  const tabs = useMemo<Tab[]>(
    // A rental company's offers are cars, so the vehicles archetype swaps its
    // Plans tab for the fleet screen — same drill-down, its own noun.
    () => (isUnassigned ? ["providers", "plans"]
      : key === "vehicles" ? ["categories", "providers", "vehicles", "applications"]
      : [...TABS]),
    [isUnassigned, key],
  );

  const requested = params.get("tab") as Tab | null;
  const tab: Tab = requested && tabs.includes(requested) ? requested : tabs[0];
  const setTab = (t: Tab) => setParams(t === tabs[0] ? {} : { tab: t }, { replace: true });

  const [editing, setEditing] = useState<Archetype | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { userData } = useAuth();

  // Surfaces what hiding/deleting would affect — the flat CRUD this page
  // replaced showed the same number next to the same actions.
  const { data: providerCount = 0 } = useQuery({
    queryKey: ["admin-archetype-provider-count", key],
    enabled: !isUnassigned,
    queryFn: async () => {
      const { count, error } = await supabaseDb
        .from("providers").select("*", { count: "exact", head: true })
        .eq("archetype_key", key);
      if (error) return 0;
      return count ?? 0;
    },
  });

  const invalidateArchetypes = () => {
    qc.invalidateQueries({ queryKey: ["service-archetypes"] });
    qc.invalidateQueries({ queryKey: ["marketplace-hub-counts"] });
  };

  const toggleActive = useMutation({
    mutationFn: async () => {
      if (!archetype) return;
      const { error } = await supabaseDb
        .from("service_archetypes").update({ is_active: !archetype.is_active }).eq("key", key);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "edit", "service_archetype", key, { is_active: !archetype.is_active });
    },
    onSuccess: invalidateArchetypes,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabaseDb.from("service_archetypes").delete().eq("key", key);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "delete", "service_archetype", key, {});
    },
    onSuccess: () => {
      toast.success("Service deleted");
      invalidateArchetypes();
      navigate("/admin/marketplace", { replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: pendingApps = 0 } = useQuery({
    queryKey: ["admin-provider-applications-pending-count", key],
    enabled: !isUnassigned,
    queryFn: async () => {
      const { count, error } = await supabaseDb
        .from("provider_applications").select("*", { count: "exact", head: true })
        .eq("status", "pending").eq("archetype_key", key);
      if (error) return 0;
      return count ?? 0;
    },
  });

  // An unknown key would otherwise render four empty lists with no explanation.
  if (!isLoading && !isUnassigned && !archetype) {
    return (
      <SuperAdminLayout title="Service not found">
        <div className="rounded-radius-md bg-card p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
          <p className="mt-3 font-bold text-foreground">No service named "{key}"</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been renamed or deleted.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/admin/marketplace">Back to Marketplace</Link>
          </Button>
        </div>
      </SuperAdminLayout>
    );
  }

  const title = isUnassigned ? "Unassigned" : (archetype?.label ?? key);
  const subtitle = isUnassigned
    ? "Providers and plans not attached to any service"
    : archetype?.description || "Categories, providers and plans in this service";

  return (
    <SuperAdminLayout title={title} subtitle={subtitle}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/marketplace">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> All services
            </Link>
          </Button>
          {archetype && (
            <>
              {!archetype.is_active && (
                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Hidden from Discovery
                </span>
              )}
              {/* Edits THIS service in place. It used to link to
                  /admin/services — the list of every service — which is the
                  opposite of what the button says and dropped you out of the
                  service you were working in. */}
              <Button
                variant="outline"
                size="sm"
                className="ml-auto rounded-full"
                onClick={() => setEditing(archetype as unknown as Archetype)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit service
              </Button>
              {/* Hide + delete used to live only on the flat /admin/services
                  CRUD; that page is retired, so its actions live here — on the
                  service they act on. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="iconSm" className="rounded-full" aria-label="Service actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => toggleActive.mutate()}>
                    {archetype.is_active
                      ? <><EyeOff className="h-4 w-4" /> Hide from Discovery</>
                      : <><Eye className="h-4 w-4" /> Show on Discovery</>}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setConfirmingDelete(true)}
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" /> Delete service
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        {/* Tab strip — same pill treatment as AdminPageTabs, but these switch a
            query param instead of navigating, so list state survives. */}
        <div className="inline-flex gap-1 rounded-full bg-muted/50 p-1">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {TAB_LABELS[t]}
              {t === "applications" && pendingApps > 0 && (
                <Badge className={cn(
                  "h-5 min-w-[20px] rounded-full px-1.5 text-[10px]",
                  tab === t ? "bg-background/20 text-background" : "bg-primary/15 text-primary",
                )}>{pendingApps}</Badge>
              )}
            </button>
          ))}
        </div>

        <ServiceArchetypeDialog
          open={editing !== null}
          onOpenChange={(v) => !v && setEditing(null)}
          archetype={editing}
          invalidateKeys={[["service-archetypes", false], ["service-archetypes", true], ["marketplace-hub-counts"]]}
        />

        <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{title}"?</AlertDialogTitle>
              <AlertDialogDescription>
                {providerCount === 0
                  ? "No providers link to this service — safe to delete."
                  : `${providerCount} ${providerCount === 1 ? "provider currently links" : "providers currently link"} to this service. They won't be deleted — they'll move to the Unassigned bucket on the Marketplace page.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => remove.mutate()}
                className="bg-red-600 text-white hover:bg-red-600/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {tab === "categories"   && <ServiceCategories     embedded archetypeKey={key} />}
        {tab === "providers"    && <MarketplaceProviders  embedded archetypeKey={isUnassigned ? "unassigned" : key} />}
        {tab === "plans"        && <MarketplacePlans      embedded archetypeKey={key} />}
        {tab === "vehicles"     && <CarRentals            embedded />}
        {tab === "applications" && <ProviderApplications  embedded archetypeKey={key} />}
      </div>
    </SuperAdminLayout>
  );
}
