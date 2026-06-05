import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi, supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "./useUserUuid";

export interface UserNotification {
  id: string;
  recipientUserId: string;
  category: "payment" | "subscription" | "booking" | "reminder" | "plan";
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  isArchived: boolean;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// Map snake_case DB row → camelCase interface
function mapRow(r: any): UserNotification {
  return {
    id:                r.id,
    recipientUserId:   r.recipient_user_id,
    category:          r.category,
    type:              r.type,
    title:             r.title,
    body:              r.body,
    isRead:            r.is_read,
    isArchived:        r.is_archived,
    relatedEntityType: r.related_entity_type ?? null,
    relatedEntityId:   r.related_entity_id ?? null,
    actionUrl:         r.action_url ?? null,
    metadata:          r.metadata ?? null,
    createdAt:         r.created_at,
    updatedAt:         r.updated_at,
  };
}

// ─── Queries — hit Supabase directly (no cold start) ─────────────────────────

export function useNotifications(opts: { category?: string; unreadOnly?: boolean } = {}) {
  const { isAuthenticated } = useAuth();
  const userUuid = useUserUuid();

  return useQuery<UserNotification[]>({
    queryKey: ["account-notifications", userUuid, opts.category, opts.unreadOnly],
    queryFn: async () => {
      if (!userUuid) return [];
      let q = supabaseDb
        .from("user_notifications")
        .select("*")
        .eq("recipient_user_id", userUuid)
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(100);

      if (opts.unreadOnly) q = q.eq("is_read", false);
      if (opts.category && opts.category !== "all") q = q.eq("category", opts.category);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
    enabled: isAuthenticated && !!userUuid,
    staleTime: 30_000,
  });
}

/** Trigger reminder processing on app load (replaces need for cron on Hobby plan) */
function useTriggerReminders(isAuthenticated: boolean, userUuid: string | null) {
  useEffect(() => {
    if (!isAuthenticated || !userUuid) return;
    // Fire once per session, silently in the background
    const key = `reminders_triggered_${new Date().toDateString()}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    accountApi("/reminders/process", { method: "GET" }).catch(() => {/* silent */});
  }, [isAuthenticated, userUuid]);
}

export function useUnreadCount() {
  const { isAuthenticated } = useAuth();
  const userUuid = useUserUuid();

  // Trigger reminder processing once per day when the user is active
  useTriggerReminders(isAuthenticated, userUuid);

  return useQuery<number>({
    queryKey: ["account-notifications-unread-count", userUuid],
    queryFn: async () => {
      if (!userUuid) return 0;
      const { count, error } = await supabaseDb
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", userUuid)
        .eq("is_read", false)
        .eq("is_archived", false);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: isAuthenticated && !!userUuid,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ─── Mutations — still go through backend for auth/security ──────────────────

export function useMarkAsRead() {
  const qc = useQueryClient();
  const userUuid = useUserUuid();
  return useMutation({
    mutationFn: async (id: string) => {
      // Optimistically update local cache immediately
      qc.setQueriesData({ queryKey: ["account-notifications"] }, (old: any) =>
        Array.isArray(old) ? old.map((n: UserNotification) => n.id === id ? { ...n, isRead: true } : n) : old,
      );
      qc.setQueryData(["account-notifications-unread-count", userUuid], (old: any) =>
        typeof old === "number" ? Math.max(0, old - 1) : old,
      );
      await supabaseDb
        .from("user_notifications")
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("recipient_user_id", userUuid ?? "");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["account-notifications"] });
      qc.invalidateQueries({ queryKey: ["account-notifications-unread-count"] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  const userUuid = useUserUuid();
  return useMutation({
    mutationFn: async () => {
      // Optimistic update
      qc.setQueriesData({ queryKey: ["account-notifications"] }, (old: any) =>
        Array.isArray(old) ? old.map((n: UserNotification) => ({ ...n, isRead: true })) : old,
      );
      qc.setQueryData(["account-notifications-unread-count", userUuid], 0);
      await supabaseDb
        .from("user_notifications")
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq("recipient_user_id", userUuid ?? "")
        .eq("is_read", false)
        .eq("is_archived", false);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["account-notifications"] });
      qc.invalidateQueries({ queryKey: ["account-notifications-unread-count"] });
    },
  });
}

export function useArchiveNotification() {
  const qc = useQueryClient();
  const userUuid = useUserUuid();
  return useMutation({
    mutationFn: async (id: string) => {
      // Optimistic remove from list
      qc.setQueriesData({ queryKey: ["account-notifications"] }, (old: any) =>
        Array.isArray(old) ? old.filter((n: UserNotification) => n.id !== id) : old,
      );
      await supabaseDb
        .from("user_notifications")
        .update({ is_archived: true, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("recipient_user_id", userUuid ?? "");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["account-notifications"] });
      qc.invalidateQueries({ queryKey: ["account-notifications-unread-count"] });
    },
  });
}
