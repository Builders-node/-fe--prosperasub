import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/config", () => ({ apiUrlFor: (p: string) => `https://api.test${p}` }));

import { createDbTokenSource, fetchWithAnonFallback } from "./dbToken";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("createDbTokenSource", () => {
  it("is null while signed out and never calls the backend", async () => {
    const fetch = vi.fn();
    const src = createDbTokenSource({ getAccessToken: async () => null, fetch, now: () => 0 });
    expect(await src.get()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches once and reuses the token until shortly before it expires", async () => {
    let t = 0;
    const fetch = vi.fn(async () => ok({ access_token: "db1", expires_in: 900 }));
    const src = createDbTokenSource({ getAccessToken: async () => "acc", fetch, now: () => t });
    expect(await src.get()).toBe("db1");
    t = 800_000;
    expect(await src.get()).toBe("db1");
    expect(fetch).toHaveBeenCalledTimes(1);
    t = 850_000; // inside the last minute
    await src.get();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("asks again when the session's access token changes (another person signed in)", async () => {
    let access = "a1";
    const fetch = vi.fn(async () => ok({ access_token: `db-${access}`, expires_in: 900 }));
    const src = createDbTokenSource({ getAccessToken: async () => access, fetch, now: () => 0 });
    expect(await src.get()).toBe("db-a1");
    access = "a2";
    expect(await src.get()).toBe("db-a2");
  });

  it("falls back to anon and backs off when the backend has no secret (503)", async () => {
    let t = 0;
    const fetch = vi.fn(async () => new Response("", { status: 503 }));
    const src = createDbTokenSource({ getAccessToken: async () => "acc", fetch, now: () => t });
    expect(await src.get()).toBeNull();
    t = 60_000;
    expect(await src.get()).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    t = 11 * 60_000;
    await src.get();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to anon on a network error", async () => {
    const fetch = vi.fn(async () => { throw new TypeError("offline"); });
    const src = createDbTokenSource({ getAccessToken: async () => "acc", fetch, now: () => 0 });
    expect(await src.get()).toBeNull();
  });
});

describe("fetchWithAnonFallback", () => {
  it("retries a 401 on our token with the anon key and stops sending tokens", async () => {
    let t = 0;
    const src = createDbTokenSource({ getAccessToken: async () => "acc", fetch: vi.fn(async () => ok({ access_token: "db1", expires_in: 900 })), now: () => t });
    const token = await src.get();
    const base = vi.fn(async (_i: RequestInfo | URL, init?: RequestInit) =>
      new Headers(init?.headers).get("Authorization") === "Bearer db1" ? new Response("", { status: 401 }) : new Response("[]", { status: 200 }));
    const f = fetchWithAnonFallback(src, "ANON", base as typeof fetch);
    const res = await f("https://db/rest/v1/x", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(new Headers(base.mock.calls[1][1]?.headers).get("Authorization")).toBe("Bearer ANON");
    expect(await src.get()).toBeNull();
  });

  it("leaves a 401 alone when it was not our token", async () => {
    const src = createDbTokenSource({ getAccessToken: async () => null, fetch: vi.fn(), now: () => 0 });
    const base = vi.fn(async () => new Response("", { status: 401 }));
    const res = await fetchWithAnonFallback(src, "ANON", base as typeof fetch)("u", { headers: { Authorization: "Bearer ANON" } });
    expect(res.status).toBe(401);
    expect(base).toHaveBeenCalledTimes(1);
  });
});
