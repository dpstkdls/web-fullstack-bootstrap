# Phase 1: 모노레포 골격 + 툴링 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pnpm+Turborepo 모노레포 뼈대를 세우고 공유 설정(tsconfig/biome), 최하층 패키지(@repo/lib), 커밋 훅, CI까지 — `pnpm i && pnpm type-check && pnpm lint && pnpm test`가 그린인 상태를 만든다.

**Architecture:** JIT 내부 패키지(빌드 없이 TS 소스 export). 루트에 biome + turbo, packages/config에 공유 tsconfig, packages/lib에 env 검증 헬퍼와 AppError. 이후 모든 Phase가 이 위에 쌓인다.

**Tech Stack:** pnpm(corepack), Turborepo 2, TypeScript 5, Biome, vitest, husky + lint-staged + commitlint, GitHub Actions

**Spec:** docs/superpowers/specs/2026-09-10-web-seed-design.md

## Global Constraints

- Node 22 LTS. `.nvmrc` + `engines` + `packageManager` 3중 고정
- 내부 패키지 이름은 `@repo/*` (예: `@repo/lib`)
- 내부 패키지는 JIT: `exports`가 `./src/*.ts`를 직접 가리킴, 빌드 스텝 없음
- 의존 계층: lib → db → features → api → apps. 역방향 import 금지
- 테스트는 `TZ=UTC` 고정 (스크립트 레벨)
- 커밋 메시지는 conventional commits
- 코드 주석은 "왜"만. cal.com 코드 복사 금지

## 이후 Phase 로드맵 (이 문서 범위 아님)

- Phase 2: packages/db(Drizzle+마이그레이션+시드) + features/projects 슬라이스 + testcontainers 통합 테스트
- Phase 3: apps/api(Fastify) + packages/api(tRPC) + better-auth
- Phase 4: apps/web(Next 15) + packages/ui(shadcn) + packages/i18n + 예제 5페이지 + Playwright
- Phase 5: 배포(Docker/nfpm) + ADR 7건 + agents/rules + README

---

### Task 1: pnpm + Turborepo 루트 골격

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.npmrc`, `.gitignore`

**Interfaces:**
- Produces: 워크스페이스 루트. 이후 모든 패키지는 `apps/*`, `packages/*` 아래에 생성. 루트 스크립트 `pnpm dev|build|type-check|lint|test` = `turbo run <task>`

- [ ] **Step 1: Node 버전 고정 파일**

`.nvmrc`:
```
22
```

- [ ] **Step 2: 루트 package.json 작성**

```json
{
  "name": "web-seed",
  "private": true,
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "type-check": "turbo run type-check",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "test": "turbo run test"
  },
  "devDependencies": {}
}
```

- [ ] **Step 3: corepack으로 pnpm 최신 안정판 고정**

```bash
corepack enable && corepack use pnpm@latest
```

Expected: package.json에 `"packageManager": "pnpm@<버전>+sha512..."` 필드가 생성되고 pnpm-lock.yaml 생성됨. `pnpm -v`가 해당 버전 출력.

- [ ] **Step 4: 워크스페이스/설정 파일 작성**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`.npmrc`:
```
engine-strict=true
```

`.gitignore`:
```
node_modules/
.next/
dist/
.turbo/
coverage/
*.log
.env
.env.*
!.env.example
```

- [ ] **Step 5: turbo 설치 + turbo.json 작성**

```bash
pnpm add -D -w turbo
```

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": { "cache": false, "persistent": true },
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "type-check": { "dependsOn": ["^type-check"] },
    "test": {}
  }
}
```

- [ ] **Step 6: 검증**

```bash
pnpm turbo run type-check
```

Expected: "No tasks were executed" 류 메시지(패키지 0개) — 에러 없이 종료.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold pnpm+turborepo monorepo root"
```

---

### Task 2: 공유 설정 — packages/config + 루트 Biome

**Files:**
- Create: `packages/config/package.json`, `packages/config/tsconfig.base.json`, `biome.json`

**Interfaces:**
- Produces: 모든 패키지가 `"extends": "@repo/config/tsconfig.base.json"` 사용. biome은 루트 단일 설정(스펙의 "공유 biome 설정"은 루트 파일로 충족 — 중첩 설정보다 단순).

- [ ] **Step 1: config 패키지 작성**

`packages/config/package.json`:
```json
{
  "name": "@repo/config",
  "version": "0.0.0",
  "private": true,
  "exports": { "./tsconfig.base.json": "./tsconfig.base.json" }
}
```

`packages/config/tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 2: biome 설치 + 루트 설정**

```bash
pnpm add -D -w @biomejs/biome
```

`biome.json` (스키마 버전은 설치된 biome이 `pnpm biome init`으로 생성한 값 사용, 아래 내용으로 교체):
```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "files": { "ignoreUnknown": true },
  "formatter": { "enabled": true, "indentStyle": "space", "lineWidth": 100 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "double" } }
}
```

- [ ] **Step 3: 검증**

```bash
pnpm lint
```

Expected: 에러 0 (검사 대상 파일이 적어도 정상 종료).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: add shared tsconfig and biome config"
```

---

### Task 3: @repo/lib — AppError + env 검증 (TDD)

**Files:**
- Create: `packages/lib/package.json`, `packages/lib/tsconfig.json`, `packages/lib/vitest.config.ts`, `packages/lib/src/errors.ts`, `packages/lib/src/errors.test.ts`, `packages/lib/src/env.ts`, `packages/lib/src/env.test.ts`

**Interfaces:**
- Produces (이후 모든 Phase가 소비):
  - `class AppError extends Error { constructor(code: AppErrorCode, message: string); readonly code: AppErrorCode }` — `AppErrorCode = "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST" | "CONFLICT" | "UNAUTHORIZED" | "INTERNAL"`
  - `parseEnv<T extends z.ZodRawShape>(shape: T, source?: Record<string, string | undefined>): z.infer<z.ZodObject<T>>` — 실패 시 누락 키 목록을 담아 throw 후 프로세스가 죽도록(부팅 즉시 실패)

- [ ] **Step 1: 패키지 뼈대**

`packages/lib/package.json`:
```json
{
  "name": "@repo/lib",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./errors": "./src/errors.ts",
    "./env": "./src/env.ts"
  },
  "scripts": {
    "type-check": "tsc --noEmit",
    "test": "TZ=UTC vitest run"
  },
  "dependencies": { "zod": "^4" },
  "devDependencies": { "@repo/config": "workspace:*", "typescript": "^5", "vitest": "^3" }
}
```

`packages/lib/tsconfig.json`:
```json
{
  "extends": "@repo/config/tsconfig.base.json",
  "include": ["src"]
}
```

`packages/lib/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
```

```bash
pnpm i
```

- [ ] **Step 2: errors 실패 테스트 작성**

`packages/lib/src/errors.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { AppError } from "./errors";

describe("AppError", () => {
  it("carries code and message", () => {
    const e = new AppError("NOT_FOUND", "project 3 not found");
    expect(e.code).toBe("NOT_FOUND");
    expect(e.message).toBe("project 3 not found");
    expect(e).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm --filter @repo/lib test
```

Expected: FAIL — "Cannot find module './errors'"

- [ ] **Step 4: errors 구현**

`packages/lib/src/errors.ts`:
```typescript
export type AppErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}
```

- [ ] **Step 5: 통과 확인**

```bash
pnpm --filter @repo/lib test
```

Expected: PASS 1/1

- [ ] **Step 6: env 실패 테스트 작성**

`packages/lib/src/env.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("parses valid env", () => {
    const env = parseEnv({ PORT: z.coerce.number() }, { PORT: "3001" });
    expect(env.PORT).toBe(3001);
  });

  it("throws listing missing keys", () => {
    expect(() => parseEnv({ DATABASE_URL: z.string() }, {})).toThrowError(/DATABASE_URL/);
  });
});
```

- [ ] **Step 7: 실패 확인**

```bash
pnpm --filter @repo/lib test
```

Expected: FAIL — "Cannot find module './env'"

- [ ] **Step 8: env 구현**

`packages/lib/src/env.ts`:
```typescript
import { z } from "zod";

// 부팅 시 한 번 호출해 잘못된 배포를 즉시 실패시키는 용도 — 런타임 중 재호출 금지
export function parseEnv<T extends z.ZodRawShape>(
  shape: T,
  source: Record<string, string | undefined> = process.env
): z.infer<z.ZodObject<T>> {
  const result = z.object(shape).safeParse(source);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  ");
    throw new Error(`Invalid environment variables:\n  ${detail}`);
  }
  return result.data;
}
```

- [ ] **Step 9: 통과 + 타입체크 확인**

```bash
pnpm --filter @repo/lib test && pnpm type-check
```

Expected: 테스트 3/3 PASS, type-check 통과.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(lib): add AppError and parseEnv with tests"
```

---

### Task 4: 커밋 훅 — husky + lint-staged + commitlint

**Files:**
- Create: `.husky/pre-commit`, `.husky/commit-msg`, `commitlint.config.mjs`
- Modify: `package.json` (prepare 스크립트, lint-staged 설정)

**Interfaces:**
- Produces: 커밋 시 변경 파일 biome 자동 수정 + conventional commits 강제. 이후 Phase의 모든 커밋이 이 게이트를 통과.

- [ ] **Step 1: 설치**

```bash
pnpm add -D -w husky lint-staged @commitlint/cli @commitlint/config-conventional
pnpm husky init
```

- [ ] **Step 2: 훅/설정 작성**

`.husky/pre-commit` (husky init이 만든 내용 교체):
```
pnpm lint-staged
```

`.husky/commit-msg`:
```
pnpm commitlint --edit "$1"
```

`commitlint.config.mjs`:
```javascript
export default { extends: ["@commitlint/config-conventional"] };
```

루트 `package.json`에 추가:
```json
"lint-staged": {
  "*.{ts,tsx,js,json}": "biome check --write --no-errors-on-unmatched"
}
```

(prepare 스크립트는 husky init이 추가함: `"prepare": "husky"`)

- [ ] **Step 3: 게이트 동작 검증 — 나쁜 메시지가 거부되는지**

```bash
git add -A && git commit -m "bad message" ; echo "exit=$?"
```

Expected: commitlint 에러로 커밋 실패, exit≠0.

- [ ] **Step 4: 정상 커밋**

```bash
git commit -m "chore: add husky, lint-staged, commitlint"
```

Expected: pre-commit(lint-staged) 실행 후 커밋 성공.

---

### Task 5: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: push/PR마다 install→type-check→lint→test. 이후 Phase는 이 워크플로에 잡만 추가(통합/E2E).

- [ ] **Step 1: 워크플로 작성**

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4 # packageManager 필드에서 버전 자동 인식
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm type-check
      - run: pnpm lint
      - run: pnpm test
```

- [ ] **Step 2: 로컬 리허설 (CI와 동일 순서)**

```bash
pnpm install --frozen-lockfile && pnpm type-check && pnpm lint && pnpm test
```

Expected: 전부 그린.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "ci: add type-check/lint/test workflow"
```

---

## Phase 1 완료 기준

1. `pnpm i && pnpm type-check && pnpm lint && pnpm test` 전부 그린
2. `git commit -m "bad"` 가 commitlint에 거부됨
3. `@repo/lib` 테스트 3개 통과 (AppError 1, parseEnv 2)
4. 원격 push 시 CI 그린 (원격 저장소 생성은 사용자 선택)
