import type { Product, ScrapedProduct } from "./types";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS products (
     sku TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
     url TEXT NOT NULL, current_price INTEGER NOT NULL, last_seen_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS price_history (
     id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL, price INTEGER NOT NULL,
     observed_at TEXT NOT NULL, FOREIGN KEY (sku) REFERENCES products(sku))`,
  `CREATE INDEX IF NOT EXISTS idx_history_sku_time ON price_history (sku, observed_at)`,
];

export async function applySchema(db: D1Database): Promise<void> {
  for (const stmt of SCHEMA) await db.exec(stmt.replace(/\s+/g, " "));
}

export async function getLatestPrices(db: D1Database): Promise<Map<string, Product>> {
  const { results } = await db.prepare(
    "SELECT sku, name, category, url, current_price, last_seen_at FROM products",
  ).all<{ sku: string; name: string; category: string; url: string; current_price: number; last_seen_at: string }>();
  const map = new Map<string, Product>();
  for (const r of results) {
    map.set(r.sku, {
      sku: r.sku, name: r.name, category: r.category, url: r.url,
      currentPrice: r.current_price, lastSeenAt: r.last_seen_at,
    });
  }
  return map;
}

export async function persist(db: D1Database, scraped: ScrapedProduct[], now: string): Promise<void> {
  const prev = await getLatestPrices(db);
  const statements: D1PreparedStatement[] = [];
  for (const item of scraped) {
    const prior = prev.get(item.sku);
    const changed = !prior || prior.currentPrice !== item.price;
    // products upsert first (satisfies FK), then history if changed.
    statements.push(
      db.prepare(
        `INSERT INTO products (sku, name, category, url, current_price, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(sku) DO UPDATE SET
           name=excluded.name, category=excluded.category, url=excluded.url,
           current_price=excluded.current_price, last_seen_at=excluded.last_seen_at`,
      ).bind(item.sku, item.name, item.category, item.url, item.price, now),
    );
    if (changed) {
      statements.push(
        db.prepare("INSERT INTO price_history (sku, price, observed_at) VALUES (?, ?, ?)")
          .bind(item.sku, item.price, now),
      );
    }
  }
  if (statements.length > 0) await db.batch(statements);
}
