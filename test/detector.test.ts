import { describe, it, expect } from "vitest";
import { detectChanges } from "../src/detector";
import type { Product, ScrapedProduct } from "../src/types";

function scraped(sku: string, price: number): ScrapedProduct {
  return { sku, name: sku, category: "all-wifi", url: `https://x/${sku}`, price };
}
function prev(sku: string, currentPrice: number): Product {
  return { sku, name: sku, category: "all-wifi", url: `https://x/${sku}`, currentPrice, lastSeenAt: "2026-06-01T00:00:00Z" };
}

describe("detectChanges", () => {
  it("flags a price drop with rounded negative pct", () => {
    const previous = new Map([["u7", prev("u7", 6899)]]);
    const { drops, newItems } = detectChanges([scraped("u7", 5999)], previous);
    expect(newItems).toEqual([]);
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({ oldPrice: 6899, newPrice: 5999, pctChange: -13 });
  });

  it("flags a never-seen sku as a new item, not a drop", () => {
    const { drops, newItems } = detectChanges([scraped("e7", 19299)], new Map());
    expect(drops).toEqual([]);
    expect(newItems.map((p) => p.sku)).toEqual(["e7"]);
  });

  it("ignores price increases and unchanged prices", () => {
    const previous = new Map([["a", prev("a", 100)], ["b", prev("b", 100)]]);
    const { drops, newItems } = detectChanges([scraped("a", 120), scraped("b", 100)], previous);
    expect(drops).toEqual([]);
    expect(newItems).toEqual([]);
  });

  it("handles empty scrape input", () => {
    const { drops, newItems } = detectChanges([], new Map([["a", prev("a", 100)]]));
    expect(drops).toEqual([]);
    expect(newItems).toEqual([]);
  });

  it("deduplicates scraped items with the same sku", () => {
    // If scrapeAll doesn't dedup, same SKU could appear twice as a new item.
    const { drops, newItems } = detectChanges(
      [scraped("door-closer", 4999), scraped("door-closer", 4999)],
      new Map(),
    );
    expect(drops).toEqual([]);
    // Should report only one new item, not two.
    expect(newItems).toHaveLength(1);
  });
});
