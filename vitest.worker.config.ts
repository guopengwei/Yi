import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("./migrations");

export default defineConfig({
  plugins: [cloudflareTest({
    main: "./worker/index.ts",
    wrangler: { configPath: "./wrangler.jsonc" },
    miniflare: {
      bindings: {
        TEST_MIGRATIONS: migrations,
        BETTER_AUTH_SECRET: "9f21b532518c71a903fb95c66a16b3ccedc8648d24b3ecda7b7753cfec4279cf",
        SHARE_SIGNING_KEY: "share-test-secret-share-test-secret",
        TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
        STRIPE_SECRET_KEY: "sk_test_yi_worker_tests",
        STRIPE_WEBHOOK_SECRET: "whsec_yi_worker_tests",
      },
    },
  })],
  test: {
    include: ["tests-worker/**/*.test.ts"],
  },
});
