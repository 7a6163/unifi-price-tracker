import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, getLatestPrices } from "../src/store";
import { runOnce } from "../src/index";
import type { ScrapedProduct } from "../src/types";

beforeEach(async () => {
  await applySchema(env.DB);
  await env.DB.exec("DELETE FROM price_history");
  await env.DB.exec("DELETE FROM products");
});

const wifi = (price: number): ScrapedProduct =>
  ({ sku: "u7", name: "U7 Pro", category: "all-wifi", url: "https://s/u7", price });

function many(n: number): ScrapedProduct[] {
  return Array.from({ length: n }, (_, i) => ({
    sku: `p${i}`, name: `P${i}`, category: "all-wifi", url: `https://s/p${i}`, price: 1000 + i,
  }));
}

describe("runOnce", () => {
  it("notifies on a price drop on the second run", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const adminAlert = vi.fn().mockResolvedValue(undefined);

    await runOnce(env, "2026-06-03T00:00:00Z", { scrape: async () => ({ products: [wifi(6899)], failures: [] }), notify, adminAlert });
    expect(notify).not.toHaveBeenCalled();

    await runOnce(env, "2026-06-03T06:00:00Z", { scrape: async () => ({ products: [wifi(5999)], failures: [] }), notify, adminAlert });
    const lastCall = notify.mock.calls.at(-1)!;
    expect(lastCall[1].drops).toHaveLength(1);
    expect(lastCall[1].drops[0].newPrice).toBe(5999);
  });

  it("sends an admin alert and skips notify when scrape yields nothing", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const adminAlert = vi.fn().mockResolvedValue(undefined);
    await runOnce(env, "2026-06-03T00:00:00Z", { scrape: async () => ({ products: [], failures: ["all-wifi: HTTP 500"] }), notify, adminAlert });
    expect(adminAlert).toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("skips notify but records data when the scrape count drops sharply (layout-change guard)", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const adminAlert = vi.fn().mockResolvedValue(undefined);
    // Seed 4 known products (first run is a silent seed).
    await runOnce(env, "2026-06-03T00:00:00Z", { scrape: async () => ({ products: many(4), failures: [] }), notify, adminAlert });
    // Next run returns only 1 (<50% of 4) -> guard fires.
    await runOnce(env, "2026-06-03T06:00:00Z", { scrape: async () => ({ products: [many(1)[0]], failures: [] }), notify, adminAlert });
    expect(adminAlert).toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    // The thin scrape was still recorded.
    expect((await getLatestPrices(env.DB)).get("p0")?.currentPrice).toBe(1000);
  });

  it("sends an admin alert about partial failures while still notifying", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const adminAlert = vi.fn().mockResolvedValue(undefined);
    // Seed (silent).
    await runOnce(env, "2026-06-03T00:00:00Z", { scrape: async () => ({ products: many(4), failures: [] }), notify, adminAlert });
    // Normal run with a partial failure recorded.
    await runOnce(env, "2026-06-03T06:00:00Z", { scrape: async () => ({ products: many(4), failures: ["all-switching: HTTP 500"] }), notify, adminAlert });
    expect(notify).toHaveBeenCalled();
    expect(adminAlert).toHaveBeenCalledWith(env, expect.stringContaining("部分分類抓取失敗"));
  });
});
