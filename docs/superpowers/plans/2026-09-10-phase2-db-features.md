# Phase 2: packages/db + features/projects 슬라이스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Postgres+Drizzle 기반 `@repo/db`와 첫 도메인 슬라이스 `features/projects`(repository→service→DI)를 세우고, 단위(mock repo) + 통합(testcontainers 실 DB) 2층 테스트와 CI 통합 잡까지 그린으로 만든다.

**Architecture:** `@repo/db`는 스키마(TS)·클라이언트 팩토리·마이그레이션·시드만 소유. 비즈니스는 `@repo/features`의 projects 슬라이스가 소유 — Drizzle 접촉은 `DrizzleProjectRepository` 단 한 곳, `ProjectService`는 constructor 주입으로 mock/실물 교체. 이후 Phase 3(tRPC)가 `di.ts`의 팩토리와 DTO만 소비한다.

**Tech Stack:** PostgreSQL 16(docker compose), Drizzle ORM + drizzle-kit, pg(node-postgres), zod 4, vitest, @testcontainers/postgresql, tsx

**Spec:** docs/superpowers/specs/2026-09-10-web-seed-design.md (§3 구조, §5 도메인 계층 규칙, §7 테스트 인프라)

## Global Constraints

- 의존 계층: `lib → db → features → api → apps`. 역방향 import 금지
- 내부 패키지는 `@repo/*` + JIT: `exports`가 TS 소스 직접 지시, 빌드 스텝 없음
- 테스트는 `TZ=UTC` 고정 (스크립트 레벨)
- repository만 Drizzle 접촉, **필요한 컬럼만 select** (스펙 §5)
- 서비스/레포지토리 에러는 `AppError(code, message)` (@repo/lib) throw (스펙 §4)
- DI는 constructor 주입 + 팩토리 함수. 컨테이너 도입 금지 (스펙 §5)
- 커밋 메시지는 conventional commits. 코드 주석은 "왜"만. cal.com 코드 복사 금지
- dev DB 기본 접속 문자열: `postgresql://postgres:postgres@localhost:5432/webseed_dev`

**이 Phase 범위 아님 (스펙에 있으나 이후 Phase):** users 테이블·가입 트랜잭션 예제(Phase 3, better-auth가 스키마 소유), 테스트 계정 시드(Phase 3), tRPC 라우터(Phase 3), UI(Phase 4).

---

### Task 1: @repo/db — 스키마 + 클라이언트 + 마이그레이션

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/docker-compose.yml`, `packages/db/drizzle.config.ts`, `packages/db/src/schema.ts`, `packages/db/src/client.ts`, `packages/db/src/migrate.ts`, `packages/db/drizzle/0000_*.sql` (drizzle-kit 생성물)

**Interfaces:**
- Consumes: 없음 (Phase 1 워크스페이스 위에서 시작)
- Produces (Task 4·이후 Phase가 소비):
  - `@repo/db/schema` → `projects` 테이블, `projectStatus` pgEnum
  - `@repo/db/client` → `createDb(connectionString: string): Db`, `type Db` (pool 종료는 `db.$client.end()`)
  - `@repo/db/migrate` → `runMigrations(db: Db): Promise<void>` (통합 테스트가 사용)
  - `pnpm --filter @repo/db db:up|db:down|db:generate|db:migrate` 스크립트

- [ ] **Step 1: 패키지 뼈대 작성**

`packages/db/package.json`:
```json
{
  "name": "@repo/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./schema": "./src/schema.ts",
    "./client": "./src/client.ts",
    "./migrate": "./src/migrate.ts"
  },
  "scripts": {
    "type-check": "tsc --noEmit",
    "db:up": "docker compose up -d --wait",
    "db:down": "docker compose down",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "tsx src/seed.ts"
  },
  "dependencies": {
    "@repo/lib": "workspace:*",
    "drizzle-orm": "^0.44",
    "pg": "^8",
    "zod": "^4"
  },
  "devDependencies": {
    "@repo/config": "workspace:*",
    "@types/pg": "^8",
    "drizzle-kit": "^0.31",
    "tsx": "^4",
    "typescript": "^5"
  }
}
```

(`db:seed`는 Task 2에서 `src/seed.ts` 생성 후 동작 — 지금은 선언만.)

`packages/db/tsconfig.json`:
```json
{
  "extends": "@repo/config/tsconfig.base.json",
  "include": ["src", "drizzle.config.ts"]
}
```

`packages/db/docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: webseed_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d webseed_dev"]
      interval: 2s
      timeout: 3s
      retries: 15
volumes:
  pgdata:
```

- [ ] **Step 2: 스키마 + 클라이언트 + 마이그레이션 헬퍼 작성**

`packages/db/src/schema.ts`:
```typescript
import { pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const projectStatus = pgEnum("project_status", ["active", "archived"]);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: projectStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
```

`packages/db/src/client.ts`:
```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export function createDb(connectionString: string) {
  return drizzle(connectionString, { schema });
}

export type Db = ReturnType<typeof createDb>;
```

`packages/db/src/migrate.ts`:
```typescript
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./client";

// JIT 패키지라 소비자 cwd가 제각각 — 마이그레이션 폴더는 이 파일 기준으로 고정
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder });
}
```

`packages/db/drizzle.config.ts`:
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/webseed_dev",
  },
});
```

- [ ] **Step 3: 설치 + 타입체크**

```bash
pnpm i && pnpm type-check
```

Expected: `@repo/db` 포함 전 패키지 type-check 통과.

- [ ] **Step 4: 첫 마이그레이션 생성**

```bash
pnpm --filter @repo/db db:generate
```

Expected: `packages/db/drizzle/0000_*.sql` 생성 — 내용에 `CREATE TYPE "public"."project_status"` 와 `CREATE TABLE "projects"` 포함. 파일을 열어 두 구문을 확인한다.

- [ ] **Step 5: 실 DB에 적용 검증**

```bash
pnpm --filter @repo/db db:up && pnpm --filter @repo/db db:migrate
docker compose -f packages/db/docker-compose.yml exec postgres psql -U postgres -d webseed_dev -c "\d projects"
```

Expected: migrate 성공, `\d projects` 출력에 id/name/description/status/created_at/updated_at 6개 컬럼.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(db): add drizzle schema, client and first migration"
```

---

### Task 2: @repo/db — 시드 스크립트

**Files:**
- Create: `packages/db/src/seed.ts`

**Interfaces:**
- Consumes: Task 1의 `createDb`, `projects` 스키마, `@repo/lib/env`의 `parseEnv`
- Produces: `pnpm --filter @repo/db db:seed` — 예제 프로젝트 3건, 몇 번을 실행해도 결과 동일(멱등)

- [ ] **Step 1: 시드 작성**

`packages/db/src/seed.ts`:
```typescript
import { z } from "zod";
import { parseEnv } from "@repo/lib/env";
import { createDb } from "./client";
import { projects } from "./schema";

const env = parseEnv({
  DATABASE_URL: z
    .string()
    .default("postgresql://postgres:postgres@localhost:5432/webseed_dev"),
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
```

- [ ] **Step 2: 실행 + 멱등성 검증**

```bash
pnpm --filter @repo/db db:up
pnpm --filter @repo/db db:seed && pnpm --filter @repo/db db:seed
docker compose -f packages/db/docker-compose.yml exec postgres psql -U postgres -d webseed_dev -c "select count(*) from projects;"
```

Expected: 두 번 모두 `seeded 3 projects` 출력·exit 0, count = **3** (6 아님).

- [ ] **Step 3: 타입체크 후 Commit**

```bash
pnpm type-check
git add -A && git commit -m "feat(db): add idempotent dev seed"
```

---

### Task 3: features/projects — DTO + ProjectService (TDD, 단위)

**Files:**
- Create: `packages/features/package.json`, `packages/features/tsconfig.json`, `packages/features/vitest.config.ts`, `packages/features/vitest.integration.config.ts`, `packages/features/projects/index.ts`, `packages/features/projects/dto.ts`, `packages/features/projects/repositories/ProjectRepository.ts`, `packages/features/projects/services/ProjectService.ts`, `packages/features/projects/services/ProjectService.test.ts`

**Interfaces:**
- Consumes: `@repo/lib/errors`의 `AppError`
- Produces (Task 4·Phase 3가 소비):
  - `ProjectRepository` 인터페이스: `findMany(query: ListProjectsQuery): Promise<{ items: ProjectDto[]; total: number }>` · `findById(id: string): Promise<ProjectDto | null>` · `insert(input: CreateProjectInput): Promise<ProjectDto>` · `update(id: string, input: UpdateProjectInput): Promise<ProjectDto | null>` · `delete(id: string): Promise<boolean>`
  - `ProjectService(repo: ProjectRepository)`: `list` / `getById` / `create` / `update` / `delete` — 미존재 id는 `AppError("NOT_FOUND")`
  - zod 스키마: `projectDtoSchema`, `createProjectInputSchema`, `updateProjectInputSchema`, `listProjectsQuerySchema` + 추론 타입들, `ProjectPage`

- [ ] **Step 1: 패키지 뼈대 작성**

`packages/features/package.json`:
```json
{
  "name": "@repo/features",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./projects": "./projects/index.ts"
  },
  "scripts": {
    "type-check": "tsc --noEmit",
    "test": "TZ=UTC vitest run",
    "test:integration": "TZ=UTC vitest run --config vitest.integration.config.ts"
  },
  "dependencies": {
    "@repo/db": "workspace:*",
    "@repo/lib": "workspace:*",
    "zod": "^4"
  },
  "devDependencies": {
    "@repo/config": "workspace:*",
    "@testcontainers/postgresql": "^11",
    "typescript": "^5",
    "vitest": "^3"
  }
}
```

`packages/features/tsconfig.json`:
```json
{
  "extends": "@repo/config/tsconfig.base.json",
  "include": ["projects", "vitest.config.ts", "vitest.integration.config.ts"]
}
```

`packages/features/vitest.config.ts` (단위 — 통합 테스트 제외):
```typescript
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
});
```

`packages/features/vitest.integration.config.ts` (통합만 — 컨테이너 기동 여유 시간):
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

```bash
pnpm i
```

- [ ] **Step 2: 실패 테스트 작성 — ProjectService + in-memory mock repository**

`packages/features/projects/services/ProjectService.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { AppError } from "@repo/lib/errors";
import type {
  CreateProjectInput,
  ListProjectsQuery,
  ProjectDto,
  UpdateProjectInput,
} from "../dto";
import type { ProjectRepository } from "../repositories/ProjectRepository";
import { ProjectService } from "./ProjectService";

class InMemoryProjectRepository implements ProjectRepository {
  private rows: ProjectDto[] = [];
  private seq = 0;

  async findMany(query: ListProjectsQuery) {
    const filtered = this.rows.filter(
      (p) =>
        (query.q === undefined || p.name.toLowerCase().includes(query.q.toLowerCase())) &&
        (query.status === undefined || p.status === query.status),
    );
    const start = (query.page - 1) * query.pageSize;
    return { items: filtered.slice(start, start + query.pageSize), total: filtered.length };
  }

  async findById(id: string) {
    return this.rows.find((p) => p.id === id) ?? null;
  }

  async insert(input: CreateProjectInput) {
    const now = new Date();
    const row: ProjectDto = {
      id: `id-${++this.seq}`,
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? "active",
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return row;
  }

  async update(id: string, input: UpdateProjectInput) {
    const row = this.rows.find((p) => p.id === id);
    if (!row) return null;
    Object.assign(row, input, { updatedAt: new Date() });
    return row;
  }

  async delete(id: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((p) => p.id !== id);
    return this.rows.length < before;
  }
}

function makeService() {
  return new ProjectService(new InMemoryProjectRepository());
}

describe("ProjectService", () => {
  it("creates and reads back a project", async () => {
    const svc = makeService();
    const created = await svc.create({ name: "Alpha", description: null, status: "active" });
    const found = await svc.getById(created.id);
    expect(found.name).toBe("Alpha");
    expect(found.status).toBe("active");
  });

  it("getById throws AppError NOT_FOUND for missing id", async () => {
    const svc = makeService();
    await expect(svc.getById("nope")).rejects.toThrowError(AppError);
    await expect(svc.getById("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists with name filter, status filter and pagination", async () => {
    const svc = makeService();
    await svc.create({ name: "Website Redesign", description: null, status: "active" });
    await svc.create({ name: "Mobile App", description: null, status: "active" });
    await svc.create({ name: "Legacy Migration", description: null, status: "archived" });

    const byName = await svc.list({ q: "web", page: 1, pageSize: 20 });
    expect(byName.total).toBe(1);
    expect(byName.items[0]?.name).toBe("Website Redesign");

    const byStatus = await svc.list({ status: "archived", page: 1, pageSize: 20 });
    expect(byStatus.total).toBe(1);

    const page2 = await svc.list({ page: 2, pageSize: 2 });
    expect(page2.total).toBe(3);
    expect(page2.items).toHaveLength(1);
  });

  it("update patches only given fields and bumps nothing else", async () => {
    const svc = makeService();
    const created = await svc.create({ name: "Alpha", description: "old", status: "active" });
    const updated = await svc.update(created.id, { name: "Beta" });
    expect(updated.name).toBe("Beta");
    expect(updated.description).toBe("old");
    expect(updated.status).toBe("active");
  });

  it("update with empty patch returns current row unchanged", async () => {
    const svc = makeService();
    const created = await svc.create({ name: "Alpha", description: null, status: "active" });
    const updated = await svc.update(created.id, {});
    expect(updated).toMatchObject({ id: created.id, name: "Alpha" });
  });

  it("update and delete throw NOT_FOUND for missing id", async () => {
    const svc = makeService();
    await expect(svc.update("nope", { name: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.delete("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("delete removes the row", async () => {
    const svc = makeService();
    const created = await svc.create({ name: "Alpha", description: null, status: "active" });
    await svc.delete(created.id);
    await expect(svc.getById(created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm --filter @repo/features test
```

Expected: FAIL — "Cannot find module '../dto'" (또는 ProjectService/ProjectRepository 미존재).

- [ ] **Step 4: dto + repository 인터페이스 + 서비스 구현**

`packages/features/projects/dto.ts`:
```typescript
import { z } from "zod";

export const projectStatusSchema = z.enum(["active", "archived"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projectDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: projectStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ProjectDto = z.infer<typeof projectDtoSchema>;

export const createProjectInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().default(null),
  status: projectStatusSchema.default("active"),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

// create 스키마의 .partial() 재사용 금지 — default("active")가 업데이트마다 값을 되돌려버림
export const updateProjectInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: projectStatusSchema.optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

export const listProjectsQuerySchema = z.object({
  q: z.string().min(1).optional(),
  status: projectStatusSchema.optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export type ProjectPage = {
  items: ProjectDto[];
  total: number;
  page: number;
  pageSize: number;
};
```

`packages/features/projects/repositories/ProjectRepository.ts`:
```typescript
import type {
  CreateProjectInput,
  ListProjectsQuery,
  ProjectDto,
  UpdateProjectInput,
} from "../dto";

export interface ProjectRepository {
  findMany(query: ListProjectsQuery): Promise<{ items: ProjectDto[]; total: number }>;
  findById(id: string): Promise<ProjectDto | null>;
  insert(input: CreateProjectInput): Promise<ProjectDto>;
  update(id: string, input: UpdateProjectInput): Promise<ProjectDto | null>;
  delete(id: string): Promise<boolean>;
}
```

`packages/features/projects/services/ProjectService.ts`:
```typescript
import { AppError } from "@repo/lib/errors";
import type {
  CreateProjectInput,
  ListProjectsQuery,
  ProjectDto,
  ProjectPage,
  UpdateProjectInput,
} from "../dto";
import type { ProjectRepository } from "../repositories/ProjectRepository";

export class ProjectService {
  constructor(private readonly repo: ProjectRepository) {}

  async list(query: ListProjectsQuery): Promise<ProjectPage> {
    const { items, total } = await this.repo.findMany(query);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(id: string): Promise<ProjectDto> {
    const found = await this.repo.findById(id);
    if (!found) throw new AppError("NOT_FOUND", `project ${id} not found`);
    return found;
  }

  async create(input: CreateProjectInput): Promise<ProjectDto> {
    return this.repo.insert(input);
  }

  async update(id: string, input: UpdateProjectInput): Promise<ProjectDto> {
    // undefined 키를 걸러야 "빈 패치"를 식별할 수 있고, drizzle .set({}) 예외도 막는다
    const patch = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    ) as UpdateProjectInput;
    if (Object.keys(patch).length === 0) return this.getById(id);
    const updated = await this.repo.update(id, patch);
    if (!updated) throw new AppError("NOT_FOUND", `project ${id} not found`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new AppError("NOT_FOUND", `project ${id} not found`);
  }
}
```

`packages/features/projects/index.ts`:
```typescript
export * from "./dto";
export type { ProjectRepository } from "./repositories/ProjectRepository";
export { ProjectService } from "./services/ProjectService";
```

(`di.ts`와 `DrizzleProjectRepository`는 Task 4에서 이 index에 추가된다.)

- [ ] **Step 5: 통과 + 타입체크 확인**

```bash
pnpm --filter @repo/features test && pnpm type-check
```

Expected: 단위 테스트 7/7 PASS, type-check 통과.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(features): add projects dto and service with unit tests"
```

---

### Task 4: DrizzleProjectRepository + di + testcontainers 통합 테스트 (TDD)

**Files:**
- Create: `packages/features/projects/repositories/DrizzleProjectRepository.ts`, `packages/features/projects/repositories/DrizzleProjectRepository.integration.test.ts`, `packages/features/projects/di.ts`
- Modify: `packages/features/projects/index.ts` (di·구현체 export 추가)

**Interfaces:**
- Consumes: Task 1의 `createDb`/`Db`/`runMigrations`/`projects` 스키마, Task 3의 `ProjectRepository` 인터페이스·DTO 타입·`ProjectService`
- Produces (Phase 3가 소비): `getProjectService(db: Db): ProjectService` (`di.ts`), `DrizzleProjectRepository`

**전제:** Docker 데몬 실행 중 (testcontainers가 postgres:16-alpine 자동 기동/폐기. 로컬 dev DB와 무관 — `db:up` 불필요).

- [ ] **Step 1: 실패 통합 테스트 작성**

`packages/features/projects/repositories/DrizzleProjectRepository.integration.test.ts`:
```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@repo/db/client";
import { runMigrations } from "@repo/db/migrate";
import { projects } from "@repo/db/schema";
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
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(row.updatedAt.getTime());
    expect(await repo.update("00000000-0000-0000-0000-000000000000", { name: "x" })).toBeNull();
  });

  it("delete returns true when removed, false for missing id", async () => {
    const row = await repo.insert({ name: "Alpha", description: null, status: "active" });
    expect(await repo.delete(row.id)).toBe(true);
    expect(await repo.delete(row.id)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm --filter @repo/features test:integration
```

Expected: FAIL — "Cannot find module './DrizzleProjectRepository'".

- [ ] **Step 3: 구현**

`packages/features/projects/repositories/DrizzleProjectRepository.ts`:
```typescript
import { and, count, desc, eq, ilike } from "drizzle-orm";
import type { Db } from "@repo/db/client";
import { projects } from "@repo/db/schema";
import type {
  CreateProjectInput,
  ListProjectsQuery,
  ProjectDto,
  UpdateProjectInput,
} from "../dto";
import type { ProjectRepository } from "./ProjectRepository";

// DTO에 필요한 컬럼만 — select(*) 금지 규칙의 단일 정의 지점
const projectColumns = {
  id: projects.id,
  name: projects.name,
  description: projects.description,
  status: projects.status,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
};

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly db: Db) {}

  async findMany(query: ListProjectsQuery): Promise<{ items: ProjectDto[]; total: number }> {
    const where = and(
      query.q === undefined ? undefined : ilike(projects.name, `%${query.q}%`),
      query.status === undefined ? undefined : eq(projects.status, query.status),
    );
    const [items, totals] = await Promise.all([
      this.db
        .select(projectColumns)
        .from(projects)
        .where(where)
        .orderBy(desc(projects.createdAt), desc(projects.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ value: count() }).from(projects).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async findById(id: string): Promise<ProjectDto | null> {
    const rows = await this.db
      .select(projectColumns)
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async insert(input: CreateProjectInput): Promise<ProjectDto> {
    const rows = await this.db.insert(projects).values(input).returning(projectColumns);
    if (!rows[0]) throw new Error("insert returned no row");
    return rows[0];
  }

  async update(id: string, input: UpdateProjectInput): Promise<ProjectDto | null> {
    const rows = await this.db
      .update(projects)
      .set(input)
      .where(eq(projects.id, id))
      .returning(projectColumns);
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(projects)
      .where(eq(projects.id, id))
      .returning({ id: projects.id });
    return rows.length > 0;
  }
}
```

`packages/features/projects/di.ts`:
```typescript
import type { Db } from "@repo/db/client";
import { DrizzleProjectRepository } from "./repositories/DrizzleProjectRepository";
import { ProjectService } from "./services/ProjectService";

export function getProjectService(db: Db): ProjectService {
  return new ProjectService(new DrizzleProjectRepository(db));
}
```

`packages/features/projects/index.ts` 전체 교체:
```typescript
export * from "./dto";
export { getProjectService } from "./di";
export type { ProjectRepository } from "./repositories/ProjectRepository";
export { DrizzleProjectRepository } from "./repositories/DrizzleProjectRepository";
export { ProjectService } from "./services/ProjectService";
```

- [ ] **Step 4: 통과 확인 (통합 + 단위 + 타입체크)**

```bash
pnpm --filter @repo/features test:integration && pnpm --filter @repo/features test && pnpm type-check
```

Expected: 통합 5/5 PASS, 단위 7/7 PASS, type-check 통과.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(features): add drizzle project repository with testcontainers integration tests"
```

---

### Task 5: 루트/turbo/CI 배선

**Files:**
- Modify: `turbo.json` (test:integration 태스크), `package.json` (루트 스크립트), `.github/workflows/ci.yml` (integration 잡 추가)

**Interfaces:**
- Consumes: Task 4의 `test:integration` 패키지 스크립트
- Produces: 루트 `pnpm test:integration`, 루트 `pnpm db:up|db:migrate|db:seed` 패스스루, CI `integration` 잡 (스펙 §7: 통합은 별도 잡)

- [ ] **Step 1: turbo 태스크 추가**

`turbo.json`의 `tasks`에 추가 (기존 태스크 유지):
```json
"test:integration": { "cache": false }
```

(DB 컨테이너를 띄우는 테스트라 캐시 재생이 무의미 — cache false.)

- [ ] **Step 2: 루트 스크립트 추가**

루트 `package.json`의 `scripts`에 추가:
```json
"test:integration": "turbo run test:integration",
"db:up": "pnpm --filter @repo/db db:up",
"db:migrate": "pnpm --filter @repo/db db:migrate",
"db:seed": "pnpm --filter @repo/db db:seed"
```

- [ ] **Step 3: CI에 integration 잡 추가**

`.github/workflows/ci.yml`의 `jobs`에 추가 (기존 `check` 잡 유지):
```yaml
  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:integration
```

(ubuntu-latest는 Docker 데몬 내장 — testcontainers 추가 설정 불필요.)

- [ ] **Step 4: 로컬 리허설**

```bash
pnpm install --frozen-lockfile && pnpm type-check && pnpm lint && pnpm test && pnpm test:integration
```

Expected: 전부 그린 (단위 10개: lib 3 + features 7, 통합 5개).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "ci: add integration test job and db scripts"
```

---

## Phase 2 완료 기준

1. `pnpm db:up && pnpm db:migrate && pnpm db:seed` → psql count=3, 시드 재실행해도 3
2. `pnpm test` 단위 10/10 (lib 3 + features 7), `pnpm test:integration` 5/5 그린
3. `pnpm type-check && pnpm lint` 그린
4. push 시 CI `check` + `integration` 두 잡 모두 그린
5. `packages/features`에서 Drizzle import는 `DrizzleProjectRepository.ts` 단 한 파일 (grep으로 검증 가능)
