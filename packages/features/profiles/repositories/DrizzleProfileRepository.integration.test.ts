import { randomUUID } from "node:crypto";
import { user } from "@repo/db/auth-schema";
import { createDb, type Db } from "@repo/db/client";
import { runMigrations } from "@repo/db/migrate";
import { profiles } from "@repo/db/schema";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getProfileService } from "../di";

let container: StartedPostgreSqlContainer;
let db: Db;

async function insertUser(): Promise<string> {
  const id = randomUUID();
  await db.insert(user).values({ id, name: "Tester", email: `${id}@example.com` });
  return id;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  db = createDb(container.getConnectionUri());
  await runMigrations(db);
});

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

beforeEach(async () => {
  await db.delete(profiles);
  await db.delete(user);
});

describe("DrizzleProfileRepository via ProfileService (di)", () => {
  it("ensureProfile creates in a transaction and is idempotent against real DB", async () => {
    const userId = await insertUser();
    const svc = getProfileService(db);
    const first = await svc.ensureProfile(userId);
    const second = await svc.ensureProfile(userId);
    expect(first.userId).toBe(userId);
    expect(first.locale).toBe("ko");
    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
  });

  it("update persists patch; FK cascade removes profile with user", async () => {
    const userId = await insertUser();
    const svc = getProfileService(db);
    await svc.ensureProfile(userId);
    const updated = await svc.update(userId, { displayName: "Chang", locale: "en" });
    expect(updated).toMatchObject({ displayName: "Chang", locale: "en" });

    await db.delete(user); // cascade
    await expect(svc.getByUserId(userId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
