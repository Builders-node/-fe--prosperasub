import { accountApi } from "@/integrations/supabase/client";

/**
 * Phones and addresses (`user_profiles`), through the API.
 *
 * The table's contact columns are closed to the public key — it ships inside
 * the site, so they were anyone's to read. The server answers by the same rule
 * as names (Edge routes/provider-customers.ts): yourself; an admin, everyone;
 * a business, its own customers and team.
 */
export interface ProfileRow {
  id: string;
  user_id: string;
  phone_number?: string | null;
  whatsapp?: string | null;
  telegram_username?: string | null;
  default_delivery_address?: string | null;
  address_street?: string | null;
  address_house?: string | null;
  address_apartment?: string | null;
  address_area?: string | null;
  address_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** The signed-in person's own profile, or null. */
export async function fetchMyProfile(): Promise<ProfileRow | null> {
  const { data, error } = await accountApi("/account/profile");
  if (error) throw error;
  return ((data as { profile?: ProfileRow | null } | null)?.profile ?? null);
}

/** Profiles of these accounts — only the ones the caller may see come back. */
export async function fetchProfiles(userIds: Array<string | null | undefined>): Promise<ProfileRow[]> {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return [];
  const { data, error } = await accountApi("/account/profiles/lookup", {
    method: "POST", body: JSON.stringify({ userIds: ids }),
  });
  if (error) throw error;
  return ((data as { profiles?: ProfileRow[] } | null)?.profiles ?? []);
}

/** Every profile — admin only (the server refuses anyone else). */
export async function fetchAllProfiles(): Promise<ProfileRow[]> {
  const { data, error } = await accountApi("/account/profiles/lookup", {
    method: "POST", body: JSON.stringify({ all: true }),
  });
  if (error) throw error;
  return ((data as { profiles?: ProfileRow[] } | null)?.profiles ?? []);
}
