/**
 * Turning "Cannot POST /admin/orders/…" into a sentence.
 *
 * The backend and the frontend deploy separately, and the backend's deploy has
 * been broken since 29 August — so a screen built this week reaches an API that
 * predates it and NestJS answers with a 404 whose message is the HTTP verb and
 * the path. An admin reading that has no way to tell it apart from a bug.
 *
 * Naming the cause is the difference between "this is broken" and "this is not
 * switched on yet", and only one of those is worth reporting to anybody.
 */
export function adminApiMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/^Cannot (POST|GET|PATCH|PUT|DELETE) /i.test(raw) || /\bNot Found\b/i.test(raw)) {
    return "The server does not have this yet — it needs deploying. Nothing was changed.";
  }
  return raw || fallback;
}

/** True when the API simply does not know this route — see above. */
export function isNotDeployed(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return /^Cannot (POST|GET|PATCH|PUT|DELETE) /i.test(raw) || /\bNot Found\b/i.test(raw);
}
