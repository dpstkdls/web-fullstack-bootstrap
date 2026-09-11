import { parseEnv } from "@repo/lib/env";
import { z } from "zod";

// 부팅 시 1회 파싱 — 잘못된 배포는 여기서 즉시 죽는다 (스펙 §8)
export const env = parseEnv({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/webseed_dev"),
  BETTER_AUTH_SECRET: z.string().default("dev-secret-change-me"),
  BETTER_AUTH_URL: z.string().default("http://localhost:3001"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
});
