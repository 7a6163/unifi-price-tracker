import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { getLatestPrices, persist, applySchema } from "../src/store";
import type { ScrapedProduct } from "../src/types";

function p(sku: string, price: number): ScrapedProduct {
  return { sku, name: sku.toUpperCase(), category: "all-wifi", url: `https://s/${sku}`, price };
}

beforeEach(async () => {
  await applySchema(env.DB);
  await env.DB.exec("DELETE FROM price_history");
  await env.DB.exec("DELETE FROM products");
});

describe("store", () => {
  it("returns empty map before any persist", async () => {
    const map = await getLatestPrices(env.DB);
    expect(map.size).toBe(0);
  });

  it("persists new products and reads them back", async () => {
    await persist(env.DB, [p("u7", 6899)], "2026-06-03T00:00:00Z");
    const map = await getLatestPrices(env.DB);
    expect(map.get("u7")?.currentPrice).toBe(6899);
  });

  it("writes a history row only when price changes", async () => {
    await persist(env.DB, [p("u7", 6899)], "2026-06-03T00:00:00Z");
    await persist(env.DB, [p("u7", 6899)], "2026-06-03T06:00:00Z"); // unchanged
    await persist(env.DB, [p("u7", 5999)], "2026-06-03T12:00:00Z"); // changed
    const { results } = await env.DB.prepare(
      "SELECT price FROM price_history WHERE sku = ? ORDER BY observed_at",
    ).bind("u7").all<{ price: number }>();
    expect(results.map((r) => r.price)).toEqual([6899, 5999]);
    expect((await getLatestPrices(env.DB)).get("u7")?.currentPrice).toBe(5999);
  });
});
