# Phase 3: apps/api(Fastify) + packages/api(tRPC) + better-auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** better-auth(email+password)가 마운트된 Fastify API 서버와 tRPC 레이어(projects/profile 라우터, AppError→TRPCError 변환, protectedProcedure)를 세우고, 가입→프로필 자동생성→로그인→인증 CRUD 전체 여정을 testcontainers 통합 테스트로 그린으로 만든다.

**Architecture:** `apps/api`는 호스트 역할만(env 검증·부팅·better-auth/tRPC 마운트). `packages/api`가 tRPC 라우터 소유 — better-auth에 의존하지 않고 세션 **타입**만 받아 계층을 단순하게 유지(스펙 §4의 "context 생성 시 세션 조회"는 apps/api의 createContext 어댑터가 수행). 가입 시 프로필은 better-auth `databaseHooks`가 `features/profiles`의 서비스를 호출해 생성하며, 여기서 스펙 §5의 tx 주입 패턴을 시연한다.

**Tech Stack:** Fastify 5 · @trpc/server 11 + superjson · better-auth 1.x (Drizzle adapter) · 기존: Drizzle, zod 4, vitest, @testcontainers/postgresql, tsx

**Spec:** docs/superpowers/specs/2026-09-10-web-seed-design.md (§3 구조, §4 API·인증 흐름, §5 도메인 계층, §7 테스트)

## Global Constraints

- 의존 계층: `lib → db → features → api(packages/api) → apps/api`. 역방향 금지. **packages/api는 better-auth import 금지** (세션 타입만 정의)
- 내부 패키지 JIT (`exports` → TS 소스). apps/api도 dev는 tsx (tsup 번들은 Phase 5 Docker에서)
- 테스트 `TZ=UTC` (스크립트 레벨), conventional commits, 주석은 "왜"만
- 서비스/레포지토리는 `AppError(code, message)` throw. **라우터에서만 TRPCError 직접 사용 가능** (스펙 §4)
- **DTO 경계**: 라우터는 항상 `dto.parse()` 결과만 반환 — DB 타입이 웹으로 새는 것 차단 (스펙 §5)
- repository만 Drizzle 접촉, 필요한 컬럼만 select
- 테스트 계정: `test@example.com` / `password1234` (스펙 §11 시드 로그인용)
- 기본값: API 포트 3001, `BETTER_AUTH_URL=http://localhost:3001`, `WEB_ORIGIN=http://localhost:3000`, DATABASE_URL은 Phase 2 dev 기본값

**계획 확정 결정 (스펙 세부의 구현 단계 확정 — 리뷰 시 plan-mandated):**
1. 테스트 계정 시드는 `apps/api`의 `seed` 스크립트 소유 — 패스워드 해시는 better-auth 소유라 `packages/db` 시드로는 불가(스펙 §3의 시드 위치를 이 항목만 조정). 루트 `pnpm db:seed`가 db 시드 → api 시드 순으로 체인.
2. User+Profile "동시 생성"의 완전한 단일 트랜잭션은 불가 — better-auth가 user insert를 소유. 대신 가입 훅에서 `ProfileService.ensureProfile`이 존재확인+생성을 한 트랜잭션으로 묶어 **tx 주입 패턴**을 시연하고, 이 한계를 주석으로 명시 (스펙 §5 "상세는 구현 단계에서"의 확정).
3. projects/profile 라우터는 전부 `protectedProcedure` (예제 페이지가 로그인 후 시나리오).
4. Phase 2 이월 소액 수정 2건 포함: docker-compose 포트 `127.0.0.1` 바인딩(Task 1), CI timeout/concurrency(Task 5).

**이 Phase 범위 아님:** apps/web·Next rewrites 프록시·better-auth 클라이언트 SDK(Phase 4), tsup/Docker(Phase 5), `pnpm dev` 3서비스 오케스트레이션 완성(Phase 4 — 지금은 `pnpm db:up` 후 `turbo run dev`로 api만).

---

### Task 1: @repo/db 확장 — better-auth 스키마 + profiles + tx 타입

**Files:**
- Create: `packages/db/src/auth-schema.ts`
- Modify: `packages/db/src/schema.ts` (profiles 테이블 추가), `packages/db/src/client.ts` (DbTx/DbLike 타입), `packages/db/drizzle.config.ts` (schema 배열), `packages/db/package.json` (exports에 ./auth-schema), `packages/db/docker-compose.yml` (포트 바인딩)
- Create: `packages/db/drizzle/0001_*.sql` (drizzle-kit 생성물)

**Interfaces:**
- Consumes: Phase 2의 @repo/db 구조
- Produces:
  - `@repo/db/auth-schema` → `user`, `session`, `account`, `verification` (better-auth v1 표준 형태)
  - `@repo/db/schema` → 기존 projects + `profiles` 테이블
  - `@repo/db/client` → 기존 + `type DbTx`, `type DbLike = Db | DbTx`

- [ ] **Step 1: better-auth 표준 스키마 작성**

`packages/db/src/auth-schema.ts`:
```typescript
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// better-auth v1 코어 테이블 — 필드 구성은 better-auth Drizzle adapter 문서의 표준 형태.
// 임의 변경 금지: adapter가 부팅 시 필드 존재를 검증한다.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});
```

- [ ] **Step 2: profiles 테이블 + tx 타입 + 설정 갱신**

`packages/db/src/schema.ts` 끝에 추가 (기존 projects 유지):
```typescript
import { user } from "./auth-schema";
// (파일 상단 import에 병합: pgTable, text, timestamp, varchar는 기존 import 재사용)

export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 100 }),
  locale: varchar("locale", { length: 10 }).notNull().default("ko"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
```

`packages/db/src/client.ts` 끝에 추가:
```typescript
// 스펙 §5 tx 주입 패턴용: repository 메서드가 Db든 트랜잭션 tx든 받을 수 있게 하는 최소 타입
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbLike = Db | DbTx;
```

`packages/db/drizzle.config.ts`의 `schema` 값을 배열로 교체:
```typescript
  schema: ["./src/schema.ts", "./src/auth-schema.ts"],
```

`packages/db/package.json`의 `exports`에 추가:
```json
    "./auth-schema": "./src/auth-schema.ts"
```

`packages/db/docker-compose.yml` 포트를 로컬 바인딩으로 교체 (Phase 2 이월):
```yaml
    ports:
      - "127.0.0.1:5432:5432"
```

- [ ] **Step 3: 마이그레이션 생성 + 적용 검증**

```bash
pnpm i && pnpm type-check
pnpm --filter @repo/db db:generate
pnpm --filter @repo/db db:up && pnpm --filter @repo/db db:migrate
docker compose -f packages/db/docker-compose.yml exec postgres psql -U postgres -d webseed_dev -c "\d profiles" -c "\d \"user\""
```

Expected: `drizzle/0001_*.sql` 생성(CREATE TABLE user/session/account/verification/profiles 포함), 적용 성공, `\d` 출력에 두 테이블 컬럼 표시.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(db): add better-auth tables, profiles and tx types"
```

---

### Task 2: features/profiles 슬라이스 (TDD — 단위 + tx 패턴 + 통합)

**Files:**
- Create: `packages/features/profiles/dto.ts`, `packages/features/profiles/repositories/ProfileRepository.ts`, `packages/features/profiles/repositories/DrizzleProfileRepository.ts`, `packages/features/profiles/repositories/DrizzleProfileRepository.integration.test.ts`, `packages/features/profiles/services/ProfileService.ts`, `packages/features/profiles/services/ProfileService.test.ts`, `packages/features/profiles/di.ts`, `packages/features/profiles/index.ts`
- Modify: `packages/features/package.json` (exports에 ./profiles), `packages/features/tsconfig.json` (include에 profiles — 이미 "projects"만이면 배열에 추가)

**Interfaces:**
- Consumes: Task 1의 `profiles` 스키마·`user` 테이블·`DbLike`, `@repo/lib/errors`
- Produces (Task 3·4가 소비):
  - `ProfileRepository`: `findByUserId(userId: string, db?: DbLike): Promise<ProfileDto | null>` · `insert(userId: string, db?: DbLike): Promise<ProfileDto>` · `update(userId: string, input: UpdateProfileInput): Promise<ProfileDto | null>`
  - `ProfileService(db: Pick<Db, "transaction">, repo)`: `ensureProfile(userId)` (멱등, 트랜잭션) · `getByUserId(userId)` (NOT_FOUND) · `update(userId, input)` (NOT_FOUND, 빈 패치는 getByUserId)
  - `getProfileService(db: Db): ProfileService` (di)
  - `profileDtoSchema`, `updateProfileInputSchema` + 추론 타입

- [ ] **Step 1: 실패 단위 테스트 작성**

`packages/features/profiles/services/ProfileService.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import type { ProfileDto, UpdateProfileInput } from "../dto";
import type { ProfileRepository } from "../repositories/ProfileRepository";
import { ProfileService } from "./ProfileService";

class InMemoryProfileRepository implements ProfileRepository {
  rows = new Map<string, ProfileDto>();

  async findByUserId(userId: string) {
    return this.rows.get(userId) ?? null;
  }

  async insert(userId: string) {
    const now = new Date();
    const row: ProfileDto = {
      userId,
      displayName: null,
      locale: "ko",
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(userId, row);
    return row;
  }

  async update(userId: string, input: UpdateProfileInput) {
    const row = this.rows.get(userId);
    if (!row) return null;
    Object.assign(row, input, { updatedAt: new Date() });
    return row;
  }
}

// 트랜잭션 시맨틱은 통합 테스트가 검증 — 단위에선 콜백 통과만 재현
const fakeTxDb = { transaction: async <T>(fn: (tx: never) => Promise<T>) => fn(undefined as never) };

function makeService() {
  const repo = new InMemoryProfileRepository();
  return { svc: new ProfileService(fakeTxDb, repo), repo };
}

describe("ProfileService", () => {
  it("ensureProfile creates once and is idempotent", async () => {
    const { svc, repo } = makeService();
    const first = await svc.ensureProfile("u1");
    const second = await svc.ensureProfile("u1");
    expect(first.userId).toBe("u1");
    expect(second).toMatchObject({ userId: "u1", locale: "ko" });
    expect(repo.rows.size).toBe(1);
  });

  it("getByUserId throws NOT_FOUND for missing profile", async () => {
    const { svc } = makeService();
    await expect(svc.getByUserId("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("update patches fields; empty patch returns current row; missing id NOT_FOUND", async () => {
    const { svc } = makeService();
    await svc.ensureProfile("u1");
    const updated = await svc.update("u1", { displayName: "Chang" });
    expect(updated.displayName).toBe("Chang");
    const unchanged = await svc.update("u1", {});
    expect(unchanged.displayName).toBe("Chang");
    await expect(svc.update("nope", { locale: "en" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm --filter @repo/features test
```

Expected: FAIL — "Cannot find module '../dto'" (profiles 쪽). RED 출력을 리포트에 붙일 것.

- [ ] **Step 3: 구현**

`packages/features/profiles/dto.ts`:
```typescript
import { z } from "zod";

export const profileDtoSchema = z.object({
  userId: z.string(),
  displayName: z.string().nullable(),
  locale: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ProfileDto = z.infer<typeof profileDtoSchema>;

export const updateProfileInputSchema = z.object({
  displayName: z.string().min(1).max(100).nullable().optional(),
  locale: z.enum(["ko", "en"]).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
```

`packages/features/profiles/repositories/ProfileRepository.ts`:
```typescript
import type { DbLike } from "@repo/db/client";
import type { ProfileDto, UpdateProfileInput } from "../dto";

export interface ProfileRepository {
  findByUserId(userId: string, db?: DbLike): Promise<ProfileDto | null>;
  insert(userId: string, db?: DbLike): Promise<ProfileDto>;
  update(userId: string, input: UpdateProfileInput): Promise<ProfileDto | null>;
}
```

`packages/features/profiles/repositories/DrizzleProfileRepository.ts`:
```typescript
import { eq } from "drizzle-orm";
import type { Db, DbLike } from "@repo/db/client";
import { profiles } from "@repo/db/schema";
import type { ProfileDto, UpdateProfileInput } from "../dto";
import type { ProfileRepository } from "./ProfileRepository";

const profileColumns = {
  userId: profiles.userId,
  displayName: profiles.displayName,
  locale: profiles.locale,
  createdAt: profiles.createdAt,
  updatedAt: profiles.updatedAt,
};

export class DrizzleProfileRepository implements ProfileRepository {
  constructor(private readonly db: Db) {}

  // 스펙 §5 tx 주입: 트랜잭션 참여가 필요한 메서드는 tx를 받아 this.db 대신 사용
  async findByUserId(userId: string, db: DbLike = this.db): Promise<ProfileDto | null> {
    const rows = await db
      .select(profileColumns)
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async insert(userId: string, db: DbLike = this.db): Promise<ProfileDto> {
    const rows = await db.insert(profiles).values({ userId }).returning(profileColumns);
    if (!rows[0]) throw new Error("insert returned no row");
    return rows[0];
  }

  async update(userId: string, input: UpdateProfileInput): Promise<ProfileDto | null> {
    const rows = await this.db
      .update(profiles)
      .set(input)
      .where(eq(profiles.userId, userId))
      .returning(profileColumns);
    return rows[0] ?? null;
  }
}
```

`packages/features/profiles/services/ProfileService.ts`:
```typescript
import { AppError } from "@repo/lib/errors";
import type { Db } from "@repo/db/client";
import type { ProfileDto, UpdateProfileInput } from "../dto";
import type { ProfileRepository } from "../repositories/ProfileRepository";

export class ProfileService {
  constructor(
    private readonly db: Pick<Db, "transaction">,
    private readonly repo: ProfileRepository,
  ) {}

  // 가입 훅에서 호출. better-auth가 user insert를 소유하므로 user와의 완전한 단일 트랜잭션은
  // 불가 — 존재확인+생성을 한 트랜잭션으로 묶어 중복 생성만 방지한다 (tx 주입 패턴 시연).
  async ensureProfile(userId: string): Promise<ProfileDto> {
    return this.db.transaction(async (tx) => {
      const existing = await this.repo.findByUserId(userId, tx);
      if (existing) return existing;
      return this.repo.insert(userId, tx);
    });
  }

  async getByUserId(userId: string): Promise<ProfileDto> {
    const found = await this.repo.findByUserId(userId);
    if (!found) throw new AppError("NOT_FOUND", `profile for user ${userId} not found`);
    return found;
  }

  async update(userId: string, input: UpdateProfileInput): Promise<ProfileDto> {
    const patch = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    ) as UpdateProfileInput;
    if (Object.keys(patch).length === 0) return this.getByUserId(userId);
    const updated = await this.repo.update(userId, patch);
    if (!updated) throw new AppError("NOT_FOUND", `profile for user ${userId} not found`);
    return updated;
  }
}
```

`packages/features/profiles/di.ts`:
```typescript
import type { Db } from "@repo/db/client";
import { DrizzleProfileRepository } from "./repositories/DrizzleProfileRepository";
import { ProfileService } from "./services/ProfileService";

export function getProfileService(db: Db): ProfileService {
  return new ProfileService(db, new DrizzleProfileRepository(db));
}
```

`packages/features/profiles/index.ts`:
```typescript
export * from "./dto";
export { getProfileService } from "./di";
export type { ProfileRepository } from "./repositories/ProfileRepository";
export { DrizzleProfileRepository } from "./repositories/DrizzleProfileRepository";
export { ProfileService } from "./services/ProfileService";
```

`packages/features/package.json` `exports`에 추가:
```json
    "./profiles": "./profiles/index.ts"
```

`packages/features/tsconfig.json` include를 다음으로 교체:
```json
  "include": ["projects", "profiles", "vitest.config.ts", "vitest.integration.config.ts"]
```

- [ ] **Step 4: 단위 통과 확인**

```bash
pnpm --filter @repo/features test
```

Expected: profiles 3개 포함 10/10 PASS.

- [ ] **Step 5: 통합 테스트 작성 + 실행**

`packages/features/profiles/repositories/DrizzleProfileRepository.integration.test.ts`:
```typescript
import { randomUUID } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@repo/db/client";
import { runMigrations } from "@repo/db/migrate";
import { user } from "@repo/db/auth-schema";
import { profiles } from "@repo/db/schema";
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
```

```bash
pnpm --filter @repo/features test:integration && pnpm type-check
```

Expected: 통합 8/8 PASS (projects 6 + profiles 2), type-check 통과.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(features): add profiles slice with tx-injection pattern"
```

---

### Task 3: packages/api — tRPC 코어 + 라우터 + 단위 테스트 (TDD)

**Files:**
- Create: `packages/api/package.json`, `packages/api/tsconfig.json`, `packages/api/vitest.config.ts`, `packages/api/src/context.ts`, `packages/api/src/trpc.ts`, `packages/api/src/routers/projects.ts`, `packages/api/src/routers/profile.ts`, `packages/api/src/root.ts`, `packages/api/src/root.test.ts`

**Interfaces:**
- Consumes: `@repo/features/projects`·`@repo/features/profiles` (서비스·DTO·di), `@repo/lib/errors`
- Produces (Task 4·Phase 4가 소비):
  - `type Context = { session: { user: SessionUser } | null; services: {...} }`, `createContext(db, session)`
  - `appRouter`, `type AppRouter`, `createCaller` (테스트용)
  - superjson transformer 전제 — 클라이언트도 동일 transformer 필수

- [ ] **Step 1: 패키지 뼈대**

`packages/api/package.json`:
```json
{
  "name": "@repo/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/root.ts",
    "./context": "./src/context.ts"
  },
  "scripts": {
    "type-check": "tsc --noEmit",
    "test": "TZ=UTC vitest run"
  },
  "dependencies": {
    "@repo/db": "workspace:*",
    "@repo/features": "workspace:*",
    "@repo/lib": "workspace:*",
    "@trpc/server": "^11",
    "superjson": "^2",
    "zod": "^4"
  },
  "devDependencies": {
    "@repo/config": "workspace:*",
    "typescript": "^5",
    "vitest": "^3"
  }
}
```

`packages/api/tsconfig.json`:
```json
{
  "extends": "@repo/config/tsconfig.base.json",
  "include": ["src", "vitest.config.ts"]
}
```

`packages/api/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
```

```bash
pnpm i
```

- [ ] **Step 2: 실패 단위 테스트 작성**

`packages/api/src/root.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { AppError } from "@repo/lib/errors";
import type { ProjectDto } from "@repo/features/projects";
import type { ProfileService, ProjectService } from "./context";
import type { Context } from "./context";
import { appRouter, createCaller } from "./root";

const now = new Date();
const FAKE_PROJECT: ProjectDto = {
  id: "3f1e2d3c-0000-4000-8000-000000000001",
  name: "Alpha",
  description: null,
  status: "active",
  createdAt: now,
  updatedAt: now,
};

function ctxWith(overrides: {
  session?: Context["session"];
  projects?: Partial<ProjectService>;
  profiles?: Partial<ProfileService>;
}): Context {
  return {
    session: overrides.session ?? { user: { id: "u1", email: "t@e.com", name: "T" } },
    services: {
      projects: (overrides.projects ?? {}) as ProjectService,
      profiles: (overrides.profiles ?? {}) as ProfileService,
    },
  };
}

describe("appRouter", () => {
  it("rejects unauthenticated calls with UNAUTHORIZED", async () => {
    const caller = createCaller(ctxWith({ session: null }));
    await expect(caller.projects.list({ page: 1, pageSize: 20 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("maps AppError NOT_FOUND from service to TRPCError NOT_FOUND", async () => {
    const caller = createCaller(
      ctxWith({
        projects: {
          getById: async () => {
            throw new AppError("NOT_FOUND", "project x not found");
          },
        },
      }),
    );
    await expect(caller.projects.byId({ id: FAKE_PROJECT.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("enforces DTO boundary: extra service fields never leave the router", async () => {
    const leaking = { ...FAKE_PROJECT, secretColumn: "leak" };
    const caller = createCaller(
      ctxWith({ projects: { getById: async () => leaking as ProjectDto } }),
    );
    const result = await caller.projects.byId({ id: FAKE_PROJECT.id });
    expect(result).not.toHaveProperty("secretColumn");
    expect(result.name).toBe("Alpha");
  });

  it("profile.get returns own profile from session user", async () => {
    const caller = createCaller(
      ctxWith({
        profiles: {
          getByUserId: async (userId: string) => ({
            userId,
            displayName: null,
            locale: "ko",
            createdAt: now,
            updatedAt: now,
          }),
        },
      }),
    );
    const profile = await caller.profile.get();
    expect(profile.userId).toBe("u1");
  });
});
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm --filter @repo/api test
```

Expected: FAIL — "Cannot find module './root'" (또는 './context'). RED 출력 리포트에 기록.

- [ ] **Step 4: 구현**

`packages/api/src/context.ts`:
```typescript
import type { Db } from "@repo/db/client";
import { getProjectService, ProjectService } from "@repo/features/projects";
import { getProfileService, ProfileService } from "@repo/features/profiles";

export type { ProjectService, ProfileService };

// better-auth 타입에 의존하지 않는 최소 세션 형태 — apps/api 어댑터가 채워 넣는다
export type SessionUser = { id: string; email: string; name: string };

export type Context = {
  session: { user: SessionUser } | null;
  services: { projects: ProjectService; profiles: ProfileService };
};

export function createContext(db: Db, session: Context["session"]): Context {
  return {
    session,
    services: { projects: getProjectService(db), profiles: getProfileService(db) },
  };
}
```

`packages/api/src/trpc.ts`:
```typescript
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { AppError, type AppErrorCode } from "@repo/lib/errors";
import type { Context } from "./context";

const CODE_MAP: Record<AppErrorCode, TRPCError["code"]> = {
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  BAD_REQUEST: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  UNAUTHORIZED: "UNAUTHORIZED",
  INTERNAL: "INTERNAL_SERVER_ERROR",
};

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

// 서비스 층은 tRPC를 모른다(스펙 §4) — AppError가 여기서 tRPC 코드로 번역된다
const appErrorToTrpc = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof AppError) {
    const appError = result.error.cause;
    throw new TRPCError({
      code: CODE_MAP[appError.code],
      message: appError.message,
      cause: appError,
    });
  }
  return result;
});

export const publicProcedure = t.procedure.use(appErrorToTrpc);

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, session: ctx.session } });
});
```

`packages/api/src/routers/projects.ts`:
```typescript
import { z } from "zod";
import {
  createProjectInputSchema,
  listProjectsQuerySchema,
  projectDtoSchema,
  updateProjectInputSchema,
} from "@repo/features/projects";
import { protectedProcedure, router } from "../trpc";

export const projectsRouter = router({
  list: protectedProcedure.input(listProjectsQuerySchema).query(async ({ ctx, input }) => {
    const page = await ctx.services.projects.list(input);
    return { ...page, items: page.items.map((item) => projectDtoSchema.parse(item)) };
  }),

  byId: protectedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    return projectDtoSchema.parse(await ctx.services.projects.getById(input.id));
  }),

  create: protectedProcedure.input(createProjectInputSchema).mutation(async ({ ctx, input }) => {
    return projectDtoSchema.parse(await ctx.services.projects.create(input));
  }),

  update: protectedProcedure
    .input(z.object({ id: z.uuid(), patch: updateProjectInputSchema }))
    .mutation(async ({ ctx, input }) => {
      return projectDtoSchema.parse(await ctx.services.projects.update(input.id, input.patch));
    }),

  delete: protectedProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.services.projects.delete(input.id);
    return { id: input.id };
  }),
});
```

`packages/api/src/routers/profile.ts`:
```typescript
import { profileDtoSchema, updateProfileInputSchema } from "@repo/features/profiles";
import { protectedProcedure, router } from "../trpc";

export const profileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    return profileDtoSchema.parse(await ctx.services.profiles.getByUserId(ctx.session.user.id));
  }),

  update: protectedProcedure.input(updateProfileInputSchema).mutation(async ({ ctx, input }) => {
    return profileDtoSchema.parse(await ctx.services.profiles.update(ctx.session.user.id, input));
  }),
});
```

`packages/api/src/root.ts`:
```typescript
import { profileRouter } from "./routers/profile";
import { projectsRouter } from "./routers/projects";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({
  projects: projectsRouter,
  profile: profileRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
export { createContext, type Context, type SessionUser } from "./context";
```

- [ ] **Step 5: 통과 + 타입체크**

```bash
pnpm --filter @repo/api test && pnpm type-check
```

Expected: 4/4 PASS, type-check 통과.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(api): add trpc routers with app-error mapping and dto boundary"
```

---

### Task 4: apps/api — Fastify 호스트 + better-auth + 시드

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/env.ts`, `apps/api/src/auth.ts`, `apps/api/src/server.ts`, `apps/api/src/index.ts`, `apps/api/src/seed.ts`
- Modify: 루트 `package.json` (db:seed 체인)

**Interfaces:**
- Consumes: `@repo/api`(appRouter·createContext), `@repo/db`(createDb·auth-schema), `@repo/features/profiles`(getProfileService), `@repo/lib/env`
- Produces: `buildAuth(db, opts)`, `buildServer({ db, auth })` (Task 5 통합 테스트가 소비), `pnpm --filter api dev|seed`, 테스트 계정 `test@example.com`/`password1234`

- [ ] **Step 1: 패키지 뼈대 + env**

`apps/api/package.json`:
```json
{
  "name": "api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "type-check": "tsc --noEmit",
    "test:integration": "TZ=UTC vitest run --config vitest.integration.config.ts",
    "seed": "tsx src/seed.ts"
  },
  "dependencies": {
    "@repo/api": "workspace:*",
    "@repo/db": "workspace:*",
    "@repo/features": "workspace:*",
    "@repo/lib": "workspace:*",
    "@trpc/server": "^11",
    "better-auth": "^1",
    "drizzle-orm": "^0.44.7",
    "fastify": "^5",
    "zod": "^4"
  },
  "devDependencies": {
    "@repo/config": "workspace:*",
    "@testcontainers/postgresql": "^11",
    "@trpc/client": "^11",
    "superjson": "^2",
    "tsx": "^4",
    "typescript": "^5",
    "vitest": "^3"
  }
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "@repo/config/tsconfig.base.json",
  "include": ["src", "vitest.integration.config.ts"]
}
```

`apps/api/src/env.ts`:
```typescript
import { z } from "zod";
import { parseEnv } from "@repo/lib/env";

// 부팅 시 1회 파싱 — 잘못된 배포는 여기서 즉시 죽는다 (스펙 §8)
export const env = parseEnv({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z
    .string()
    .default("postgresql://postgres:postgres@localhost:5432/webseed_dev"),
  BETTER_AUTH_SECRET: z.string().default("dev-secret-change-me"),
  BETTER_AUTH_URL: z.string().default("http://localhost:3001"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
});
```

- [ ] **Step 2: auth + server 구현**

`apps/api/src/auth.ts`:
```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { account, session, user, verification } from "@repo/db/auth-schema";
import type { Db } from "@repo/db/client";
import { getProfileService } from "@repo/features/profiles";

export function buildAuth(
  db: Db,
  opts: { secret: string; baseURL: string; trustedOrigins: string[] },
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
```

`apps/api/src/server.ts`:
```typescript
import Fastify from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { fromNodeHeaders } from "better-auth/node";
import { appRouter, createContext } from "@repo/api";
import type { Db } from "@repo/db/client";
import type { Auth } from "./auth";

export async function buildServer(deps: { db: Db; auth: Auth }) {
  const server = Fastify({ logger: true });

  server.get("/healthz", async () => ({ ok: true }));

  // better-auth는 web-standard Request/Response — Fastify req/reply를 수동 변환해 마운트
  server.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value) headers.append(key, value.toString());
      }
      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
      const response = await deps.auth.handler(req);
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.send(response.body ? await response.text() : null);
    },
  });

  await server.register(fastifyTRPCPlugin, {
    prefix: "/api/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: async ({ req }: { req: { headers: Record<string, unknown> } }) => {
        const session = await deps.auth.api.getSession({
          headers: fromNodeHeaders(req.headers as never),
        });
        return createContext(
          deps.db,
          session
            ? {
                user: {
                  id: session.user.id,
                  email: session.user.email,
                  name: session.user.name,
                },
              }
            : null,
        );
      },
    },
  });

  return server;
}
```

`apps/api/src/index.ts`:
```typescript
import { createDb } from "@repo/db/client";
import { buildAuth } from "./auth";
import { env } from "./env";
import { buildServer } from "./server";

const db = createDb(env.DATABASE_URL);
const auth = buildAuth(db, {
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.WEB_ORIGIN],
});
const server = await buildServer({ db, auth });
await server.listen({ port: env.PORT, host: "0.0.0.0" });
```

- [ ] **Step 3: 테스트 계정 시드**

`apps/api/src/seed.ts`:
```typescript
import { eq } from "drizzle-orm";
import { user } from "@repo/db/auth-schema";
import { createDb } from "@repo/db/client";
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

const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, TEST_EMAIL)).limit(1);
if (existing.length === 0) {
  await auth.api.signUpEmail({
    body: { email: TEST_EMAIL, password: TEST_PASSWORD, name: "Test User" },
  });
  console.log(`seeded test account ${TEST_EMAIL} / ${TEST_PASSWORD}`);
} else {
  console.log("test account already exists");
}
await db.$client.end();
```

루트 `package.json`의 `db:seed`를 체인으로 교체:
```json
    "db:seed": "pnpm --filter @repo/db db:seed && pnpm --filter api seed",
```

- [ ] **Step 4: 부팅 스모크 검증 (로컬 dev DB)**

```bash
pnpm i && pnpm type-check
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm --filter api exec tsx src/index.ts &
sleep 3
curl -sf http://localhost:3001/healthz
curl -si -X POST http://localhost:3001/api/auth/sign-in/email \
  -H "content-type: application/json" \
  -d '{"email":"test@example.com","password":"password1234"}' | head -1
kill %1
```

Expected: `db:seed`가 계정 시드 로그 출력(재실행 시 "already exists"), healthz `{"ok":true}`, sign-in 응답 첫 줄 `HTTP/1.1 200 OK`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(api-app): add fastify host with better-auth and test-account seed"
```

---

### Task 5: apps/api 통합 테스트 + CI 하드닝

**Files:**
- Create: `apps/api/vitest.integration.config.ts`, `apps/api/src/server.integration.test.ts`
- Modify: `.github/workflows/ci.yml` (timeout/concurrency — Phase 2 이월)

**Interfaces:**
- Consumes: Task 4의 `buildAuth`/`buildServer`, `@repo/db` migrate, `@trpc/client`+superjson
- Produces: 가입→프로필→로그인→CRUD→401 전 여정 통합 테스트. CI는 기존 2잡 구조 유지(apps/api의 test:integration은 turbo가 자동 포함)

- [ ] **Step 1: vitest 통합 설정**

`apps/api/vitest.integration.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
```

- [ ] **Step 2: 통합 테스트 작성**

`apps/api/src/server.integration.test.ts`:
```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppRouter } from "@repo/api";
import { eq } from "drizzle-orm";
import { user } from "@repo/db/auth-schema";
import { createDb, type Db } from "@repo/db/client";
import { runMigrations } from "@repo/db/migrate";
import { profiles } from "@repo/db/schema";
import { buildAuth, type Auth } from "./auth";
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
  auth = buildAuth(db, { secret: "test-secret", baseURL: BASE, trustedOrigins: [BASE] });
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
```

- [ ] **Step 3: 실행 확인**

```bash
pnpm --filter api test:integration
```

Expected: 5/5 PASS. (구현이 이미 존재하므로 이 태스크는 검증-주도 — 실패 시 서버/훅 버그를 고치고 재실행.)

- [ ] **Step 4: CI 하드닝 (Phase 2 이월)**

`.github/workflows/ci.yml` — `on:` 블록 아래에 추가:
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

두 잡(`check`, `integration`) 각각에 추가:
```yaml
    timeout-minutes: 15
```

- [ ] **Step 5: 전체 리허설**

```bash
pnpm install --frozen-lockfile && pnpm type-check && pnpm lint && pnpm test && pnpm test:integration
```

Expected: 전부 그린 — 단위 17 (lib 3 + features 10 + api 4), 통합 13 (features 8 + api 5).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "test(api-app): add auth-flow integration tests and ci hardening"
```

---

## Phase 3 완료 기준

1. `pnpm db:up && pnpm db:migrate && pnpm db:seed` 후 서버 기동 → `test@example.com`/`password1234` sign-in 200
2. 가입 시 profiles 행 자동 생성 (통합 테스트로 검증)
3. 인증 tRPC로 projects CRUD + profile get/update 동작, 비인증은 UNAUTHORIZED (통합 테스트)
4. AppError→TRPCError 매핑, DTO 경계(여분 필드 차단) 단위 테스트 통과
5. `pnpm test`(단위 17) / `pnpm test:integration`(통합 13) / type-check / lint 전부 그린, push 시 CI 2잡 그린
6. `packages/api`에 better-auth import 없음, 웹/api 코드 어디에도 역방향 import 없음 (grep 검증)
