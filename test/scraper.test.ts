import { describe, it, expect } from "vitest";
import allWifiHtml from "./fixtures/all-wifi.html?raw";
import { parseCategory } from "../src/scraper";

describe("parseCategory", () => {
  it("extracts products with sku, name, integer price, and absolute url", () => {
    const products = parseCategory(allWifiHtml, "all-wifi", "https://tw.store.ui.com");
    expect(products.length).toBeGreaterThan(10);
    for (const p of products) {
      expect(p.sku).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(Number.isInteger(p.price)).toBe(true);
      expect(p.price).toBeGreaterThan(0);
      expect(p.url.startsWith("https://")).toBe(true);
      expect(p.category).toBe("all-wifi");
    }
    expect(products.some((p) => p.name.includes("U7"))).toBe(true);
    // spot-check a known product/price from the captured fixture
    const u7pro = products.find((p) => p.sku === "u7-pro");
    expect(u7pro?.price).toBe(6899);
  });

  it("tracks each variant separately for multi-variant products", () => {
    // Synthetic HTML mimicking the __NEXT_DATA__ structure for a product
    // with multiple length variants (like fiber patch cables).
    const html = `<html><body>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"subCategories":[{"products":[
  {
    "slug":"uacc-ofc-m2-lulu",
    "title":"OM4 Duplex LC UPC Fiber Patch Cable",
    "name":"UACC-OFC-M2-LULU",
    "options":[
      {"id":"opt-1","title":"Connector","slug":"connector","values":[
        {"id":"cv-1","title":"Duplex LC","slug":"duplex-lc"},
        {"id":"cv-2","title":"MPO-12 UPC","slug":"mpo-12-upc"}
      ]},
      {"id":"opt-2","title":"Length","slug":"length","values":[
        {"id":"lv-1","title":"0.5 m","slug":"0dot5m"},
        {"id":"lv-2","title":"1 m","slug":"1m"},
        {"id":"lv-3","title":"5 m","slug":"5m"}
      ]}
    ],
    "variants":[
      {"slug":"uacc-ofc-m2-lulu-0dot5m","sku":"UACC-OFC-M2-LULU-0.5M","displaySku":"UACC-OFC-M2-LULU-0.5M","displayPrice":{"amount":19900,"currency":"TWD"},"isVisibleInStore":true,"optionValueIds":["cv-1","lv-1"]},
      {"slug":"uacc-ofc-m2-lulu-1m","sku":"UACC-OFC-M2-LULU-1M","displaySku":"UACC-OFC-M2-LULU-1M","displayPrice":{"amount":24900,"currency":"TWD"},"isVisibleInStore":true,"optionValueIds":["cv-1","lv-2"]},
      {"slug":"uacc-ofc-m2-lulu-5m","sku":"UACC-OFC-M2-LULU-5M","displaySku":"UACC-OFC-M2-LULU-5M","displayPrice":{"amount":39900,"currency":"TWD"},"isVisibleInStore":true,"optionValueIds":["cv-1","lv-3"]}
    ]
  }
]}]}}}
</script></body></html>`;

    const products = parseCategory(html, "accessories-modules-fiber", "https://tw.store.ui.com");
    expect(products).toHaveLength(3);

    const halfMeter = products.find((p) => p.sku === "uacc-ofc-m2-lulu-0dot5m");
    expect(halfMeter?.price).toBe(199);
    expect(halfMeter?.name).toContain("0.5 m");
    expect(halfMeter?.url).toBe(
      "https://tw.store.ui.com/tw/zh-tw/products/uacc-ofc-m2-lulu?variant=uacc-ofc-m2-lulu-0dot5m",
    );

    const fiveMeter = products.find((p) => p.sku === "uacc-ofc-m2-lulu-5m");
    expect(fiveMeter?.price).toBe(399);
    expect(fiveMeter?.name).toContain("5 m");

    // Each variant should have a unique sku
    const slugs = products.map((p) => p.sku);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("skips variants not visible in store", () => {
    const html = `<html><body>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"subCategories":[{"products":[
  {
    "slug":"test-product",
    "title":"Test Product",
    "variants":[
      {"slug":"test-product-a","displayPrice":{"amount":10000,"currency":"TWD"},"isVisibleInStore":true},
      {"slug":"test-product-b","displayPrice":{"amount":20000,"currency":"TWD"},"isVisibleInStore":false}
    ]
  }
]}]}}}
</script></body></html>`;

    const products = parseCategory(html, "test", "https://tw.store.ui.com");
    expect(products).toHaveLength(1);
    expect(products[0].sku).toBe("test-product-a");
  });

  it("uses displaySku as descriptor when option values are unavailable", () => {
    const html = `<html><body>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"subCategories":[{"products":[
  {
    "slug":"test-product",
    "title":"Test Product",
    "variants":[
      {"slug":"test-product-a","displaySku":"TP-A","displayPrice":{"amount":10000,"currency":"TWD"},"isVisibleInStore":true,"optionValueIds":[]},
      {"slug":"test-product-b","displaySku":"TP-B","displayPrice":{"amount":20000,"currency":"TWD"},"isVisibleInStore":true,"optionValueIds":[]}
    ]
  }
]}]}}}
</script></body></html>`;

    const products = parseCategory(html, "test", "https://tw.store.ui.com");
    expect(products).toHaveLength(2);
    expect(products[0].name).toContain("TP-A");
    expect(products[1].name).toContain("TP-B");
  });

  it("falls back to positional marker when neither option values nor displaySku are available", () => {
    const html = `<html><body>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"subCategories":[{"products":[
  {
    "slug":"test-product",
    "title":"Test Product",
    "variants":[
      {"slug":"test-product-a","displayPrice":{"amount":10000,"currency":"TWD"},"isVisibleInStore":true,"optionValueIds":[]},
      {"slug":"test-product-b","displayPrice":{"amount":20000,"currency":"TWD"},"isVisibleInStore":true,"optionValueIds":[]}
    ]
  }
]}]}}}
</script></body></html>`;

    const products = parseCategory(html, "test", "https://tw.store.ui.com");
    expect(products).toHaveLength(2);
    // Each variant still gets a distinct name even with no descriptor data.
    expect(products[0].name).not.toBe(products[1].name);
    expect(products[0].name).toContain("#1");
    expect(products[1].name).toContain("#2");
  });

  it("falls back to product-level minDisplayPrice when variants[] is absent", () => {
    const html = `<html><body>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"subCategories":[{"products":[
  {
    "slug":"no-variants-product",
    "title":"No Variants Product",
    "minDisplayPrice":{"amount":50000,"currency":"TWD"}
  }
]}]}}}
</script></body></html>`;

    const products = parseCategory(html, "test", "https://tw.store.ui.com");
    expect(products).toHaveLength(1);
    expect(products[0].sku).toBe("no-variants-product");
    expect(products[0].price).toBe(500);
    expect(products[0].url).toBe("https://tw.store.ui.com/tw/zh-tw/products/no-variants-product");
  });

  it("skips products with neither variants[] nor a usable minDisplayPrice", () => {
    const html = `<html><body>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"subCategories":[{"products":[
  {"slug":"broken-product","title":"Broken Product"}
]}]}}}
</script></body></html>`;

    const products = parseCategory(html, "test", "https://tw.store.ui.com");
    expect(products).toHaveLength(0);
  });
});
