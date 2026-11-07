import { useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { Car, Sparkles, Ticket, UtensilsCrossed, Waves } from "lucide-react";

import { supabaseDb } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaging";
import { pickPhone } from "@/components/patterns/CustomerPhone";

/**
 * What a customer has bought, across EVERY source.
 *
 * Users used to ask three tables (cleaning, food, beach) and so called a car
 * renter or a buyer of a universal / one-time plan "Idle". The read model
 * `subscriptions_unified` already folds all five sources — cleaning, food,
 * beach, `plan` (universal-only, one-time included) and `cars` (rental
 * bookings) — with the effective status computed in Honduras time, so this
 * reads it and nothing else for the per-user picture.
 *
 * `rental_bookings` is read separately only for what the view does not carry:
 * the WhatsApp number and delivery address a renter typed at checkout, which
 * is often the only phone we hold for them.
 */

export type CustomerService = "cleaning" | "food" | "beach" | "plan" | "cars";

export const CUSTOMER_SERVICE_ORDER: readonly CustomerService[] = ["cleaning", "food", "beach", "plan", "cars"];

export const CUSTOMER_SERVICE_META: Record<CustomerService, { label: string; icon: ComponentType<{ className?: string }> }> = {
  cleaning: { label: "Cleaning", icon: Sparkles },
  food:     { label: "Food",     icon: UtensilsCrossed },
  beach:    { label: "Beach",    icon: Waves },
  plan:     { label: "Plans",    icon: Ticket },
  cars:     { label: "Cars",     icon: Car },
};

const asService = (s: unknown): CustomerService =>
  (CUSTOMER_SERVICE_ORDER as readonly string[]).includes(String(s)) ? (s as CustomerService) : "plan";

export interface CustomerActivity {
  /** Services with a live, paid row right now. */
  active: Set<CustomerService>;
  /** Services they have ever bought (any status). */
  ever: Set<CustomerService>;
}

interface UnifiedRow {
  service: string;
  id: string;
  user_id: string | null;
  status: string | null;
  paid: boolean | null;
}

/** A row counts as live only when it is active AND paid — a pending checkout is not a customer yet. */
const isLive = (r: { status: string | null; paid: boolean | null }) =>
  String(r.status ?? "").toLowerCase() === "active" && r.paid === true;

export function useCustomerActivity() {
  return useQuery({
    queryKey: ["admin-customers-activity"],
    staleTime: 15_000,
    queryFn: async () => {
      // Paged: this collapses into a per-user status, so a 1000-row clip would
      // quietly make customers look idle. `id` alone is not unique across the
      // union (each source has its own id space) — order by both.
      const rows = await fetchAllRows<UnifiedRow>(() => supabaseDb
        .from("subscriptions_unified")
        .select("service,id,user_id,status,paid")
        .order("service")
        .order("id"));
      const map = new Map<string, CustomerActivity>();
      for (const r of rows) {
        if (!r.user_id) continue;
        const cur = map.get(r.user_id) ?? { active: new Set(), ever: new Set() };
        const svc = asService(r.service);
        cur.ever.add(svc);
        if (isLive(r)) cur.active.add(svc);
        map.set(r.user_id, cur);
      }
      return map;
    },
  });
}

export interface CustomerContact {
  phone: string | null;
  whatsapp: string | null;
  /** One lowercase string of everything address-like, for search. */
  addressText: string;
  /** A short human line (apartment · area) for display. */
  addressLine: string | null;
}

export function useCustomerContacts() {
  return useQuery({
    queryKey: ["admin-customers-contacts"],
    staleTime: 60_000,
    queryFn: async () => {
      const [profiles, rentals] = await Promise.all([
        fetchAllRows<any>(() => supabaseDb
          .from("user_profiles")
          .select("id,user_id,phone_number,whatsapp,address_street,address_house,address_apartment,address_area,default_delivery_address")
          .order("id")),
        fetchAllRows<any>(() => supabaseDb
          .from("rental_bookings")
          .select("id,user_id,customer_whatsapp,delivery_address,created_at")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .order("id")),
      ]);

      const map = new Map<string, CustomerContact>();
      for (const p of profiles) {
        if (!p.user_id) continue;
        const parts = [p.address_apartment, p.address_house, p.address_street, p.address_area, p.default_delivery_address]
          .map((v: unknown) => (typeof v === "string" ? v.trim() : ""))
          .filter(Boolean);
        const line = [p.address_apartment, p.address_area].map((v: unknown) => (typeof v === "string" ? v.trim() : "")).filter(Boolean).join(" · ");
        map.set(String(p.user_id), {
          phone: pickPhone(p.phone_number, p.whatsapp),
          whatsapp: pickPhone(p.whatsapp, p.phone_number),
          addressText: parts.join(" ").toLowerCase(),
          addressLine: line || null,
        });
      }
      // Newest booking first, so the first number we keep is the latest one typed.
      for (const r of rentals) {
        if (!r.user_id) continue;
        const uid = String(r.user_id);
        const cur = map.get(uid) ?? { phone: null, whatsapp: null, addressText: "", addressLine: null };
        const wa = pickPhone(r.customer_whatsapp);
        const addr = typeof r.delivery_address === "string" ? r.delivery_address.trim() : "";
        map.set(uid, {
          phone: cur.phone ?? wa,
          whatsapp: cur.whatsapp ?? wa,
          addressText: addr && !cur.addressText.includes(addr.toLowerCase()) ? `${cur.addressText} ${addr.toLowerCase()}`.trim() : cur.addressText,
          addressLine: cur.addressLine ?? (addr || null),
        });
      }
      return map;
    },
  });
}

export interface CustomerSale {
  key: string;
  service: CustomerService;
  name: string;
  status: string;
  paymentStatus: string | null;
  active: boolean;
  amountCents: number | null;
  createdAt: string | null;
  kind: "subscription" | "booking";
}

/** One customer's whole purchase history, every source, newest first. */
export function useCustomerSales(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["admin-customer-sales", userId],
    enabled: !!userId,
    queryFn: async (): Promise<CustomerSale[]> => {
      const { data, error } = await supabaseDb
        .from("subscriptions_unified")
        .select("service,id,kind,status,paid,payment_status,price_cents,plan_name,created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => {
        const service = asService(r.service);
        return {
          key: `${r.service}-${r.id}`,
          service,
          name: r.plan_name || (service === "cars" ? "Car rental" : `${CUSTOMER_SERVICE_META[service].label} plan`),
          status: r.status ?? "—",
          paymentStatus: r.payment_status ?? null,
          active: isLive(r),
          amountCents: r.price_cents == null ? null : Number(r.price_cents),
          createdAt: r.created_at ?? null,
          kind: r.kind === "booking" ? "booking" : "subscription",
        };
      });
    },
  });
}
