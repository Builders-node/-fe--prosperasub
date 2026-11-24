/**
 * Is a newer build of the site out than the one running in this tab?
 *
 * A tab opened before a deploy keeps running the old code for as long as it
 * stays open — and the old code can be wrong against today's database (a
 * column it reads may since have been closed to the browser; that is how
 * "permission denied for table cleaning_provider_managers" reached a phone
 * after the privacy migrations). Stale lazy chunks already recover by
 * themselves (lib/staleChunk); this catches the case where nothing fails to
 * load and the old code simply keeps running.
 *
 * The build is identified by the hashed name of the main script Vite writes
 * into index.html: different name, different build. In development there is
 * no such script and nothing is ever reported.
 */
const MAIN_SCRIPT = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

/** The main script this tab is running, or null (dev server). */
export function runningBuild(): string | null {
  if (typeof document === "undefined") return null;
  for (const s of Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))) {
    const m = s.src.match(MAIN_SCRIPT);
    if (m) return m[0];
  }
  return null;
}

/** The main script the server hands out now, or null if it could not be read. */
export async function deployedBuild(): Promise<string | null> {
  try {
    const res = await fetch(`/index.html?v=${Date.now()}`, { cache: "no-store", credentials: "omit" });
    if (!res.ok) return null;
    return (await res.text()).match(MAIN_SCRIPT)?.[0] ?? null;
  } catch {
    return null; // offline, or the request was blocked: assume nothing changed
  }
}

/** True only when both are known and they differ. */
export async function newerBuildIsOut(): Promise<boolean> {
  const running = runningBuild();
  if (!running) return false;
  const deployed = await deployedBuild();
  return !!deployed && deployed !== running;
}
