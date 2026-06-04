import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema } from "../src/store";
import { runOnce } from "../src/index";
import type { ScrapedProduct } from "../src/types";

beforeEach(async () => {
  await applySchema(env.DB);
  await env.DB.exec("DELETE FROM price_history");
  await env.DB.exec("DELETE FROM products");
});

const wifi = (price: number): ScrapedProduct =>
  ({ sku: "u7", name: "U7 Pro", category: "all-wifi", url: "https://s/u7", price });

describe("runOnce", () => {
  it("notifies on a price drop on the second run", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const adminAlert = vi.fn().mockResolvedValue(undefined);

    // First run: empty DB -> seeds silently, no notify.
    await runOnce(env, "2026-06-03T00:00:00Z", { scrape: async () => ({ products: [wifi(6899)], failures: [] }), notify, adminAlert });
    expect(notify).not.toHaveBeenCalled();

    // Second run: price drop -> notify called with a drop.
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
});
