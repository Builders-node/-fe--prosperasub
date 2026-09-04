import { accountApi } from "@/integrations/supabase/client";

/**
 * Tell the business that just sold something.
 *
 * The platform emailed the CUSTOMER their confirmation and told the provider
 * nothing: a restaurant found out about a meal plan by opening the admin
 * panel. This is the checkout's half — fired the moment the order row exists,
 * so the owner and every manager hear about it in seconds.
 *
 * It is deliberately fire-and-forget and never throws: a customer who has
 * just paid must not see an error because a notification did not send. The
 * reconcile cron calls the same server-side service when a payment lands, and
 * `provider_order_notifications` makes whichever call arrives second a no-op —
 * so a tab that dies before this line still gets the provider told.
 */
export async function notifyProviderOfOrder(
  table: "provider_subscriptions" | "food_subscriptions" | "cleaning_subscriptions" | "rental_bookings",
  orderId: string | null | undefined,
): Promise<void> {
  if (!orderId) return;
  try {
    await accountApi("/mail/new-order", {
      method: "POST",
      body: JSON.stringify({ table, orderId: String(orderId) }),
    });
  } catch {
    // Silence is the point — see above.
  }
}
