import type { Changes, Product, ScrapedProduct } from "./types";

export function detectChanges(
  scraped: ScrapedProduct[],
  previous: Map<string, Product>,
): Changes {
  const drops: Changes["drops"] = [];
  const newItems: ScrapedProduct[] = [];
  const seen = new Set<string>();

  for (const item of scraped) {
    if (seen.has(item.sku)) continue;
    seen.add(item.sku);
    const prior = previous.get(item.sku);
    if (!prior) {
      newItems.push(item);
      continue;
    }
    if (item.price < prior.currentPrice) {
      const pctChange = Math.round(((item.price - prior.currentPrice) / prior.currentPrice) * 100);
      drops.push({ product: item, oldPrice: prior.currentPrice, newPrice: item.price, pctChange });
    }
  }

  return { drops, newItems };
}
