import { afterEach, describe, expect, it, vi } from "vitest";
import middleware from "../../../middleware";

const bot = { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" };
const respond = (body: unknown, ok = true) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: ok ? 200 : 500 }));

afterEach(() => vi.unstubAllGlobals());

describe("robot pages", () => {
  it("answers 404 + noindex for a business that does not exist", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond([])));
    const res = await middleware(new Request("https://everysub.net/businesses/no-such-shop", { headers: bot }));
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const html = await res.text();
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toContain('rel="canonical"');
  });

  it("answers 404 for a plan that does not exist", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond([])));
    const res = await middleware(new Request("https://everysub.net/plans/some-plan-99999", { headers: bot }));
    expect(res.status).toBe(404);
  });

  it("falls through to the app when the database does not answer", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond({ message: "down" }, false)));
    const res = await middleware(new Request("https://everysub.net/plans/some-plan-99999", { headers: bot }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("gives /terms, /privacy and /support a real title and H1", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond([])));
    for (const [path, h1] of [["/terms", "Terms of Service"], ["/privacy", "Privacy Policy"], ["/support", "How can we help?"]]) {
      const res = await middleware(new Request(`https://everysub.net${path}`, { headers: bot }));
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(`<h1>${h1}</h1>`);
      expect(html).not.toContain("<title>EverySub — Subscriptions in Roatán</title>");
    }
  });
});
