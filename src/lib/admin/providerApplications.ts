import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/integrations/supabase/client";

/**
 * Provider applications, admin side — through the Edge API
 * (routes/provider-applications.ts). The table holds applicants' emails and
 * phones, so it is service-role only; nothing reads it with the anon key.
 */

export interface AdminApplication {
  id: string; status: "pending" | "approved" | "rejected"; archetype_key: string | null;
  service: string; unit: string; business_name: string; created_provider_id: string | null;
  [k: string]: unknown;
}

export async function fetchApplications(params: { status?: string; id?: string } = {}): Promise<AdminApplication[]> {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as Array<[string, string]>).toString();
  const { data, error } = await adminApi(`/admin/provider-applications${qs ? `?${qs}` : ""}`);
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as AdminApplication[];
}

export async function patchApplication(id: string, body: {
  status?: "pending" | "approved" | "rejected"; reviewNotes?: string | null;
  createdProviderId?: string | null; archetypeKey?: string;
}) {
  const { error } = await adminApi(`/admin/provider-applications/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  if (error) throw error;
}

/** Pending applications — the badges on the hub, the dashboard and the lists. */
export function usePendingApplications() {
  return useQuery({
    queryKey: ["admin-provider-applications", "pending"],
    staleTime: 60_000,
    queryFn: () => fetchApplications({ status: "pending" }).catch(() => [] as AdminApplication[]),
  });
}
