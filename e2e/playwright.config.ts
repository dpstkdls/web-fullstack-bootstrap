import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000" },
  // DB는 선행 조건: pnpm db:up && pnpm db:migrate (루트 e2e 스크립트가 체인)
  webServer: [
    {
      command: "pnpm --filter api exec tsx src/index.ts",
      url: "http://localhost:3001/healthz",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter web dev",
      url: "http://localhost:3000/login",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
