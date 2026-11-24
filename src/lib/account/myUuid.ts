import { accountApi } from "@/integrations/supabase/client";

/**
 * The signed-in person's own account id — the uuid, never a "google-…" token
 * id. Asked of the server: the browser used to find it by reading `users`
 * by email, and that table is no longer open to the public key.
 */
export async function fetchMyUuid(): Promise<string | null> {
  const { data } = await accountApi("/account/me/uuid");
  const id = (data as { id?: string | null } | null)?.id ?? null;
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}
