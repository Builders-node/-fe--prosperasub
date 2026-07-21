import { supabaseDb } from "@/integrations/supabase/client";

export type AuditAction =
  | "create" | "edit" | "delete" | "archive" | "restore"
  | "assign_plan" | "change_price" | "change_status" | "change_role"
  | "block" | "unblock" | "pause" | "reactivate"
  | "cancel" | "soft_delete"
  | "approve" | "mark_paid" | "mark_unpaid" | "renew"
  // Widen with any string so per-service audit callers (food, cleaning, beach,
  // cars — each writing different entity/action strings) don't have to babysit
  // this union. logAuditEvent swallows errors anyway; strict typing here just
  // slowed real work down.
  | (string & {});

export type EntityType =
  | "user" | "client" | "plan" | "subscription" | "booking" | "assignment"
  | "cleaning_client" | "cleaning_plan"
  | "food_subscription" | "cleaning_subscription" | "beach_subscription" | "rental_booking"
  | "provider" | "food_provider" | "cleaning_provider" | "rental_provider"
  | "food_provider_residence" | "food_meal_plan" | "food_restaurant_manager"
  | "cleaning_provider_manager" | "rental_provider_manager" | "beach_provider_manager"
  | "provider_application" | "provider_plan"
  | (string & {});

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
