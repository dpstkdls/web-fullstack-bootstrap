import type { AppRouter } from "@repo/api";
import { user } from "@repo/db/auth-schema";
import { createDb, type Db } from "@repo/db/client";
import { runMigrations } from "@repo/db/migrate";
import { profiles } from "@repo/db/schema";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Auth, buildAuth } from "./auth";
import { buildServer } from "./server";

// 고정 포트: listen 전에 auth baseURL이 필요해 port 0(random)을 쓸 수 없다
const PORT = 3987;
const BASE = `http://127.0.0.1:${PORT}`;

let container: StartedPostgreSqlContainer;
let db: Db;
let auth: Auth;
let server: Awaited<ReturnType<typeof buildServer>>;
let cookie = "";

function trpc(cookieHeader: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${BASE}/api/trpc`,
        transformer: superjson,
        headers: { cookie: cookieHeader },
      }),
    ],
  });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  db = createDb(container.getConnectionUri());
  await runMigrations(db);
  auth = buildAuth(db, {
    secret: "test-secret",
    baseURL: BASE,
    trustedOrigins: [BASE],
    secureCookies: false,
  });
  server = await buildServer({ db, auth });
  await server.listen({ port: PORT, host: "127.0.0.1" });
});

afterAll(async () => {
  await server.close();
  await db.$client.end();
  await container.stop();
});

describe("api server", () => {
  it("healthz responds", async () => {
    const res = await fetch(`${BASE}/healthz`);
    expect(res.status).toBe(200);
  });

  it("sign-up creates user AND auto-creates profile via hook", async () => {
    const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "it@example.com", password: "password1234", name: "IT" }),
    });
    expect(res.status).toBe(200);
    cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).not.toBe("");

    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, "it@example.com"));
    expect(u).toBeDefined();
    const [p] = await db.select().from(profiles).where(eq(profiles.userId, u!.id));
    expect(p?.locale).toBe("ko");
  });

  it("authenticated trpc: project CRUD and profile round-trip", async () => {
    const client = trpc(cookie);
    const created = await client.projects.create.mutate({
      name: "From tRPC",
      description: null,
      status: "active",
    });
    expect(created.name).toBe("From tRPC");

    const listed = await client.projects.list.query({ page: 1, pageSize: 20 });
    expect(listed.items.map((i) => i.id)).toContain(created.id);
    expect(listed.items[0]?.createdAt).toBeInstanceOf(Date); // superjson round-trip

    const me = await client.profile.get.query();
    const updatedMe = await client.profile.update.mutate({ displayName: "IT", locale: "en" });
    expect(me.locale).toBe("ko");
    expect(updatedMe).toMatchObject({ displayName: "IT", locale: "en" });
  });

  it("unauthenticated trpc call is UNAUTHORIZED", async () => {
    const anon = trpc("");
    await expect(anon.projects.list.query({ page: 1, pageSize: 20 })).rejects.toMatchObject({
      data: { code: "UNAUTHORIZED" },
    });
  });

  it("sign-in with wrong password fails", async () => {
    const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "it@example.com", password: "wrong" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
