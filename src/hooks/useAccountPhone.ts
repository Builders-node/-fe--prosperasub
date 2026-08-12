import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { normalizePhone } from "@/components/patterns/CustomerPhone";

/**
 * The phone number we already know for the signed-in customer.
 *
 * WhatsApp first, then the plain number — every checkout on the platform asks
 * for "WhatsApp", and that is the one the ops team actually messages.
 *
 * Only the cleaning checkout used to do this, inline. The other three that ask
 * for a phone — food, the cart, and a car booking — made the customer type it
 * again on every purchase, having already given it once in their profile.
 */
export function useAccountPhone(): string | null {
  const { userData } = useAuth();

  const { data } = useQuery({
    queryKey: ["account-phone", userData?.id],
    enabled: !!userData?.id,
    // The number does not change mid-checkout; refetching on every focus just
    // costs a round trip.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("user_profiles")
        .select("user_id,phone_number,whatsapp")
        .eq("user_id", userData!.id)
        .maybeSingle();
      return data as { phone_number?: string | null; whatsapp?: string | null } | null;
    },
  });

  return normalizePhone(data?.whatsapp) ?? normalizePhone(data?.phone_number) ?? null;
}

/**
 * Fill a checkout's phone field from the account, once, and then leave it alone.
 *
 * "Once" is the important part: the customer must be able to type a different
 * number — a doorman's, a spouse's — without it being overwritten the next time
 * the query settles, and clearing the field must not silently refill it either.
 *
 *     const phone = useAccountPhone();  // if you also want to show it
 *     usePhonePrefill(phone, setPhone);
 */
export function usePhonePrefill(
  currentValue: string,
  onFill: (phone: string) => void,
): void {
  const known = useAccountPhone();
  const filledRef = useRef(false);
  // Kept in a ref so the effect doesn't need `onFill` in its deps; call sites
  // pass an inline arrow and would re-run on every render otherwise.
  const onFillRef = useRef(onFill);
  onFillRef.current = onFill;

  useEffect(() => {
    if (filledRef.current) return;
    if (currentValue.trim()) {
      // Already has something — a renewal prefill, or the customer typed
      // first. Never overwrite that.
      filledRef.current = true;
      return;
    }
    if (!known) return;
    filledRef.current = true;
    onFillRef.current(known);
  }, [known, currentValue]);
}
