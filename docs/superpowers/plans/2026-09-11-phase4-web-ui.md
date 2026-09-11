# Phase 4: apps/web(Next 15) + packages/ui + packages/i18n + 예제 5페이지 + Playwright Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next 15 웹 앱을 rewrites 프록시로 Phase 3 API에 붙이고, shadcn UI + ICU i18n(ko/en) 기반 예제 5페이지(로그인/가입 · 목록 · 폼 · 상세/삭제 · 설정)를 완성, 가입→CRUD Playwright 스모크와 CI e2e 잡까지 그린으로 만든다.

**Architecture:** 웹은 tRPC 타입과 zod DTO만 소비 — DB/서비스 런타임은 절대 웹 번들에 들어오지 않는다(§11-5). 브라우저 관점 same-origin: Next rewrites가 `/api/*`를 Fastify(3001)로 프록시해 쿠키/CORS 문제를 회피(스펙 §4). i18n은 쿠키 기반 locale(라우팅 프리픽스 없음), 메시지는 `@repo/i18n` 단일 소스.

**Tech Stack:** Next 15(App Router) + React 19 · Tailwind CSS 4 + shadcn/ui · next-intl · @trpc/client + @trpc/tanstack-react-query + @tanstack/react-query + superjson · better-auth/react · react-hook-form + @hookform/resolvers · Playwright

**Spec:** docs/superpowers/specs/2026-09-10-web-seed-design.md (§3 구조, §4 인증 흐름, §6 예제 5페이지, §7 테스트)

## Global Constraints

- 의존 계층: web은 `@repo/ui`, `@repo/i18n`, `@repo/api`(타입만), `@repo/features/*/dto`(zod만), `@repo/lib`만 소비. **웹 코드 어디에도 `@repo/db` import 없음** (완료 기준, grep 검증)
- tRPC 클라이언트는 superjson transformer 필수 (서버와 대칭)
- 서버가 항상 재검증하므로 클라 폼 검증은 UX용 — zod 클라/서버 이중 검증 (스펙 §6-3)
- 테스트 `TZ=UTC`, conventional commits, 주석 "왜"만
- 포트: web 3000, api 3001. 테스트 계정 `test@example.com` / `password1234`
- 모든 사용자-노출 문자열은 `@repo/i18n` 메시지 경유 (하드코딩 금지)

**계획 확정 결정 (구현 단계 확정 — 리뷰 시 plan-mandated):**
1. **next-intl은 쿠키 기반**(`NEXT_LOCALE`, 기본 ko), URL 프리픽스 라우팅 없음 — 스펙 §6-5 언어 전환 충족 + URL 단순.
2. **web은 `@repo/features`의 dto 서브패스만 import** — features package.json에 `"./projects/dto"`, `"./profiles/dto"` exports 추가(Task 3). index를 import하면 Drizzle/DB가 번들에 딸려오므로 금지.
3. **shadcn CLI 생성 컴포넌트는 계획에 인라인하지 않음** — components.json(aliases가 `@repo/ui/*` 서브패스 사용)과 생성 목록이 계약. 생성 코드는 리뷰에서 "CLI 산출물 + biome 포맷"으로 취급.
4. **인증 폼 스키마는 web 로컬 zod** — 인증 입력은 better-auth 소유, features dto 아님.
5. **e2e는 로컬 dev DB 사용**(db:up+migrate 선행), testcontainers 아님 — dev 환경과 동일 경로 검증이 목적.
6. **use-intl(api 서버 측 i18n)은 소비처가 생길 때까지 미도입** — 스펙 §2 표기는 유지하되 Phase 4 범위 아님 (YAGNI, README/ADR은 Phase 5).

**이 Phase 범위 아님:** Docker/tsup/standalone 빌드·README·ADR(Phase 5), rate limit·Storybook 등 의도적 제외(§1).

---

### Task 1: packages/i18n — ICU 메시지 (ko/en)

**Files:**
- Create: `packages/i18n/package.json`, `packages/i18n/messages/ko.json`, `packages/i18n/messages/en.json`

**Interfaces:**
- Produces (Task 3~7이 소비): `@repo/i18n/messages/ko`·`/en` (JSON import), 네임스페이스 `common | auth | projects | settings`. 키 목록은 아래 JSON이 정본 — 이후 태스크는 여기 있는 키만 사용.

- [ ] **Step 1: 패키지 작성**

`packages/i18n/package.json`:
```json
{
  "name": "@repo/i18n",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./messages/*": "./messages/*.json"
  }
}
```

`packages/i18n/messages/ko.json`:
```json
{
  "common": {
    "appName": "Web Seed",
    "save": "저장",
    "cancel": "취소",
    "delete": "삭제",
    "edit": "수정",
    "loading": "불러오는 중…",
    "logout": "로그아웃"
  },
  "auth": {
    "loginTitle": "로그인",
    "signupTitle": "가입",
    "email": "이메일",
    "password": "비밀번호",
    "name": "이름",
    "submitLogin": "로그인",
    "submitSignup": "가입하기",
    "toSignup": "계정이 없나요? 가입",
    "toLogin": "이미 계정이 있나요? 로그인",
    "failed": "인증에 실패했습니다"
  },
  "projects": {
    "title": "프로젝트",
    "new": "새 프로젝트",
    "newTitle": "새 프로젝트",
    "editTitle": "프로젝트 수정",
    "name": "이름",
    "description": "설명",
    "status": "상태",
    "statusActive": "진행중",
    "statusArchived": "보관됨",
    "statusAll": "전체",
    "searchPlaceholder": "이름 검색…",
    "empty": "프로젝트가 없습니다",
    "prev": "이전",
    "next": "다음",
    "pageInfo": "{page} / {totalPages} 페이지",
    "deleteConfirm": "정말 삭제할까요? 되돌릴 수 없습니다.",
    "createdAt": "생성일"
  },
  "settings": {
    "title": "설정",
    "displayName": "표시 이름",
    "locale": "언어",
    "saved": "저장되었습니다"
  }
}
```

`packages/i18n/messages/en.json`:
```json
{
  "common": {
    "appName": "Web Seed",
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "loading": "Loading…",
    "logout": "Log out"
  },
  "auth": {
    "loginTitle": "Log in",
    "signupTitle": "Sign up",
    "email": "Email",
    "password": "Password",
    "name": "Name",
    "submitLogin": "Log in",
    "submitSignup": "Sign up",
    "toSignup": "No account? Sign up",
    "toLogin": "Already have an account? Log in",
    "failed": "Authentication failed"
  },
  "projects": {
    "title": "Projects",
    "new": "New project",
    "newTitle": "New project",
    "editTitle": "Edit project",
    "name": "Name",
    "description": "Description",
    "status": "Status",
    "statusActive": "Active",
    "statusArchived": "Archived",
    "statusAll": "All",
    "searchPlaceholder": "Search by name…",
    "empty": "No projects yet",
    "prev": "Prev",
    "next": "Next",
    "pageInfo": "Page {page} / {totalPages}",
    "deleteConfirm": "Delete this project? This cannot be undone.",
    "createdAt": "Created"
  },
  "settings": {
    "title": "Settings",
    "displayName": "Display name",
    "locale": "Language",
    "saved": "Saved"
  }
}
```

- [ ] **Step 2: 검증 — JSON 유효성 + ko/en 키 대칭**

```bash
node -e '
const ko = require("./packages/i18n/messages/ko.json");
const en = require("./packages/i18n/messages/en.json");
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => typeof v === "object" ? flat(v, p + k + ".") : [p + k]);
const [a, b] = [flat(ko).sort().join(), flat(en).sort().join()];
if (a !== b) { console.error("key mismatch"); process.exit(1); }
console.log("i18n keys symmetric:", flat(ko).length);
'
```

Expected: `i18n keys symmetric: 39` (에러 없이 종료).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(i18n): add ko/en icu message catalogs"
```

---

### Task 2: packages/ui — shadcn 기반 공용 컴포넌트

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/components.json`, `packages/ui/src/styles/globals.css`, `packages/ui/src/lib/utils.ts`(CLI 생성), `packages/ui/src/components/*.tsx`(CLI 생성)

**Interfaces:**
- Produces (Task 3~7이 소비): `@repo/ui/components/<name>` (button, input, label, card, table, dialog, select, badge, form, sonner), `@repo/ui/lib/utils`(cn), `@repo/ui/globals.css`(Tailwind 4 theme — web이 import)

- [ ] **Step 1: 패키지 뼈대 작성**

`packages/ui/package.json`:
```json
{
  "name": "@repo/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./globals.css": "./src/styles/globals.css",
    "./lib/*": "./src/lib/*.ts",
    "./components/*": "./src/components/*.tsx"
  },
  "scripts": {
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "class-variance-authority": "^0.7",
    "clsx": "^2",
    "lucide-react": "^0.544",
    "tailwind-merge": "^3"
  },
  "devDependencies": {
    "@repo/config": "workspace:*",
    "@types/react": "^19",
    "react": "^19",
    "react-dom": "^19",
    "tailwindcss": "^4",
    "typescript": "^5"
  },
  "peerDependencies": {
    "react": "^19",
    "react-dom": "^19"
  }
}
```

`packages/ui/tsconfig.json`:
```json
{
  "extends": "@repo/config/tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

`packages/ui/components.json` (aliases가 워크스페이스 self-reference를 쓰는 shadcn 모노레포 패턴 — 생성 코드의 import가 소비 앱에서도 그대로 해석된다):
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@repo/ui/components",
    "utils": "@repo/ui/lib/utils",
    "ui": "@repo/ui/components",
    "lib": "@repo/ui/lib",
    "hooks": "@repo/ui/hooks"
  }
}
```

`packages/ui/src/styles/globals.css` — Tailwind 4 진입점 (shadcn add가 theme 변수 블록을 이 파일에 주입한다):
```css
@import "tailwindcss";
```

- [ ] **Step 2: 설치 + 컴포넌트 생성**

```bash
pnpm i
cd packages/ui && pnpm dlx shadcn@latest add button input label card table dialog select badge form sonner --yes && cd ../..
```

Expected: `packages/ui/src/components/`에 10개 컴포넌트 + `src/lib/utils.ts` 생성, globals.css에 `@theme`/CSS 변수 블록 주입. 생성 파일의 import가 `@repo/ui/lib/utils` 형태인지 확인 (`grep -r "@/lib" packages/ui/src` → 0건이어야 함; 있으면 components.json aliases 문제 — sed로 `@/`를 `@repo/ui/`로 치환하고 원인 리포트).

주의: CLI가 react-hook-form(form), sonner 등 의존성을 ui package.json에 추가한다 — 정상. 새 dep의 빌드 승인 프롬프트가 뜨면 pnpm-workspace.yaml `allowBuilds`에 **실제 boolean으로** 기록 (플레이스홀더 텍스트 커밋 금지 — 반복된 사고).

- [ ] **Step 3: 검증**

```bash
pnpm type-check && pnpm lint
```

Expected: 둘 다 그린 (biome이 생성 코드를 재포맷할 수 있음 — `pnpm lint:fix` 후 재실행 허용, 결과는 리포트에 명시).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(ui): add shadcn-based shared components"
```

---

### Task 3: apps/web 골격 — Next 15 + 프록시 + tRPC/auth 클라이언트 + i18n 배선

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/i18n/request.ts`, `apps/web/src/trpc/react.tsx`, `apps/web/src/lib/auth-client.ts`, `apps/web/src/lib/session.ts`
- Modify: `packages/features/package.json` (dto 서브패스 exports), 루트 `package.json` (dev 스크립트)

**Interfaces:**
- Consumes: `@repo/ui/globals.css`, `@repo/i18n/messages/*`, `@repo/api`(AppRouter 타입)
- Produces (Task 4~7이 소비):
  - `useTRPC()`/`ApiProvider` (`src/trpc/react.tsx`) — `useQuery(trpc.projects.list.queryOptions(input))` 패턴
  - `authClient` (`src/lib/auth-client.ts`) — signIn/signUp/signOut/useSession
  - `getServerSession()` (`src/lib/session.ts`) — RSC용, null이면 미인증
  - features exports: `@repo/features/projects/dto`, `@repo/features/profiles/dto`

- [ ] **Step 1: features dto 서브패스 노출 (결정 2)**

`packages/features/package.json`의 `exports`에 추가:
```json
    "./projects/dto": "./projects/dto.ts",
    "./profiles/dto": "./profiles/dto.ts"
```

- [ ] **Step 2: 앱 뼈대 작성**

`apps/web/package.json`:
```json
{
  "name": "web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@hookform/resolvers": "^5",
    "@repo/features": "workspace:*",
    "@repo/i18n": "workspace:*",
    "@repo/ui": "workspace:*",
    "@tanstack/react-query": "^5",
    "@trpc/client": "^11",
    "@trpc/tanstack-react-query": "^11",
    "better-auth": "^1",
    "next": "^15",
    "next-intl": "^4",
    "react": "^19",
    "react-dom": "^19",
    "react-hook-form": "^7",
    "superjson": "^2",
    "zod": "^4"
  },
  "devDependencies": {
    "@repo/api": "workspace:*",
    "@repo/config": "workspace:*",
    "@tailwindcss/postcss": "^4",
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

(`@repo/api`는 devDependencies — AppRouter **타입**만 import. 런타임 import 금지.)

`apps/web/tsconfig.json`:
```json
{
  "extends": "@repo/config/tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] },
    "allowJs": true,
    "incremental": true
  },
  "include": ["next-env.d.ts", "src", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/next.config.ts`:
```typescript
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  // JIT 내부 패키지(TS 소스)를 web이 직접 컴파일 (스펙 §3)
  transpilePackages: ["@repo/ui", "@repo/i18n", "@repo/features", "@repo/lib"],
  async rewrites() {
    // same-origin 프록시 — 쿠키 SameSite/CORS 문제 회피 (스펙 §4)
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
```

`apps/web/postcss.config.mjs`:
```javascript
export default { plugins: { "@tailwindcss/postcss": {} } };
```

`apps/web/src/app/globals.css`:
```css
@import "@repo/ui/globals.css";
@source "../../../../packages/ui/src";
```

`apps/web/src/i18n/request.ts`:
```typescript
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale: Locale = LOCALES.includes(cookieLocale as Locale) ? (cookieLocale as Locale) : "ko";
  return {
    locale,
    messages: (await import(`@repo/i18n/messages/${locale}.json`)).default,
  };
});
```

`apps/web/src/trpc/react.tsx`:
```typescript
"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";
import type { AppRouter } from "@repo/api";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })],
    }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

`apps/web/src/lib/auth-client.ts`:
```typescript
import { createAuthClient } from "better-auth/react";

// baseURL 생략 — rewrites 프록시 덕에 same-origin /api/auth/* 로 나간다
export const authClient = createAuthClient();
```

`apps/web/src/lib/session.ts`:
```typescript
import { headers } from "next/headers";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

export type ServerSession = { user: { id: string; email: string; name: string } } | null;

// RSC는 rewrites를 안 타므로 API 오리진으로 직접, 쿠키는 수동 전달
export async function getServerSession(): Promise<ServerSession> {
  const cookie = (await headers()).get("cookie") ?? "";
  const res = await fetch(`${API_ORIGIN}/api/auth/get-session`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body?.user ? body : null;
}
```

`apps/web/src/app/layout.tsx`:
```tsx
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ApiProvider } from "@/trpc/react";
import "./globals.css";

export const metadata = { title: "Web Seed" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ApiProvider>{children}</ApiProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

`apps/web/src/app/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/projects");
}
```

- [ ] **Step 3: 루트 dev 오케스트레이션 (스펙 §4: pnpm dev = web+api+postgres)**

루트 `package.json`의 `dev` 스크립트를 교체:
```json
    "dev": "pnpm db:up && turbo run dev",
```

- [ ] **Step 4: 부팅 스모크 검증**

```bash
pnpm i && pnpm type-check
pnpm db:up && pnpm db:migrate
pnpm --filter api exec tsx src/index.ts &
pnpm --filter web dev &
sleep 12
curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/login ; echo " (미구현 404 허용)"
curl -s http://localhost:3000/api/auth/get-session ; echo " <- rewrites 프록시 경유 응답(null이면 정상)"
kill %1 %2
```

Expected: web 기동, `/api/auth/get-session`이 프록시 경유로 JSON 응답(null) — 프록시 체인 동작 증명. (/login 404는 Task 4 전이라 정상. `/` → /projects redirect도 Task 5 전이라 404 — 무시.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): scaffold next app with proxy, trpc client and i18n"
```

---

### Task 4: 인증 페이지 (예제 1) + 보호 레이아웃

**Files:**
- Create: `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/app/(auth)/signup/page.tsx`, `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/components/logout-button.tsx`

**Interfaces:**
- Consumes: Task 3의 authClient/getServerSession, `@repo/ui`, i18n `auth`/`common`
- Produces: `(app)` 그룹 = 인증 필수 구역 (Task 5~7 페이지가 이 아래 들어감), 상단 네비게이션

- [ ] **Step 1: 로그인 페이지**

`apps/web/src/app/(auth)/login/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

export default function LoginPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(false);
    const form = new FormData(e.currentTarget);
    const { error: authError } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (authError) return setError(true);
    router.push("/projects");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("loginTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" name="password" type="password" required minLength={8} />
            </div>
            {error && <p className="text-sm text-destructive">{t("failed")}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {t("submitLogin")}
            </Button>
            <Link href="/signup" className="block text-center text-sm underline">
              {t("toSignup")}
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: 가입 페이지**

`apps/web/src/app/(auth)/signup/page.tsx` — 로그인과 동일 구조에 name 필드 추가, `authClient.signUp.email({ email, password, name })` 호출, 성공 시 `/projects`. 문자열은 `t("signupTitle")`/`t("submitSignup")`/`t("toLogin")`(→ `/login` 링크). 전체 코드는 로그인 페이지를 기준으로 아래 diff만 다르다:
```tsx
// 추가 필드 (email 위):
<div className="space-y-2">
  <Label htmlFor="name">{t("name")}</Label>
  <Input id="name" name="name" required />
</div>
// 호출부:
const { error: authError } = await authClient.signUp.email({
  email: String(form.get("email")),
  password: String(form.get("password")),
  name: String(form.get("name")),
});
```

- [ ] **Step 3: 보호 레이아웃 + 로그아웃**

`apps/web/src/app/(app)/layout.tsx`:
```tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/lib/session";
import { LogoutButton } from "@/components/logout-button";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");
  const t = await getTranslations("common");
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <nav className="flex items-center gap-6">
          <Link href="/projects" className="font-semibold">
            {t("appName")}
          </Link>
          <Link href="/settings" className="text-sm text-muted-foreground">
            {t("settingsLink", { default: "Settings" })}
          </Link>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{session.user.email}</span>
          <LogoutButton label={t("logout")} />
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-6">{children}</main>
    </div>
  );
}
```

주의: `settingsLink` 키가 i18n에 없다 — **ko/en 양쪽에 `common.settingsLink`("설정"/"Settings") 추가**하고 `t("settingsLink")`로 단순 호출 (default 옵션 사용 금지 — 카탈로그가 정본).

`apps/web/src/components/logout-button.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@repo/ui/components/button";

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
      }}
    >
      {label}
    </Button>
  );
}
```

- [ ] **Step 4: 수동 검증 (api+web 기동 상태에서)**

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm --filter api exec tsx src/index.ts & pnpm --filter web dev & sleep 12
curl -sf -o /dev/null -w "login:%{http_code}\n" http://localhost:3000/login
curl -s -o /dev/null -w "projects-unauth:%{http_code}\n" -L --max-redirs 0 http://localhost:3000/projects
kill %1 %2; pnpm type-check
```

Expected: login 200. projects는 (app) 레이아웃의 redirect로 307/303 (Location /login). type-check 그린. (실 로그인 플로우는 Task 8 e2e가 검증.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): add login/signup pages and protected layout"
```

---

### Task 5: /projects 목록 + 필터 + 페이지네이션 (예제 2)

**Files:**
- Create: `apps/web/src/app/(app)/projects/page.tsx`

**Interfaces:**
- Consumes: `useTRPC`(list), `@repo/features/projects/dto`(ListProjectsQuery 타입·projectStatusSchema), ui table/select/input/badge/button, i18n `projects`

- [ ] **Step 1: 목록 페이지 작성**

`apps/web/src/app/(app)/projects/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ProjectStatus } from "@repo/features/projects/dto";
import { useTRPC } from "@/trpc/react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

const PAGE_SIZE = 10;

export default function ProjectsPage() {
  const t = useTranslations("projects");
  const trpc = useTRPC();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "all">("all");
  const [page, setPage] = useState(1);

  const query = useQuery(
    trpc.projects.list.queryOptions({
      q: q || undefined,
      status: status === "all" ? undefined : status,
      page,
      pageSize: PAGE_SIZE,
    }),
  );

  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Button asChild>
          <Link href="/projects/new">{t("new")}</Link>
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder={t("searchPlaceholder")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as ProjectStatus | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("statusAll")}</SelectItem>
            <SelectItem value="active">{t("statusActive")}</SelectItem>
            <SelectItem value="archived">{t("statusArchived")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("createdAt")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                {t("empty")}
              </TableCell>
            </TableRow>
          )}
          {query.data?.items.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <Link href={`/projects/${p.id}`} className="underline-offset-2 hover:underline">
                  {p.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={p.status === "active" ? "default" : "secondary"}>
                  {p.status === "active" ? t("statusActive") : t("statusArchived")}
                </Badge>
              </TableCell>
              <TableCell>{p.createdAt.toLocaleDateString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-end gap-2 text-sm">
        <span>{t("pageInfo", { page, totalPages })}</span>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          {t("prev")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          {t("next")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 검증**

api+web 기동 후 브라우저 없이: `pnpm type-check` 그린 + `curl -sf http://localhost:3000/projects` (로그인 필요라 redirect — 페이지 컴파일 에러 없는지 web dev 로그 확인). 시드 데이터 확인은 Task 8 e2e.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(web): add projects list with filter and pagination"
```

---

### Task 6: /projects/new · [id]/edit · [id] 상세+삭제 (예제 3·4)

**Files:**
- Create: `apps/web/src/components/project-form.tsx`, `apps/web/src/app/(app)/projects/new/page.tsx`, `apps/web/src/app/(app)/projects/[id]/page.tsx`, `apps/web/src/app/(app)/projects/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `useTRPC`(byId/create/update/delete), `@repo/features/projects/dto`(projectStatusSchema, 타입), react-hook-form + zodResolver, ui form/dialog
- Produces: `ProjectForm` 공용 컴포넌트 (new/edit 공유)

- [ ] **Step 1: 공용 폼 (클라 zod 검증 — 서버 zod와 이중, 스펙 §6-3)**

`apps/web/src/components/project-form.tsx`:
```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { projectStatusSchema } from "@repo/features/projects/dto";
import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

// 폼 표현용 스키마 — 제출 시 DTO 형태(description null 변환)로 매핑. 서버가 항상 재검증한다.
const formSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  status: projectStatusSchema,
});
export type ProjectFormValues = z.infer<typeof formSchema>;

export type ProjectFormSubmit = {
  name: string;
  description: string | null;
  status: z.infer<typeof projectStatusSchema>;
};

export function ProjectForm({
  defaults,
  pending,
  onSubmit,
}: {
  defaults?: Partial<ProjectFormValues>;
  pending: boolean;
  onSubmit: (values: ProjectFormSubmit) => void;
}) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", status: "active", ...defaults },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) =>
          onSubmit({ ...v, description: v.description === "" ? null : v.description }),
        )}
        className="max-w-lg space-y-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("name")}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("description")}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("status")}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="active">{t("statusActive")}</SelectItem>
                  <SelectItem value="archived">{t("statusArchived")}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={pending}>
          {tc("save")}
        </Button>
      </form>
    </Form>
  );
}
```

- [ ] **Step 2: new / edit 페이지**

`apps/web/src/app/(app)/projects/new/page.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useTRPC } from "@/trpc/react";
import { ProjectForm } from "@/components/project-form";

export default function NewProjectPage() {
  const t = useTranslations("projects");
  const trpc = useTRPC();
  const router = useRouter();
  const create = useMutation(
    trpc.projects.create.mutationOptions({
      onSuccess: (created) => router.push(`/projects/${created.id}`),
    }),
  );
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
      <ProjectForm pending={create.isPending} onSubmit={(v) => create.mutate(v)} />
    </div>
  );
}
```

`apps/web/src/app/(app)/projects/[id]/edit/page.tsx`:
```tsx
"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useTRPC } from "@/trpc/react";
import { ProjectForm } from "@/components/project-form";

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const trpc = useTRPC();
  const router = useRouter();
  const query = useQuery(trpc.projects.byId.queryOptions({ id }));
  const update = useMutation(
    trpc.projects.update.mutationOptions({
      onSuccess: () => router.push(`/projects/${id}`),
    }),
  );
  if (!query.data) return <p>{tc("loading")}</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("editTitle")}</h1>
      <ProjectForm
        defaults={{
          name: query.data.name,
          description: query.data.description ?? "",
          status: query.data.status,
        }}
        pending={update.isPending}
        onSubmit={(v) => update.mutate({ id, patch: v })}
      />
    </div>
  );
}
```

- [ ] **Step 3: 상세 + 삭제 확인 dialog**

`apps/web/src/app/(app)/projects/[id]/page.tsx`:
```tsx
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useTRPC } from "@/trpc/react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const query = useQuery(trpc.projects.byId.queryOptions({ id }));
  const del = useMutation(
    trpc.projects.delete.mutationOptions({ onSuccess: () => router.push("/projects") }),
  );

  if (!query.data) return <p>{tc("loading")}</p>;
  const p = query.data;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{p.name}</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/projects/${id}/edit`}>{tc("edit")}</Link>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive">{tc("delete")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("deleteConfirm")}</DialogTitle>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {tc("cancel")}
                </Button>
                <Button
                  variant="destructive"
                  disabled={del.isPending}
                  onClick={() => del.mutate({ id })}
                >
                  {tc("delete")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">{p.description ?? "—"}</p>
        <Badge variant={p.status === "active" ? "default" : "secondary"}>
          {p.status === "active" ? t("statusActive") : t("statusArchived")}
        </Badge>
        <p>
          {t("createdAt")}: {p.createdAt.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: 검증 + Commit**

```bash
pnpm type-check && pnpm lint
git add -A && git commit -m "feat(web): add project create/edit form and detail with delete dialog"
```

---

### Task 7: /settings — 프로필 수정 + 언어 전환 (예제 5)

**Files:**
- Create: `apps/web/src/app/(app)/settings/page.tsx`, `apps/web/src/app/actions/locale.ts`

**Interfaces:**
- Consumes: `useTRPC`(profile.get/update), `@repo/features/profiles/dto`, i18n `settings`

- [ ] **Step 1: locale 쿠키 server action**

`apps/web/src/app/actions/locale.ts`:
```typescript
"use server";

import { cookies } from "next/headers";

export async function setLocaleCookie(locale: "ko" | "en") {
  (await cookies()).set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}
```

- [ ] **Step 2: 설정 페이지**

`apps/web/src/app/(app)/settings/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { setLocaleCookie } from "@/app/actions/locale";
import { useTRPC } from "@/trpc/react";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useQuery(trpc.profile.get.queryOptions());
  const [displayName, setDisplayName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile.data) setDisplayName(profile.data.displayName ?? "");
  }, [profile.data]);

  const update = useMutation(
    trpc.profile.update.mutationOptions({
      onSuccess: async (updated) => {
        await setLocaleCookie(updated.locale as "ko" | "en");
        await queryClient.invalidateQueries();
        setSaved(true);
        router.refresh(); // locale 쿠키 반영 — RSC 메시지 재로드
      },
    }),
  );

  if (!profile.data) return <p>{tc("loading")}</p>;

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">{t("displayName")}</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("locale")}</Label>
          <Select
            value={profile.data.locale}
            onValueChange={(locale) =>
              update.mutate({ locale: locale as "ko" | "en" })
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ko">한국어</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {saved && <p className="text-sm text-muted-foreground">{t("saved")}</p>}
        <Button
          disabled={update.isPending}
          onClick={() => update.mutate({ displayName: displayName === "" ? null : displayName })}
        >
          {tc("save")}
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: 검증 + Commit**

```bash
pnpm type-check && pnpm lint
git add -A && git commit -m "feat(web): add settings page with profile and locale switch"
```

---

### Task 8: Playwright e2e 스모크 + CI e2e 잡

**Files:**
- Create: `e2e/package.json`, `e2e/playwright.config.ts`, `e2e/tests/smoke.spec.ts`
- Modify: 루트 `package.json` (e2e 스크립트), `pnpm-workspace.yaml` (`- "e2e"` 추가 — 스펙 §3의 루트 `e2e/` 디렉터리는 기존 글롭에 안 걸림), `.github/workflows/ci.yml` (e2e 잡)

- [ ] **Step 1: e2e 패키지**

`e2e/package.json`:
```json
{
  "name": "e2e",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1"
  }
}
```

`pnpm-workspace.yaml`의 `packages:`에 추가:
```yaml
  - "e2e"
```

`e2e/playwright.config.ts`:
```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000" },
  // DB는 선행 조건: pnpm db:up && pnpm db:migrate (루트 e2e 스크립트가 체인)
  webServer: [
    {
      command: "pnpm --filter api exec tsx src/index.ts",
      url: "http://localhost:3001/healthz",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter web dev",
      url: "http://localhost:3000/login",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
```

- [ ] **Step 2: 스모크 테스트 (스펙 §7: 가입→로그인→CRUD 1개)**

`e2e/tests/smoke.spec.ts`:
```typescript
import { expect, test } from "@playwright/test";

test("signup → create → list → delete project", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const projectName = `E2E Project ${Date.now()}`;

  await page.goto("/signup");
  await page.getByLabel(/이름|Name/).fill("E2E Tester");
  await page.getByLabel(/이메일|Email/).fill(email);
  await page.getByLabel(/비밀번호|Password/).fill("password1234");
  await page.getByRole("button", { name: /가입하기|Sign up/ }).click();
  await expect(page).toHaveURL(/\/projects/);

  await page.getByRole("link", { name: /새 프로젝트|New project/ }).click();
  await page.getByLabel(/^이름$|^Name$/).fill(projectName);
  await page.getByRole("button", { name: /저장|Save/ }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

  await page.goto("/projects");
  await expect(page.getByRole("link", { name: projectName })).toBeVisible();

  await page.getByRole("link", { name: projectName }).click();
  await page.getByRole("button", { name: /삭제|Delete/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /삭제|Delete/ }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("link", { name: projectName })).toHaveCount(0);
});
```

- [ ] **Step 3: 루트 스크립트 + 로컬 실행**

루트 `package.json` scripts에 추가:
```json
    "e2e": "pnpm db:up && pnpm db:migrate && pnpm --filter e2e exec playwright test"
```

```bash
pnpm i
pnpm --filter e2e exec playwright install chromium
pnpm e2e
```

Expected: 1/1 PASS. 실패 시 스크린샷/트레이스로 원인 파악 후 web 페이지 코드 수정 가능 (수정 내역은 리포트에 명시; assertion 약화 금지).

- [ ] **Step 4: CI e2e 잡 추가**

`.github/workflows/ci.yml`의 `jobs`에 추가 (기존 잡 불변):
```yaml
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter e2e exec playwright install --with-deps chromium
      - run: pnpm e2e
```

- [ ] **Step 5: 전체 리허설**

```bash
pnpm install --frozen-lockfile && pnpm type-check && pnpm lint && pnpm test && pnpm test:integration && pnpm e2e
```

Expected: 전부 그린 (단위 18, 통합 13, e2e 1).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "test(e2e): add signup-to-crud smoke and ci job"
```

---

## Phase 4 완료 기준

1. `pnpm i && pnpm dev` 로 web(3000)+api(3001)+postgres 동시 기동 (스펙 §11-1, db:up 포함)
2. 시드 계정 로그인 → 예제 5페이지 전부 동작 (로그인/가입 · 목록+필터+페이지네이션 · 폼 · 상세+삭제 dialog · 설정+언어 전환)
3. `pnpm e2e` 스모크 1/1 그린, CI 3잡(check/integration/e2e) 그린
4. 언어 전환 시 UI 문자열 ko↔en 즉시 반영 (쿠키 + router.refresh)
5. `grep -r "@repo/db" apps/web` → 0건 (스펙 §11-5)
6. `pnpm type-check && pnpm lint && pnpm test && pnpm test:integration` 기존 스위트 전부 그린 유지
