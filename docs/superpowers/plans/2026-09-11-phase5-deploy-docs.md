# Phase 5: 배포(Docker/nfpm) + ADR + agents/rules + README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로덕션 빌드(web standalone / api tsup 번들)를 세우고 Docker(prod compose)와 nfpm(.deb/.rpm) 두 배포 경로를 완성, ADR 7건·agents/rules·README를 작성해 스펙 §11 성공 기준 5개를 전부 닫는다.

**Architecture:** 배포는 온프레미스 우선(§10) — A. Docker(기본): web은 Next standalone, api는 tsup 단일 번들 + drizzle 마이그레이션 폴더 동반. B. OS 패키지: nfpm으로 .deb/.rpm, Node 22 런타임 동봉(/opt/web-seed/node), systemd 유닛 2개, 마이그레이션은 api 유닛 ExecStartPre(postinst에서 DB 접속 금지). C. 단일 바이너리는 문서만. 문서(ADR/rules/README)는 스펙의 결정뿐 아니라 **이 레포가 실제로 내린 결정**(pnpm 12, secret 가드, 시계 혼용 fallback 등)을 기록한다.

**Tech Stack:** Next standalone output · tsup · Docker multi-stage + compose · nfpm(바이너리 직접 다운로드) · systemd

**Spec:** docs/superpowers/specs/2026-09-10-web-seed-design.md (§9 문서, §10 배포, §11 성공 기준)

## Global Constraints

- 기존 dev 경로(`pnpm dev`, 테스트 스위트) 불변 — 빌드/배포는 추가만
- api 프로덕션: `NODE_ENV=production` + 32자 미만/기본 시크릿이면 부팅 거부 (기존 가드) — prod compose·nfpm env가 이를 통과하도록 구성하되 **실제 시크릿을 커밋하지 않는다** (`${VAR:?}` 패턴/주석 지시)
- nfpm postinst에서 DB 접속 가정 금지 (스펙 §10-B) — 마이그레이션은 ExecStartPre
- `/etc/web-seed/env`는 conffile(업그레이드 시 보존)
- 커밋 conventional, 주석 "왜"만, 문서는 한국어(코드·명령·용어는 영어)
- 테스트 `TZ=UTC` 유지. macOS 호스트라 .deb/.rpm **설치** 검증은 불가 — 패키지 구조 검증(아카이브 리스트)까지가 이 계획의 검증 범위이며 한계를 README에 명시

**계획 확정 결정 (plan-mandated):**
1. api 번들은 tsup ESM, 엔트리 2개(`index`, `migrate`) — `migrate`는 `runMigrations` 후 종료(ExecStartPre·Docker 공용). 마이그레이션 SQL 폴더는 번들 산출물 옆 `../drizzle`로 복사(기존 `import.meta.url` 해석과 정합).
2. nfpm은 단일 패키지 `web-seed`(api+web+node 동봉, systemd 유닛 2개) — 스펙 §10-B 구조 그대로.
3. Node 런타임 동봉은 패키징 스크립트가 리눅스 x64 tarball을 받아 포함 (버전은 `.nvmrc` 메이저의 현행 LTS 고정, 스크립트 상수).
4. P4 이월 백로그 중 이번 범위: e2e tsconfig/type-check, ui 죽은 exports(`./hooks/*`)·미사용 deps(@hookform/resolvers, zod) 정리, web 전역 `error.tsx` 1개. **나머지**(useFormatter 날짜 i18n, invalidateQueries 예시, /login 로그인 가드, saved 플래그 리셋, locale action 런타임 검증 등)는 README "알려진 개선점"에 기록하고 코드는 만지지 않는다.
5. 단일 바이너리(§10-C)는 README 문서만: Node SEA/bun compile 경로 + web이 비실용인 사유(Next 서버·정적 자산 구조) 명시. 스크립트 작성 안 함(YAGNI).

---

### Task 1: 프로덕션 빌드 기반 + 하우스키핑

**Files:**
- Modify: `apps/web/next.config.ts` (output standalone), `apps/api/package.json` (build/migrate 스크립트+tsup), `turbo.json` (build outputs 확인 — 기존 유지), `packages/ui/package.json` (죽은 exports·미사용 deps 제거), 루트 `package.json` (스크립트 정리 필요 시)
- Create: `apps/api/tsup.config.ts`, `apps/api/src/migrate.ts`, `apps/web/src/app/error.tsx`, `e2e/tsconfig.json` (+ e2e package.json에 type-check 스크립트)

**Interfaces:**
- Produces (Task 2·3이 소비): `pnpm build` → `apps/web/.next/standalone`(+static), `apps/api/dist/index.js`·`dist/migrate.js` (실행: `node dist/index.js`, 마이그레이션: `node dist/migrate.js`)

- [ ] **Step 1: web standalone + error.tsx**

`apps/web/next.config.ts`의 nextConfig에 추가:
```typescript
  output: "standalone",
```

`apps/web/src/app/error.tsx`:
```tsx
"use client";

// 전역 에러 바운더리 — api 미기동 등 런타임 오류에서 Next 기본 스택 화면 대신 복구 UI
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ko">
      <body className="flex min-h-screen items-center justify-center">
        <div className="space-y-3 text-center">
          <p className="text-lg font-semibold">문제가 발생했습니다</p>
          <button type="button" onClick={reset} className="underline">
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
```

(참고: 루트 `app/error.tsx`가 아닌 `global-error.tsx`가 아님 — 일반 error.tsx는 (app)/(auth) 세그먼트 오류를 잡는다. RootLayout 자체가 던지는 경우까지 잡으려면 `global-error.tsx`가 필요하나, 현재 RootLayout은 세션에 의존하지 않으므로 error.tsx로 충분. 이 판단을 주석 없이 코드 배치로만 표현.)

- [ ] **Step 2: api tsup 번들 + migrate 엔트리**

`apps/api/tsup.config.ts`:
```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", migrate: "src/migrate.ts" },
  format: "esm",
  platform: "node",
  target: "node22",
  clean: true,
  // JIT 워크스페이스 소스까지 한 덩어리로 — 컨테이너/패키지에 node_modules 불필요
  noExternal: [/.*/],
});
```

`apps/api/src/migrate.ts`:
```typescript
import { createDb } from "@repo/db/client";
import { runMigrations } from "@repo/db/migrate";
import { env } from "./env";

// ExecStartPre / Docker에서 부팅 전 1회 실행 — 성공 시 0으로 종료
const db = createDb(env.DATABASE_URL);
await runMigrations(db);
console.log("migrations applied");
await db.$client.end();
```

`apps/api/package.json` scripts에 추가, devDeps에 `"tsup": "^8"`:
```json
    "build": "tsup",
```

- [ ] **Step 3: 하우스키핑 (P4 이월)**

`packages/ui/package.json`: `exports`에서 `"./hooks/*"` 제거(빈 디렉터리), `dependencies`에서 `@hookform/resolvers`·`zod` 제거(소스 grep 0건 — 제거 후 grep 재확인).

`e2e/tsconfig.json`:
```json
{
  "extends": "@repo/config/tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022", "DOM"] },
  "include": ["tests", "playwright.config.ts"]
}
```

`e2e/package.json` scripts에 추가 + devDeps `"typescript": "^5"`, `"@repo/config": "workspace:*"`:
```json
    "type-check": "tsc --noEmit"
```

- [ ] **Step 4: 빌드 검증**

```bash
pnpm i && pnpm type-check && pnpm lint
pnpm build
ls apps/web/.next/standalone/apps/web/server.js apps/api/dist/index.js apps/api/dist/migrate.js
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/webseed_dev" node apps/api/dist/migrate.js
node apps/api/dist/index.js & API_PID=$!
sleep 2 && curl -sf http://localhost:3001/healthz && kill $API_PID
```

Expected: build 그린(web standalone 산출·api dist 2개), 번들 migrate가 dev DB에 적용 성공(멱등), 번들 api 부팅+healthz OK. `pnpm db:up` 선행. (migrate의 `../drizzle` 해석 실패 시: dist 옆에 drizzle 폴더가 필요한 구조임을 확인하고 `cp -r packages/db/drizzle apps/api/drizzle` 후 재시도 — 결과를 리포트에 명시, Task 2 Dockerfile이 같은 배치를 쓴다.)

- [ ] **Step 5: 전체 스위트 회귀 확인 + Commit**

```bash
pnpm test && pnpm test:integration && pnpm --filter e2e type-check
git add -A && git commit -m "feat(build): add standalone/tsup production builds and housekeeping"
```

---

### Task 2: Dockerfile 2개 + prod compose

**Files:**
- Create: `apps/web/Dockerfile`, `apps/api/Dockerfile`, `docker-compose.prod.yml`, `.dockerignore`

**Interfaces:**
- Consumes: Task 1의 빌드 산출물 규약
- Produces: `docker compose -f docker-compose.prod.yml up` 으로 postgres+api+web 전체 기동

- [ ] **Step 1: .dockerignore**

```
node_modules
**/node_modules
.next
**/dist
.turbo
**/.turbo
.git
.claude
coverage
e2e
docs
*.log
.env*
```

- [ ] **Step 2: api Dockerfile (multi-stage)**

`apps/api/Dockerfile`:
```dockerfile
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter api... && pnpm --filter api build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/api/dist ./dist
# migrate.js의 ../drizzle 해석용 — 번들 옆에 마이그레이션 SQL 동반 (계획 결정 1)
COPY --from=build /repo/packages/db/drizzle ./drizzle
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: web Dockerfile (standalone)**

`apps/web/Dockerfile`:
```dockerfile
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter web... && pnpm --filter web build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

(standalone은 모노레포 구조를 보존해 `apps/web/server.js`로 나온다 — Step 5에서 실경로 확인 후 다르면 맞춰 수정하고 리포트에 명시.)

- [ ] **Step 4: prod compose**

`docker-compose.prod.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set in .env}
      POSTGRES_DB: webseed
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d webseed"]
      interval: 5s
      retries: 12

  migrate:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    command: ["node", "dist/migrate.js"]
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:?}@postgres:5432/webseed
    depends_on:
      postgres: { condition: service_healthy }

  api:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:?}@postgres:5432/webseed
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?generate with openssl rand -base64 32}
      BETTER_AUTH_URL: ${PUBLIC_ORIGIN:-http://localhost:3000}
      WEB_ORIGIN: ${PUBLIC_ORIGIN:-http://localhost:3000}
    depends_on:
      migrate: { condition: service_completed_successfully }
    ports:
      - "127.0.0.1:3001:3001"

  web:
    build: { context: ., dockerfile: apps/web/Dockerfile }
    environment:
      API_ORIGIN: http://api:3001
    depends_on:
      - api
    ports:
      - "3000:3000"

volumes:
  pgdata:
```

- [ ] **Step 5: 빌드+기동 스모크**

```bash
printf 'POSTGRES_PASSWORD=prodpass\nBETTER_AUTH_SECRET=%s\n' "$(openssl rand -base64 32)" > .env
docker compose -f docker-compose.prod.yml up -d --build --wait
curl -sf http://localhost:3001/healthz
curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
curl -si -X POST http://localhost:3000/api/auth/sign-up/email -H "content-type: application/json" \
  -d '{"email":"docker@example.com","password":"password1234","name":"Docker"}' | head -1
docker compose -f docker-compose.prod.yml down -v
rm .env
```

Expected: 전 서비스 healthy, healthz OK, /login 200, 프록시 경유 가입 200 (전체 체인: web→rewrites→api→db). 실패 시 로그로 원인 수정(수정 내역 리포트 명시). `.env`는 생성·삭제하며 커밋 금지(.gitignore 기존 커버 확인).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(deploy): add production dockerfiles and compose"
```

---

### Task 3: nfpm — .deb/.rpm 패키징

**Files:**
- Create: `deploy/nfpm/nfpm.yaml`, `deploy/nfpm/web-seed-api.service`, `deploy/nfpm/web-seed-web.service`, `deploy/nfpm/env.example`, `deploy/nfpm/postinstall.sh`, `scripts/package-os.sh`
- Modify: 루트 `package.json` (`package:os` 스크립트), `.gitignore` (`dist-packages/`, `deploy/nfpm/stage/`)

**Interfaces:**
- Consumes: Task 1 빌드 산출물
- Produces: `pnpm package:os` → `dist-packages/web-seed_<ver>_amd64.deb` + `.rpm`

- [ ] **Step 1: systemd 유닛 + env conffile**

`deploy/nfpm/web-seed-api.service`:
```ini
[Unit]
Description=web-seed API server
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=/etc/web-seed/env
# 마이그레이션은 여기서 — postinst는 DB 접속을 가정하지 않는다 (spec §10-B)
ExecStartPre=/opt/web-seed/node/bin/node /opt/web-seed/api/dist/migrate.js
ExecStart=/opt/web-seed/node/bin/node /opt/web-seed/api/dist/index.js
Restart=on-failure
User=webseed
Group=webseed

[Install]
WantedBy=multi-user.target
```

`deploy/nfpm/web-seed-web.service`:
```ini
[Unit]
Description=web-seed Web server
After=web-seed-api.service

[Service]
EnvironmentFile=/etc/web-seed/env
# 공유 env의 PORT(3001, api용)를 덮어쓴다 — Environment=는 EnvironmentFile보다 뒤에 적용
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
WorkingDirectory=/opt/web-seed/web
ExecStart=/opt/web-seed/node/bin/node /opt/web-seed/web/apps/web/server.js
Restart=on-failure
User=webseed
Group=webseed

[Install]
WantedBy=multi-user.target
```

`deploy/nfpm/env.example` (설치 시 `/etc/web-seed/env`로, conffile):
```
NODE_ENV=production
DATABASE_URL=postgresql://postgres:CHANGE_ME@localhost:5432/webseed
# openssl rand -base64 32 로 생성해 교체할 것. 이 값(32자 미만)을 그대로 두면
# api가 부팅을 거부한다 — 의도된 안전장치다 (스펙 §8 부팅 즉시 실패)
BETTER_AUTH_SECRET=CHANGE_ME
BETTER_AUTH_URL=http://localhost:3000
WEB_ORIGIN=http://localhost:3000
API_ORIGIN=http://localhost:3001
PORT=3001
```

`deploy/nfpm/postinstall.sh` (DB 접속 없음 — 계정·daemon-reload만):
```bash
#!/bin/sh
set -e
if ! id webseed >/dev/null 2>&1; then
  useradd --system --home /opt/web-seed --shell /usr/sbin/nologin webseed || true
fi
systemctl daemon-reload || true
echo "web-seed installed. Edit /etc/web-seed/env then: systemctl enable --now web-seed-api web-seed-web"
```

- [ ] **Step 2: nfpm.yaml**

`deploy/nfpm/nfpm.yaml`:
```yaml
name: web-seed
arch: amd64
platform: linux
version: "0.1.0"
maintainer: "web-seed"
description: web-seed full-stack app (api + web, bundled Node runtime)
license: MIT
contents:
  - src: deploy/nfpm/stage/node
    dst: /opt/web-seed/node
  - src: deploy/nfpm/stage/api
    dst: /opt/web-seed/api
  - src: deploy/nfpm/stage/web
    dst: /opt/web-seed/web
  - src: deploy/nfpm/web-seed-api.service
    dst: /usr/lib/systemd/system/web-seed-api.service
  - src: deploy/nfpm/web-seed-web.service
    dst: /usr/lib/systemd/system/web-seed-web.service
  - src: deploy/nfpm/env.example
    dst: /etc/web-seed/env
    type: config|noreplace
scripts:
  postinstall: deploy/nfpm/postinstall.sh
```

- [ ] **Step 3: 패키징 스크립트**

`scripts/package-os.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

NODE_VERSION="22.23.2"  # .nvmrc 메이저의 현행 LTS — 갱신 시 여기만
NFPM_VERSION="2.43.1"
STAGE=deploy/nfpm/stage
OUT=dist-packages

rm -rf "$STAGE" "$OUT" && mkdir -p "$STAGE" "$OUT" .cache

# 1) 앱 빌드
pnpm build

# 2) 스테이징: api 번들 + 마이그레이션, web standalone
mkdir -p "$STAGE/api/dist" "$STAGE/web"
cp -r apps/api/dist "$STAGE/api/"
cp -r packages/db/drizzle "$STAGE/api/drizzle"   # migrate.js의 ../drizzle
cp -r apps/web/.next/standalone/. "$STAGE/web/"
mkdir -p "$STAGE/web/apps/web/.next"
cp -r apps/web/.next/static "$STAGE/web/apps/web/.next/static"

# 3) Node 런타임 동봉 (linux x64)
NODE_TAR=".cache/node-v${NODE_VERSION}-linux-x64.tar.gz"
[ -f "$NODE_TAR" ] || curl -fL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz" -o "$NODE_TAR"
mkdir -p "$STAGE/node"
tar -xzf "$NODE_TAR" -C "$STAGE/node" --strip-components=1

# 4) nfpm 바이너리 (npm 패키지 아님 — 릴리스 바이너리 사용)
OS=$(uname -s); ARCH=$(uname -m); [ "$ARCH" = "arm64" ] && ARCH="arm64" || ARCH="x86_64"
NFPM_BIN=".cache/nfpm"
if [ ! -x "$NFPM_BIN" ]; then
  curl -fL "https://github.com/goreleaser/nfpm/releases/download/v${NFPM_VERSION}/nfpm_${NFPM_VERSION}_${OS}_${ARCH}.tar.gz" \
    | tar -xz -C .cache nfpm
fi

# 5) 패키지 생성
"$NFPM_BIN" package -f deploy/nfpm/nfpm.yaml -p deb -t "$OUT/"
"$NFPM_BIN" package -f deploy/nfpm/nfpm.yaml -p rpm -t "$OUT/"
ls -lh "$OUT"
```

루트 `package.json` scripts에 추가:
```json
    "package:os": "bash scripts/package-os.sh"
```

`.gitignore`에 추가:
```
dist-packages/
deploy/nfpm/stage/
.cache/
```

- [ ] **Step 4: 생성 + 구조 검증 (macOS 한계 내)**

```bash
chmod +x scripts/package-os.sh deploy/nfpm/postinstall.sh
pnpm package:os
DEB=$(ls dist-packages/*.deb)
ar -t "$DEB"
ar -p "$DEB" data.tar.gz | tar -tz | grep -E "opt/web-seed/(node/bin/node|api/dist/(index|migrate)\.js|api/drizzle/|web/apps/web/server\.js)|usr/lib/systemd/system/web-seed-(api|web)\.service|etc/web-seed/env" | sort -u
ar -p "$DEB" control.tar.gz | tar -tz | grep -E "postinst|conffiles"
ar -p "$DEB" control.tar.gz | tar -xzO ./conffiles 2>/dev/null || ar -p "$DEB" control.tar.gz | tar -xzO conffiles
```

Expected: deb·rpm 파일 생성, data 아카이브에 node 바이너리/api dist 2개+drizzle/web server.js/유닛 2개/env 존재, control에 postinst와 conffiles(`/etc/web-seed/env`) 존재. (data.tar가 zst면 `tar --zstd -t`로 대체 — 사용한 명령을 리포트에 기록. 실제 리눅스 설치 검증은 범위 밖 — README에 명시됨.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(deploy): add nfpm deb/rpm packaging with bundled node runtime"
```

---

### Task 4: ADR 7건 + agents/rules

**Files:**
- Create: `docs/adr/0001-pnpm.md` ~ `docs/adr/0007-drizzle-only.md`, `agents/rules/engineering-rules.md`

각 ADR은 `# ADR-NNNN: 제목` + **배경 / 대안 / 결정 / 트레이드오프** 4개 절. 아래 논지 개요가 내용 스펙 — 산문화는 재량이되 각 bullet은 반드시 반영, 실제 레포 이력과 어긋난 내용 금지.

- [ ] **Step 1: ADR 0001~0007 작성**

**0001 pnpm(+corepack 고정)**: 배경 — 모노레포 디스크/속도/유령 의존성. 대안 — npm workspaces(유령 의존성 취약), yarn berry(PnP 생태계 마찰). 결정 — pnpm, corepack `packageManager` 필드로 3중 고정. **스펙 초안은 pnpm 9였으나 구현 시점 `corepack use pnpm@latest`로 pnpm 12 채택** — 버전은 packageManager가 정본. 트레이드오프 — strict 링킹 때문에 간접 의존을 명시해야 함(Phase 2의 drizzle-orm direct dep 사례).

**0002 Fastify+tRPC 분리 백엔드**: 배경 — Next API route 일체형 대비 백엔드 독립 스케일·배포. 대안 — Next Route Handlers(웹과 수명주기 결합), NestJS(무겁고 데코레이터 결합). 결정 — Fastify 호스트 + packages/api의 tRPC 라우터, 웹은 rewrites 프록시로 same-origin. 트레이드오프 — 서버 2개 운영, RSC에서 세션 확인 시 API 왕복 필요.

**0003 better-auth**: 배경 — email+password 자체 소유 인증, 외부 IdP 미전제. 대안 — NextAuth/Auth.js(웹 프레임워크 결합, DB 스키마 통제 약함), Lucia(유지보수 종료 흐름), 자체 구현(보안 리스크). 결정 — better-auth를 api에 마운트, Drizzle adapter, 스키마는 표준형을 packages/db가 소유. 트레이드오프 — user insert를 라이브러리가 소유해 가입 트랜잭션에 우리 테이블을 묶을 수 없음(프로필은 훅+ensureProfile 자가치유로 보완 — Phase 3 결정).

**0004 next-intl(+use-intl 코어)**: 배경 — ko/en, 메시지 단일 소스. 대안 — react-i18next(ICU 미기본), lingui(빌드 파이프라인 추가). 결정 — ICU JSON을 packages/i18n에 두고 web은 next-intl 쿠키 기반(URL 프리픽스 없음 — Phase 4 결정), api 측 use-intl은 소비처 생길 때 도입(YAGNI). 트레이드오프 — URL에 locale이 없어 링크 공유 시 언어 비보존.

**0005 JIT 내부 패키지**: 배경 — 빌드 오케스트레이션 없이 타입 안전 공유. 대안 — 패키지별 tsc 빌드(느린 반복, 산출물 동기화), 단일 앱(경계 소멸). 결정 — exports가 TS 소스 직지, 소비 앱이 컴파일(web은 transpilePackages). 단 배포 시 api는 tsup, web은 standalone으로 번들. 트레이드오프 — 소비자마다 재컴파일, 패키지 단독 배포 불가.

**0006 코드-주인 스키마**: 배경 — 스키마 변경 이력을 코드 리뷰로 통제. 대안 — DB-주인(DBA 관리 DB에서 pull). 결정 — TS 스키마가 정본, drizzle-kit generate로 SQL 마이그레이션 생성·커밋. DB-주인 전환법은 README(drizzle-kit pull / Kysely+codegen). 트레이드오프 — 기존 DB 도입 시 초기 pull 필요, DDL 수동 변경 금지 규율 필요.

**0007 Drizzle 단독**: 배경 — ORM 단일화. 대안 검토와 기각 — **Prisma**: 자체 스키마 DSL·생성 클라이언트로 코드-주인 원칙과 이중 정본, 런타임 엔진 무게 → 기각. **Kysely**: 타입 안전 쿼리빌더로 우수하나 스키마/마이그레이션 도구가 없어 별도 스택 필요 → 단독 채택 기각(DB-주인 전환 경로의 codegen 대안으로는 README에 남김). 결정 — Drizzle 단독(스키마+쿼리+마이그레이션 일원화). 트레이드오프 — 상대적으로 어린 생태계; 실전 사례로 `$onUpdate`에 SQL 함수 주입이 드라이버에서 미지원이라 앱 시계 사용(테스트는 허용 오차로 흡수 — Phase 3 fallback 결정).

- [ ] **Step 2: agents/rules 작성**

`agents/rules/engineering-rules.md` — AI 협업 규칙, 각 규칙은 "규칙 / 이유 / 위반 예→수정 예" 3줄 구조:
1. DTO 경계: 라우터는 dto.parse() 결과만 반환 (DB 타입이 추론 타고 웹으로 새는 것 차단)
2. repository 밖 Drizzle 금지 + 필요한 컬럼만 select (`projectColumns` 패턴)
3. repository에 비즈니스 로직 금지 (분기는 service로)
4. 에러: 서비스/레포는 AppError, tRPC 변환은 미들웨어, TRPCError 직접 사용은 라우터만
5. i18n 키 추가 전 grep (기존 키 재사용 우선, ko/en 동시 추가)
6. surgical diff: 요청 범위 밖 리팩터·포맷 변경 금지
7. web에서 `@repo/features`는 dto 서브패스만 import (index는 DB 런타임 동반)

- [ ] **Step 3: 검증 + Commit**

```bash
ls docs/adr | wc -l   # 7
pnpm lint
git add -A && git commit -m "docs: add adr 0001-0007 and agent engineering rules"
```

---

### Task 5: README + CLAUDE.md 갱신 + 성공 기준 최종 점검

**Files:**
- Create: `README.md`
- Modify: `CLAUDE.md` (Phase 5 완료 상태)

- [ ] **Step 1: README.md 작성**

구조(각 절 내용 스펙 — 명령은 그대로, 산문 재량):
1. **개요** — 실무 웹 씨앗 모노레포 한 문단 + 기술 스택 표(스펙 §2 축약, pnpm 12)
2. **Quickstart (3명령)**:
   ```bash
   git clone <repo> && cd web-fullstack-bootstrap
   pnpm install
   pnpm dev
   ```
   이후: `pnpm db:seed` → http://localhost:3000 → `test@example.com` / `password1234`. 전제: Docker 실행 중, corepack enable.
3. **구조와 의존 계층** — §3 트리 + `lib → db → features → api → apps` 역방향 금지
4. **테스트 3층** — `pnpm test` / `pnpm test:integration`(testcontainers) / `pnpm e2e`(로컬 dev DB, 포트 3000·3001 비어 있어야 함)
5. **새 도메인 추가 (30분 절차)** — features/projects 복제→스키마 추가+`db:generate`→라우터 등록(root.ts)→web 페이지. 단계마다 대상 파일 경로 명시 (§11-4)
6. **배포**:
   - A. Docker: `docker compose -f docker-compose.prod.yml up -d --build` + `.env` 필수 키. **폐쇄망**: `docker save`/`docker load` 절차 명령 포함
   - B. OS 패키지: `pnpm package:os` → .deb/.rpm, 설치 후 `/etc/web-seed/env` 수정 → `systemctl enable --now web-seed-api web-seed-web`. conffile 보존·ExecStartPre 마이그레이션 설명. **macOS에서 구조 검증까지만 수행했고 실 리눅스 설치 검증은 사용자 몫**임을 명시
   - C. 단일 바이너리(문서만): api는 Node SEA/bun compile 경로 개요, web은 Next 서버+정적 자산 구조상 비실용 사유 (계획 결정 5)
7. **DB-주인 스키마 전환법** — drizzle-kit pull 모드 절차 + 대안 Kysely+codegen 경로 (§9)
8. **의도적 제외** — rate limit, Storybook, Sentry(자리 주석), 모바일/외부 API 소비자 (§1)
9. **알려진 개선점** — P4 이월 잔여: useFormatter 날짜 i18n, mutation invalidateQueries 예시, /login 로그인 상태 가드, saved 플래그 리셋, locale server action 런타임 검증, 상세/편집 에러 상태 UI
10. **ADR 목록** — 0001~0007 링크

- [ ] **Step 2: CLAUDE.md 현재 상태 갱신**

Phase 5 완료 + plan 링크 추가, "다음은..." 줄을 "전 Phase 완료 — 이후 작업은 README·ADR 기준" 류로 교체. 나머지 불변.

- [ ] **Step 3: 성공 기준(§11) 최종 점검 — 결과를 리포트에 표로**

```bash
pnpm install --frozen-lockfile && pnpm dev & DEV_PID=$!
sleep 20 && curl -sf http://localhost:3000/login -o /dev/null && curl -sf http://localhost:3001/healthz
kill $DEV_PID   # 및 자식 종료 — exact PID만
pnpm db:seed
pnpm type-check && pnpm lint && pnpm test && pnpm test:integration && pnpm e2e
grep -r "@repo/db" apps/web/src e2e ; echo "grep exit=$? (1=클린)"
```

기준 1(3명령 기동)·3(3층 테스트 그린)·5(웹 @repo/db 0건) 실측, 2(시드 로그인 5페이지)는 e2e+시드 경로로 근사, 4(30분 문서)는 README 절차 자체가 산출물.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "docs: add readme with quickstart, deploy guides and adr index"
```

---

## Phase 5 완료 기준

1. `pnpm build` 그린 — web standalone + api dist(index/migrate)
2. `docker compose -f docker-compose.prod.yml up` 전체 기동, 프록시 경유 가입 200 확인 후 down
3. `pnpm package:os` 가 .deb/.rpm 생성, 아카이브에 node/api/web/유닛/conffile 구조 확인
4. docs/adr 7건 + agents/rules + README 존재, README quickstart가 실측과 일치
5. 스펙 §11 점검: 1·3·5 실측 그린, 2 근사 검증, 4 문서 완비 — 결과 표가 최종 리포트에 존재
6. 기존 스위트(단위 18·통합 13·e2e 1) 회귀 없음, CI 3잡 그린
