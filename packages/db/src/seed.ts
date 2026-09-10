import { parseEnv } from "@repo/lib/env";
import { z } from "zod";
import { createDb } from "./client";
import { projects } from "./schema";

const env = parseEnv({
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/webseed_dev"),
});

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
