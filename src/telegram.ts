import type { Changes, Env } from "./types";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function nt(price: number): string {
  return "NT$" + price.toLocaleString("en-US");
}

export function formatMessage(changes: Changes, when: string): string {
  const lines: string[] = ["🔔 UniFi 台灣商店價格通知", ""];
  for (const d of changes.drops) {
    const link = `<a href="${escapeHtml(d.product.url)}">${escapeHtml(d.product.name)}</a>`;
    lines.push(`📉 ${link}  ${nt(d.oldPrice)} → ${nt(d.newPrice)}  (${d.pctChange}%)`);
  }
  for (const p of changes.newItems) {
    const link = `<a href="${escapeHtml(p.url)}">${escapeHtml(p.name)}</a>`;
    lines.push(`🆕 ${link}  ${nt(p.price)}  (新上架)`);
  }
  lines.push("", `🕐 ${when} (Asia/Taipei)`);
  return lines.join("\n");
}

async function send(env: Env, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = JSON.stringify({
    chat_id: env.TELEGRAM_CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  const opts = { method: "POST", headers: { "content-type": "application/json" }, body };
  const res = await fetch(url, opts);
  if (!res.ok) {
    const retry = await fetch(url, opts); // retry once
    if (!retry.ok) console.error(`Telegram send failed: ${retry.status} ${await retry.text()}`);
  }
}

export async function notify(env: Env, changes: Changes, when: string): Promise<void> {
  if (changes.drops.length === 0 && changes.newItems.length === 0) return;
  await send(env, formatMessage(changes, when));
}

export async function sendAdminAlert(env: Env, message: string): Promise<void> {
  await send(env, `⚠️ ${escapeHtml(message)}`);
}
