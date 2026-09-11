import { user } from "@repo/db/auth-schema";
import { createDb } from "@repo/db/client";
import { eq } from "drizzle-orm";
import { buildAuth } from "./auth";
import { env } from "./env";

// 패스워드 해시는 better-auth 소유 — 계정 시드는 db 패키지가 아니라 여기서 (plan 확정 결정 1)
if (process.env.NODE_ENV === "production") {
  throw new Error("seed is dev-only: refusing to run with NODE_ENV=production");
}

const TEST_EMAIL = "test@example.com";
const TEST_PASSWORD = "password1234";

const db = createDb(env.DATABASE_URL);
const auth = buildAuth(db, {
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.WEB_ORIGIN],
});

const existing = await db
  .select({ id: user.id })
  .from(user)
  .where(eq(user.email, TEST_EMAIL))
  .limit(1);
if (existing.length === 0) {
  await auth.api.signUpEmail({
    body: { email: TEST_EMAIL, password: TEST_PASSWORD, name: "Test User" },
  });
  console.log(`seeded test account ${TEST_EMAIL} / ${TEST_PASSWORD}`);
} else {
  console.log("test account already exists");
}
await db.$client.end();
