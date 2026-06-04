import type { Changes, Env, ScrapedProduct } from "./types";
import { scrapeAll } from "./scraper";
import { getLatestPrices, persist } from "./store";
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

export async function runOnce(env: Env, nowIso: string, deps: Deps = DEFAULT_DEPS): Promise<void> {
  const { products, failures } = await deps.scrape(env);
  for (const f of failures) console.error("scrape failure:", f);

  // Scraped nothing at all -> alert and bail (do NOT treat as "everything delisted").
  if (products.length === 0) {
    await deps.adminAlert(env, `抓取失敗，無任何商品。失敗清單：${failures.join("; ")}`);
    return;
  }

  const previous = await getLatestPrices(env.DB);
  const knownCount = previous.size;

  // Guard against a partial scrape causing a false "new item" / drop flood.
  if (knownCount > 0 && products.length < knownCount * 0.5) {
    await deps.adminAlert(env, `本次抓到 ${products.length} 件，遠少於已知 ${knownCount} 件，疑似改版/部分失敗，略過本批通知。`);
    await persist(env.DB, products, nowIso); // still record what we saw
    return;
  }

  const changes = detectChanges(products, previous);
  await persist(env.DB, products, nowIso);

  // First-ever run (empty DB): every product is "new" — seed silently, don't spam.
  if (knownCount === 0) return;

  await deps.notify(env, changes, taipeiStamp(nowIso));

  if (failures.length > 0) {
    await deps.adminAlert(env, `部分分類抓取失敗：${failures.join("; ")}`);
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runOnce(env, new Date().toISOString());
  },
};
