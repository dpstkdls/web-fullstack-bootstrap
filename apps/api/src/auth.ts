import { account, session, user, verification } from "@repo/db/auth-schema";
import type { Db } from "@repo/db/client";
import { getProfileService } from "@repo/features/profiles";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export function buildAuth(
  db: Db,
  opts: { secret: string; baseURL: string; trustedOrigins: string[]; secureCookies: boolean },
) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: { enabled: true },
    secret: opts.secret,
    baseURL: opts.baseURL,
    trustedOrigins: opts.trustedOrigins,
    advanced: { useSecureCookies: opts.secureCookies },
    databaseHooks: {
      user: {
        create: {
          // 가입 직후 프로필 자동 생성 — user insert는 better-auth 소유라 별도 트랜잭션 (스펙 §5 확정)
          after: async (createdUser) => {
            await getProfileService(db).ensureProfile(createdUser.id);
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof buildAuth>;
