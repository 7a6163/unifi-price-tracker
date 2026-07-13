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
  "accessories-modules-fiber",
] as const;

const NEXT_DATA_RE = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

interface RawPrice {
  amount?: number;
  currency?: string;
}
interface RawOptionValue {
  id?: string;
  title?: string;
  slug?: string;
}
interface RawOption {
  id?: string;
  title?: string;
  slug?: string;
  values?: RawOptionValue[];
}
interface RawVariant {
  slug?: string;
  sku?: string;
  displaySku?: string;
  displayPrice?: RawPrice;
  isVisibleInStore?: boolean;
  optionValueIds?: string[];
}
interface RawProduct {
  slug?: string;
  title?: string;
  name?: string;
  minDisplayPrice?: RawPrice;
  variants?: RawVariant[];
  options?: RawOption[];
}

/**
 * Parse a UniFi store category page. Product data lives in the Next.js
 * __NEXT_DATA__ JSON blob under props.pageProps.subCategories[].products[].
 * Each product's variants[] are tracked individually so that e.g. different
 * cable lengths get their own price history.
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
    const productSlug = p?.slug;
    const productTitle = p?.title ?? p?.name;
    if (!productSlug || !productTitle) continue;

    const variants = p?.variants;
    if (!Array.isArray(variants) || variants.length === 0) {
      // Fallback for products that don't expose variants[] (e.g. layout
      // differences) — track at the product level via minDisplayPrice
      // rather than silently dropping the product.
      const amount = p?.minDisplayPrice?.amount;
      if (typeof amount !== "number" || seen.has(productSlug)) continue;
      seen.add(productSlug);
      out.push({
        sku: productSlug,
        name: String(productTitle).trim(),
        category,
        url: `${base}/tw/zh-tw/products/${productSlug}`,
        price: Math.round(amount / 100),
      });
      continue;
    }

    // Build option-value id → title lookup for variant descriptors.
    const optionValueMap = new Map<string, string>();
    if (Array.isArray(p?.options)) {
      for (const opt of p.options) {
        if (Array.isArray(opt?.values)) {
          for (const val of opt.values) {
            if (val?.id && val?.title) optionValueMap.set(val.id, val.title);
          }
        }
      }
    }

    const multiVariant = variants.length > 1;

    variants.forEach((v, index) => {
      const variantSlug = v?.slug;
      const amount = v?.displayPrice?.amount;
      if (!variantSlug || typeof amount !== "number") return;
      if (v?.isVisibleInStore === false) return;
      if (seen.has(variantSlug)) return;
      seen.add(variantSlug);

      let name = String(productTitle).trim();
      if (multiVariant) {
        const descriptors: string[] = [];
        if (Array.isArray(v?.optionValueIds)) {
          for (const id of v.optionValueIds) {
            const title = optionValueMap.get(id);
            if (title) descriptors.push(title);
          }
        }
        // Fall back through displaySku/sku, then a positional marker, so
        // that variants with identical option data never collapse into
        // indistinguishable notification entries.
        const descriptor = descriptors.length > 0
          ? descriptors.join(", ")
          : v?.displaySku || v?.sku || `#${index + 1}`;
        name = `${name} (${descriptor})`;
      }

      out.push({
        sku: variantSlug,
        name,
        category,
        url: `${base}/tw/zh-tw/products/${productSlug}?variant=${variantSlug}`,
        price: Math.round(amount / 100),
      });
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
