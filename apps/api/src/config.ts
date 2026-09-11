import type { env } from "./env";

// index.ts와 seed.ts가 동일한 auth 옵션 구성 로직을 중복하지 않도록 여기서 한 번만 정의
export function authOptionsFromEnv(e: typeof env) {
  return {
    secret: e.BETTER_AUTH_SECRET,
    baseURL: e.BETTER_AUTH_URL,
    trustedOrigins: [e.WEB_ORIGIN],
    secureCookies: e.NODE_ENV === "production",
  };
}
