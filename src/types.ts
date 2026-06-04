export interface ScrapedProduct {
  sku: string;        // stable key (product slug if no explicit sku)
  name: string;
  category: string;   // category slug, e.g. "all-wifi"
  url: string;        // absolute product page URL
  price: number;      // integer NT$, no decimals
}

export interface Product {
  sku: string;
  name: string;
  category: string;
  url: string;
  currentPrice: number;
  lastSeenAt: string; // ISO 8601
}

export interface PriceDrop {
  product: ScrapedProduct;
  oldPrice: number;
  newPrice: number;
  pctChange: number;  // negative integer, e.g. -13
}

export interface Changes {
  drops: PriceDrop[];
  newItems: ScrapedProduct[];
}

export interface Env {
  DB: D1Database;
  STORE_BASE: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
}
