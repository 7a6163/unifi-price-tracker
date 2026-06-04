# UniFi 台灣商店降價追蹤器

每 6 小時抓取 https://tw.store.ui.com 全店價格，存進 Cloudflare D1，
偵測到降價或新品時用 Telegram 推播（含商品連結）。

## 設定

1. 安裝依賴：`npm install`
2. 建 D1：`npx wrangler d1 create unifi-price-tracker`
   把回傳的 `database_id` 填進 `wrangler.toml`。
3. 套用 schema：`npx wrangler d1 execute unifi-price-tracker --remote --file=schema.sql`
4. 建 Telegram bot：在 Telegram 找 @BotFather → `/newbot` → 取得 token。
5. 取得你的 chat id：把 bot 加入對話並發一則訊息，開
   `https://api.telegram.org/bot<token>/getUpdates` 看 `chat.id`。
6. 設定 secrets：
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   ```
7. 部署：`npx wrangler deploy`

## 本地測試

```bash
npm test          # 單元 + 整合測試（vitest，跑在 Cloudflare workers pool）
npm run typecheck
```

手動觸發排程（本地）：`npx wrangler dev --test-scheduled`，
再呼叫 `curl "http://localhost:8787/__scheduled?cron=0+*/6+*+*+*"`。

## 運作方式

1. **scrape** — 抓 8 個分類頁，從 Next.js `__NEXT_DATA__` JSON 解析出商品（`src/scraper.ts`）。
2. **compare** — 跟 D1 中每個 sku 的最新價格比對，純函式判定降價/新品（`src/detector.ts`）。
3. **persist** — 價格有變動才寫一筆 `price_history`，並 upsert `products`（`src/store.ts`）。
4. **notify** — 有降價或新品就發一則 Telegram HTML 訊息，商品名稱可點（`src/telegram.ts`）。

## 注意

- 本 repo 為 public，**不含任何密鑰**；token / chat id 只存在 Worker secrets。
- 第一次執行只會「靜默」把全店商品寫入 DB（不推播），之後才開始比價通知。
- 韌性保護：若某分類解析到 0 件、或全店商品數驟降（疑似改版），會發 `⚠️` 管理訊息提醒，
  而不是誤推一堆通知。請更新 `src/scraper.ts` 的解析規則並重抓 `test/fixtures/all-wifi.html`。
