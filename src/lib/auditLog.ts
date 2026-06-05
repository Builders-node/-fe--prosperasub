import { supabaseDb } from "@/integrations/supabase/client";

export type AuditAction =
  | "create" | "edit" | "delete" | "archive" | "restore"
  | "assign_plan" | "change_price" | "change_status" | "change_role"
  | "block" | "unblock" | "pause" | "reactivate"
  | "cancel" | "soft_delete";

export type EntityType =
  | "user" | "client" | "plan" | "subscription" | "booking" | "assignment"
  | "cleaning_client" | "cleaning_plan";

export async function logAuditEvent(
  adminUserId: string,
  action: AuditAction,
  entityType: EntityType,
  entityId: string | null,
  details?: Record<string, any>,
) {
  try {
    await supabaseDb.from("admin_audit_logs").insert({
      admin_user_id: adminUserId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details: details || {},
    });
  } catch {
    // Non-fatal — don't block admin actions if audit fails
  }
}
