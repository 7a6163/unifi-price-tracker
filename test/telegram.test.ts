import { describe, it, expect } from "vitest";
import { formatMessage } from "../src/telegram";
import type { Changes } from "../src/types";

describe("formatMessage", () => {
  it("renders drops and new items with links and escapes HTML", () => {
    const changes: Changes = {
      drops: [{
        product: { sku: "u7", name: "U7 Pro", category: "all-wifi", url: "https://s/u7", price: 5999 },
        oldPrice: 6899, newPrice: 5999, pctChange: -13,
      }],
      newItems: [{ sku: "x", name: "A & B", category: "all-wifi", url: "https://s/x", price: 1000 }],
    };
    const msg = formatMessage(changes, "2026-06-03 14:00");
    expect(msg).toContain('<a href="https://s/u7">U7 Pro</a>');
    expect(msg).toContain("NT$6,899");
    expect(msg).toContain("NT$5,999");
    expect(msg).toContain("-13%");
    expect(msg).toContain("A &amp; B"); // HTML-escaped
    expect(msg).toContain("(新上架)");
  });
});
