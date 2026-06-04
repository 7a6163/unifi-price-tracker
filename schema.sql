CREATE TABLE IF NOT EXISTS products (
  sku           TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  url           TEXT NOT NULL,
  current_price INTEGER NOT NULL,
  last_seen_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sku         TEXT NOT NULL,
  price       INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  FOREIGN KEY (sku) REFERENCES products(sku)
);

CREATE INDEX IF NOT EXISTS idx_history_sku_time ON price_history (sku, observed_at);
