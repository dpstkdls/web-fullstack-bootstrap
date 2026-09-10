import { parseEnv } from "@repo/lib/env";
import { z } from "zod";
import { createDb } from "./client";
import { projects } from "./schema";

const env = parseEnv({
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/webseed_dev"),
});

// 씨앗 레포 특성상 그대로 복제됨 — 운영 DB를 향한 실수 한 번을 막는 마지막 가드
if (process.env.NODE_ENV === "production") {
  throw new Error("seed is dev-only: refusing to run with NODE_ENV=production");
}

const SEED_PROJECTS = [
  { name: "Website Redesign", description: "Marketing site refresh", status: "active" as const },
  { name: "Mobile App", description: "iOS/Android companion app", status: "active" as const },
  { name: "Legacy Migration", description: "Retired 2025", status: "archived" as const },
];

const db = createDb(env.DATABASE_URL);

// dev 전용 시드 — 삭제 후 재삽입이 upsert보다 단순하고 항상 같은 끝상태를 보장
await db.delete(projects);
await db.insert(projects).values(SEED_PROJECTS);

console.log(`seeded ${SEED_PROJECTS.length} projects`);
await db.$client.end();
