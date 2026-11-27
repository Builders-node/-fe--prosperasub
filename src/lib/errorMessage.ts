/**
 * The human-readable half of whatever a query threw.
 *
 * Not everything thrown is an Error. PostgREST rejects with a plain object
 * ({ message, code, details, hint }) and `String()` turns that into
 * "[object Object]" — which is how a failure notice ended up telling the user
 * nothing at all. Anything carrying a string `message` is treated as speaking.
 */
export function errorMessage(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "";
}

/**
 * A raw database error — PostgREST passes Postgres' own SQLSTATE through as
 * `code` (e.g. 22P02 "invalid input syntax for type uuid"). Its text is for
 * the console, not for a customer.
 */
export function isRawDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code);
}
