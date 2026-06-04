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
});
