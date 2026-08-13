/**
 * Write the payment reference onto the reserved row the moment the invoice
 * exists — not when the payment confirms.
 *
 * Every checkout reserves a `pending` row before payment so a closed tab does
 * not lose the order. But the reference (Lightning hash, on-chain address,
 * PayPal order, SimpleFi payment id) was only written by the success handler.
 * Close the tab in between and the row is stranded: the reconcile cron scans
 * `payment_reference=not.is.null`, so a row without one is invisible to it
 * forever and can only be fixed by hand.
 *
 * That is not hypothetical. On the day this was written, four cleaning
 * subscriptions had been sitting `pending` since 17 July and 3 August, all
 * four with a null reference, while twelve other subscriptions carried
 * `payment_method = 'manual'` — the workaround, recorded in the data.
 *
 * The hook already offers `onInvoiceReady` for exactly this; two of six
 * checkouts used it. This is the one call all of them make, so the next
 * checkout inherits it instead of rediscovering the bug.
 */

/**
 * Just enough of a Supabase client to PATCH one row. Deliberately loose: the
 * app has two clients — the real supabase-js one and the hand-written wrapper
 * that proxies through the backend — and their builder types do not match.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface UpdatableClient { from: (table: string) => any }

export async function attachPaymentReference(
  client: UpdatableClient,
  table: string,
  rowId: string | null | undefined,
  paymentRef: string | null | undefined,
  method: string,
): Promise<void> {
  if (!rowId || !paymentRef) return;
  try {
    await client.from(table).update({
      payment_reference: paymentRef,
      payment_method: method,
    }).eq("id", rowId);
  } catch {
    // Best-effort: the customer is mid-payment and must not see an error for
    // a bookkeeping write. If it fails, the live poll still activates the
    // order — this only protects the case where the browser goes away.
  }
}
