import type { Changes, Env, ScrapedProduct } from "./types";
import { scrapeAll } from "./scraper";
import { applySchema, getLatestPrices, persist } from "./store";
import { detectChanges } from "./detector";
import { notify as tgNotify, sendAdminAlert } from "./telegram";

export interface Deps {
  scrape: (env: Env) => Promise<{ products: ScrapedProduct[]; failures: string[] }>;
  notify: (env: Env, changes: Changes, when: string) => Promise<void>;
  adminAlert: (env: Env, message: string) => Promise<void>;
}

const DEFAULT_DEPS: Deps = { scrape: scrapeAll, notify: tgNotify, adminAlert: sendAdminAlert };

function taipeiStamp(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(d).replace("T", " ");
}

// Telegram delivery must never abort the scheduled run; log and continue.
async function safeAlert(deps: Deps, env: Env, message: string): Promise<void> {
  try {
    await deps.adminAlert(env, message);
  } catch (err) {
    console.error("admin alert failed:", err instanceof Error ? err.message : String(err));
  }
}

export async function runOnce(env: Env, nowIso: string, deps: Deps = DEFAULT_DEPS): Promise<void> {
  if (!env.STORE_BASE) throw new Error("STORE_BASE not configured");
  await applySchema(env.DB); // idempotent; avoids a confusing first-run crash if schema not applied

  const { products, failures } = await deps.scrape(env);
  for (const f of failures) console.error("scrape failure:", f);

  // Scraped nothing at all -> alert and bail (do NOT treat as "everything delisted").
  if (products.length === 0) {
    await safeAlert(deps, env, `抓取失敗，無任何商品。失敗清單：${failures.join("; ")}`);
    return;
  }

  const previous = await getLatestPrices(env.DB);
  const knownCount = previous.size;

  // Guard against a partial scrape causing a false "new item" / drop flood.
  if (knownCount > 0 && products.length < knownCount * 0.5) {
    await persist(env.DB, products, previous, nowIso); // record what we saw
    await safeAlert(deps, env, `本次抓到 ${products.length} 件，遠少於已知 ${knownCount} 件，疑似改版/部分失敗，已記錄價格但略過本批通知。`);
    return;
  }

  const changes = detectChanges(products, previous);
  await persist(env.DB, products, previous, nowIso);

  // First-ever run (empty DB): every product is "new" — seed silently, don't spam.
  if (knownCount === 0) return;

  try {
    await deps.notify(env, changes, taipeiStamp(nowIso));
  } catch (err) {
    console.error("notify failed:", err instanceof Error ? err.message : String(err));
  }

  if (failures.length > 0) {
    await safeAlert(deps, env, `部分分類抓取失敗：${failures.join("; ")}`);
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runOnce(env, new Date().toISOString());
  },
};
