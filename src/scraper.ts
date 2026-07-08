import type { Env, ScrapedProduct } from "./types";

export const CATEGORIES = [
  "all-cloud-gateways",
  "all-switching",
  "all-wifi",
  "all-cameras-nvrs",
  "all-door-access",
  "all-integrations",
  "all-advanced-hosting",
  "accessories-cables-dacs",
] as const;

const NEXT_DATA_RE = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

interface RawPrice {
  amount?: number;
  currency?: string;
}
interface RawProduct {
  slug?: string;
  title?: string;
  name?: string;
  minDisplayPrice?: RawPrice;
}

/**
 * Parse a UniFi store category page. Product data lives in the Next.js
 * __NEXT_DATA__ JSON blob under props.pageProps.subCategories[].products[].
 * Returns [] if the blob is missing/unparseable (caller treats 0 as a failure).
 */
export function parseCategory(html: string, category: string, base: string): ScrapedProduct[] {
  const m = html.match(NEXT_DATA_RE);
  if (!m) return [];

  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return [];
  }

  const pageProps = (data as { props?: { pageProps?: Record<string, unknown> } })?.props?.pageProps;
  if (!pageProps) return [];

  const raw: RawProduct[] = [];
  const subCategories = pageProps["subCategories"];
  if (Array.isArray(subCategories)) {
    for (const sc of subCategories) {
      const products = (sc as { products?: unknown })?.products;
      if (Array.isArray(products)) raw.push(...(products as RawProduct[]));
    }
  }
  // Fallback: some category pages may expose a flat products array.
  if (raw.length === 0 && Array.isArray(pageProps["products"])) {
    raw.push(...(pageProps["products"] as RawProduct[]));
  }

  const out: ScrapedProduct[] = [];
  const seen = new Set<string>();
  for (const p of raw) {
    const slug = p?.slug;
    const amount = p?.minDisplayPrice?.amount;
    const name = p?.title ?? p?.name;
    if (!slug || typeof amount !== "number" || !name) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      sku: slug,
      name: String(name).trim(),
      category,
      url: `${base}/tw/zh-tw/products/${slug}`,
      price: Math.round(amount / 100),
    });
  }
  return out;
}

export async function scrapeAll(env: Env): Promise<{ products: ScrapedProduct[]; failures: string[] }> {
  const all: ScrapedProduct[] = [];
  const failures: string[] = [];
  for (const cat of CATEGORIES) {
    try {
      const res = await fetch(`${env.STORE_BASE}/tw/zh-tw/category/${cat}`, {
        headers: { "user-agent": "Mozilla/5.0 (price-tracker)" },
      });
      if (!res.ok) {
        failures.push(`${cat}: HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const parsed = parseCategory(html, cat, env.STORE_BASE);
      if (parsed.length === 0) {
        failures.push(`${cat}: parsed 0 products (possible layout change)`);
        continue;
      }
      all.push(...parsed);
    } catch (err) {
      failures.push(`${cat}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // Deduplicate across categories — same product can appear in multiple category pages.
  const products: ScrapedProduct[] = [];
  const seen = new Set<string>();
  for (const p of all) {
    if (seen.has(p.sku)) continue;
    seen.add(p.sku);
    products.push(p);
  }
  return { products, failures };
}
