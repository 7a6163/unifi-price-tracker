import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2024-09-23",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        bindings: { STORE_BASE: "https://tw.store.ui.com" },
      },
    }),
  ],
  test: {},
});
