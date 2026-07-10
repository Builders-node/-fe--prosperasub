import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { ProviderWorkspace } from "@/components/provider/ProviderWorkspace";
import { supabaseDb } from "@/integrations/supabase/client";

/**
 * Unified admin provider detail. Same view as the owner portal
 * (`ProviderWorkspace`) but inside the admin shell, so a super_admin manages any
 * provider — rich per-service tabs for legacy-backed providers, capability tabs
 * otherwise — from one place. Replaces the per-service admin detail pages.
 */
export default function MarketplaceProviderDetail() {
  const { providerId } = useParams<{ providerId: string }>();

  // Slim query just for the header — ProviderWorkspace fetches its own copy.
  const { data: provider } = useQuery({
    queryKey: ["admin-provider-header", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers").select("name, description")
        .eq("id", providerId!).maybeSingle();
      if (error) throw error;
      return data as { name: string; description: string | null } | null;
    },
  });

  return (
    <SuperAdminLayout
      title={provider?.name || "Provider"}
      subtitle={provider?.description || "Manage this business — plans, subscriptions, staff, and everything under one roof."}
    >
      <ProviderWorkspace providerId={providerId ?? ""} backHref="/admin/marketplace/providers" />
    </SuperAdminLayout>
  );
}
