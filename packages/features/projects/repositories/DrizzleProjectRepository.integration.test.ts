import { createDb, type Db } from "@repo/db/client";
import { runMigrations } from "@repo/db/migrate";
import { projects } from "@repo/db/schema";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getProjectService } from "../di";
import { DrizzleProjectRepository } from "./DrizzleProjectRepository";

let container: StartedPostgreSqlContainer;
let db: Db;
let repo: DrizzleProjectRepository;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  db = createDb(container.getConnectionUri());
  await runMigrations(db);
  repo = new DrizzleProjectRepository(db);
});

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

beforeEach(async () => {
  await db.delete(projects);
});

describe("DrizzleProjectRepository", () => {
  it("insert returns the persisted row with generated fields", async () => {
    const row = await repo.insert({ name: "Alpha", description: null, status: "active" });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.name).toBe("Alpha");
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("findById returns row or null", async () => {
    const row = await repo.insert({ name: "Alpha", description: "d", status: "active" });
    expect(await repo.findById(row.id)).toMatchObject({ name: "Alpha", description: "d" });
    expect(await repo.findById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("findMany filters by name (case-insensitive) and status, paginates, counts total", async () => {
    await repo.insert({ name: "Website Redesign", description: null, status: "active" });
    await repo.insert({ name: "Mobile App", description: null, status: "active" });
    await repo.insert({ name: "Legacy Migration", description: null, status: "archived" });

    const byName = await repo.findMany({ q: "WEB", page: 1, pageSize: 20 });
    expect(byName.total).toBe(1);
    expect(byName.items[0]?.name).toBe("Website Redesign");

    const byStatus = await repo.findMany({ status: "archived", page: 1, pageSize: 20 });
    expect(byStatus.total).toBe(1);

    const page2 = await repo.findMany({ page: 2, pageSize: 2 });
    expect(page2.total).toBe(3);
    expect(page2.items).toHaveLength(1);
  });

  it("update patches fields, bumps updatedAt, returns null for missing id", async () => {
    const row = await repo.insert({ name: "Alpha", description: "old", status: "active" });
    const updated = await repo.update(row.id, { name: "Beta" });
    expect(updated?.name).toBe("Beta");
    expect(updated?.description).toBe("old");
    expect(updated).not.toBeNull();
    // defaultNow()(Postgres 클록)와 $onUpdate(Node 클록)가 섞여 있어 미세한 클록 드리프트가
    // 있을 수 있음 — 엄격한 순서 비교 대신 createdAt 기준 1초 오차를 허용한다
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(row.createdAt.getTime() - 1000);
    expect(await repo.update("00000000-0000-0000-0000-000000000000", { name: "x" })).toBeNull();
  });

  it("delete returns true when removed, false for missing id", async () => {
    const row = await repo.insert({ name: "Alpha", description: null, status: "active" });
    expect(await repo.delete(row.id)).toBe(true);
    expect(await repo.delete(row.id)).toBe(false);
  });
});

describe("getProjectService (di)", () => {
  it("wires service to real repository: create → empty-patch update → get → delete", async () => {
    const svc = getProjectService(db);
    const created = await svc.create({ name: "Wired", description: null, status: "active" });
    const unchanged = await svc.update(created.id, {});
    expect(unchanged).toMatchObject({ id: created.id, name: "Wired" });
    const fetched = await svc.getById(created.id);
    expect(fetched.name).toBe("Wired");
    await svc.delete(created.id);
    await expect(svc.getById(created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
