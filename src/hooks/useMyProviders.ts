import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ServiceConfig, ProviderConfig } from "@/lib/services/registry";

export type MyProviderRole = "owner" | "manager";

export interface MyProviderRow {
  id: string;
  name: string;
  description: string | null;
  status?: string | null;
  avatar_url?: string | null;
  myRole: MyProviderRole;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generic "which providers does the current user own or manage" query,
 * driven by a service registry entry. Owned = `admin_user_id === me`;
 * managed = row in `providers.managerTable` (if the service supports staff).
 *
 * Callers can widen the row type via the generic — `useMyProviders<FoodProvider>(SERVICE_REGISTRY.food)`
 * exposes the full food_providers row shape (avatar_url, banner_url, working_hours…)
 * because the underlying `select("*")` already fetches every column.
 *
 * Adding a new marketplace service = point providerConfig at its tables and
 * this hook Just Works — no per-service copy-paste.
 */
export function useMyProviders<TRow extends MyProviderRow = MyProviderRow>(
  service: ServiceConfig & { providers: ProviderConfig },
) {
  const { userData } = useAuth();
  const userId = userData?.id;
  const email = userData?.email;
  const { table, managerTable } = service.providers;

  const query = useQuery({
    queryKey: ["my-providers", service.key, userId, email],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      // Google-login users carry a "google-xxx" sub rather than the DB users.id
      // UUID, so resolve the canonical UUID by email before matching ownership.
      let dbUserId = userId!;
      if (!UUID_RE.test(dbUserId) && email) {
        const { data } = await supabaseDb
          .from("users").select("id").eq("email", email).maybeSingle();
        if (data?.id) dbUserId = data.id;
      }

      // Owner query — every marketplace *_providers row has admin_user_id.
      const ownedP = supabaseDb.from(table)
        .select("*").eq("admin_user_id", dbUserId);

      // Manager query — only if the service exposes a manager table.
      const mgrP = managerTable
        ? supabaseDb.from(managerTable)
            .select("provider_id")
            .or(email ? `user_id.eq.${dbUserId},user_email.eq.${email}` : `user_id.eq.${dbUserId}`)
        : Promise.resolve({ data: [] as { provider_id: string }[], error: null });

      const [ownedRes, mgrRes] = await Promise.all([ownedP, mgrP]);
      if (ownedRes.error) throw ownedRes.error;
      if (mgrRes.error) throw mgrRes.error;

      const owned = (ownedRes.data ?? []) as any[];
      const ownedIds = new Set(owned.map((r) => r.id));
      const managedIds = (mgrRes.data ?? [])
        .map((m: any) => m.provider_id as string)
        .filter((pid) => pid && !ownedIds.has(pid));

      let managed: any[] = [];
      if (managedIds.length) {
        const { data, error } = await supabaseDb.from(table).select("*").in("id", managedIds);
        if (error) throw error;
        managed = (data ?? []);
      }

      const rows = [
        ...owned.map((r) => ({ ...r, myRole: "owner" as const })),
        ...managed.map((r) => ({ ...r, myRole: "manager" as const })),
      ] as TRow[];
      rows.sort((a, b) => a.name.localeCompare(b.name));
      return rows;
    },
  });

  const providers = (query.data ?? []) as TRow[];
  return { providers, isLoading: query.isLoading, hasAny: providers.length > 0 };
}
