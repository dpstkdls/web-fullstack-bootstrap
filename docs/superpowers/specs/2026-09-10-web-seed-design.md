# web-seed 설계 스펙

> 2026-09-10 확정. cal.com(cal.diy) 코드베이스 분석에서 배운 신식 패턴을 기반으로 한
> 실무 프로젝트 씨앗(bootstrap) 모노레포. 코드는 전부 신규 작성 — cal.com 코드 복사 금지(AGPL).

## 1. 목적과 범위

- **용도**: 실무 웹 애플리케이션 프로젝트의 시작점. clone → 설정 → 도메인 교체로 바로 개발 시작.
- **포함**: DB(Postgres+Prisma), 인증(better-auth), i18n(ko/en), 예제 페이지 5개, 3층 테스트 인프라, CI, ADR 문서.
- **의도적 제외 (YAGNI, README에 명시)**: rate limit, Storybook, Sentry(자리만 주석), 모바일/외부 API 소비자 대응.

## 2. 기술 스택 (확정)

| 영역 | 선택 | 비고 |
|---|---|---|
| 패키지 매니저 | pnpm 9 (corepack 고정) | ADR-0001 |
| 태스크 러너 | Turborepo | |
| 프론트 | Next 15 (App Router) + React 19 | |
| 백엔드 | Fastify + tRPC 어댑터 (별도 서버) | ADR-0002 |
| API | tRPC (모노레포 타입 공유, 소비자는 웹 프론트뿐) | |
| 인증 | better-auth (email+password, Prisma adapter) | ADR-0003 |
| DB | PostgreSQL + Prisma (코드-주인 스키마) | DB-주인 전환법 README 기술 |
| i18n | next-intl(web) + use-intl 코어(api), ICU JSON 공유 | ADR-0004 |
| UI | shadcn/ui 기반 신규 구축 | Radix + Tailwind |
| 린트/포맷 | Biome | |
| 테스트 | vitest(TZ=UTC) + testcontainers + Playwright | |
| 커밋 훅 | husky + lint-staged + commitlint(conventional) | |
| 런타임 | Node 22 LTS (.nvmrc + engines + packageManager 3중 고정) | |

## 3. 레포 구조

```
web-seed/
├── apps/
│   ├── web/        Next 15 App Router · next-intl · tRPC 클라이언트 · better-auth 클라이언트
│   └── api/        Fastify · tRPC 서버 마운트 · better-auth 마운트
├── packages/
│   ├── api/        tRPC 라우터 정의 (api=런타임 소비, web=타입만 소비)
│   ├── features/   도메인 슬라이스 — framework-agnostic
│   ├── prisma/     스키마 + 마이그레이션 + dev용 docker-compose(Postgres) + 시드(테스트 계정/예제 데이터)
│   ├── ui/         shadcn 기반 공용 컴포넌트
│   ├── i18n/       ICU MessageFormat JSON (ko/en) — 단일 소스
│   ├── lib/        공용 유틸 (최하층) + env 검증(zod)
│   └── config/     공유 tsconfig · biome 설정
├── docs/adr/       Architecture Decision Records
├── agents/rules/   AI 에이전트용 엔지니어링 규칙 (신규 작성)
└── e2e/            Playwright
```

**의존 계층 (역방향 import 금지, 문서+리뷰로 강제):**

```
lib → prisma → features → api → apps/{web,api}
```

**내부 패키지는 JIT 방식**: 빌드 스텝 없이 TS 소스 직접 export, 소비 앱이 컴파일.
단, apps/api Docker 빌드 시에는 tsup으로 번들.

## 4. API·인증 흐름

- better-auth는 **apps/api에 마운트** (`/api/auth/*`). 인증은 백엔드 소유, 웹은 클라이언트 SDK만.
- 웹→API: **Next rewrites로 `/api/*` → Fastify(3001) 프록시**. 브라우저 관점 same-origin → CORS·쿠키 SameSite 문제 회피.
- tRPC context 생성 시 better-auth 세션 조회 → `publicProcedure` / `protectedProcedure` 미들웨어 분기.
- `pnpm dev` = turbo가 web(3000) + api(3001) + postgres(docker) 동시 기동.

### 요청 여정 (계층 책임)

```
HTTP → apps/api (Fastify: 호스트 역할만 — env검증/부팅/플러그인)
     → packages/api (tRPC 라우터: zod 파싱, 권한, DTO 반환 — 얇게)
     → features/services (비즈니스 규칙, 도메인 에러 throw)
     → features/repositories (Prisma 접촉 유일 지점)
```

### 에러 처리

- 서비스/레포지토리: `AppError(code, message)` throw (packages/lib).
- tRPC `errorFormatter`가 AppError → TRPCError 변환, 웹은 code로 분기.
- 라우터에서만 TRPCError 직접 사용 가능.

## 5. 도메인 계층 규칙

예제 도메인 `projects` 로 시연:

```
packages/features/projects/
├── repositories/PrismaProjectRepository.ts   # Prisma는 여기만. select만 사용(include 금지)
├── services/ProjectService.ts                # constructor 주입
├── di.ts                                     # getProjectService() 팩토리 (단순 주입 — 컨테이너 없음)
├── dto.ts                                    # zod 스키마 + DTO
└── *.test.ts
```

- **DI 수준**: constructor 주입 + 팩토리 함수. ioctopus류 컨테이너는 도입하지 않음(규모 커지면 재검토).
- **DTO 경계**: 라우터는 항상 `dto.parse()` 결과만 반환. Prisma 타입이 타입 추론을 타고
  웹으로 새는 것 차단 (agents/rules 1번 규칙).
- **트랜잭션**: `prisma.$transaction(async (tx) => ...)`의 tx 클라이언트를 repository 메서드에
  주입하는 패턴. 가입(User+Profile 동시 생성) 예제 1개 포함. 상세는 구현 단계에서.

## 6. 예제 페이지 5개

각 페이지는 repository→service→tRPC→UI 세로줄 전체를 시연한다.

| # | 라우트 | 시연 패턴 |
|---|---|---|
| 1 | /login, /signup | better-auth 흐름, 폼 검증 |
| 2 | /projects | 목록 + 필터 + 페이지네이션 (data table) |
| 3 | /projects/new, /projects/[id]/edit | 폼 + zod 클라/서버 이중 검증 |
| 4 | /projects/[id] | 상세 + 삭제 확인 dialog |
| 5 | /settings | 프로필 수정 + i18n 언어 전환 |

## 7. 테스트 인프라 (3층)

| 층 | 도구 | 예제 |
|---|---|---|
| 단위 | vitest (TZ=UTC) | ProjectService + mock repository |
| 통합 | vitest + testcontainers (Postgres 자동 기동/폐기) | PrismaProjectRepository 실 DB 검증 |
| E2E | Playwright | 가입→로그인→CRUD 스모크 1개 |

- mock/실물 repository 교체가 단순 DI의 가치 증명을 겸함.
- CI: GitHub Actions — install → type-check → lint(biome) → 단위 테스트. 통합/E2E는 별도 잡.

## 8. 품질 도구

- Biome (포맷+린트), 함수 길이 등 복잡도 규칙 warn.
- husky: pre-commit = lint-staged(변경 파일만 biome), commit-msg = commitlint.
  push 훅 없음 — CI가 최종 방어선.
- env 검증: `packages/lib/env.ts` — zod 파싱, 부팅 시 즉시 실패.

## 9. 문서

- **docs/adr/**: 0001 pnpm, 0002 Fastify+tRPC 분리 백엔드, 0003 better-auth,
  0004 next-intl, 0005 JIT 내부 패키지, 0006 코드-주인 스키마.
  각 장: 배경 / 대안 / 결정 / 트레이드오프.
- **agents/rules/**: AI 협업용 규칙 (신규 작성): DTO 경계, select-over-include,
  repository에 비즈니스 로직 금지, 에러 클래스 사용처, i18n 키 추가 전 grep, surgical diff.
- **README**: quickstart(3명령 이내 기동), 의도적 제외 목록, DB-주인 스키마 전환법(db pull 모드),
  ADR 목록 링크.

## 10. 배포

- Dockerfile 2개: apps/web(standalone output), apps/api(tsup 번들).
- prod용 docker-compose 예시 (web + api + postgres).
- 특정 클라우드 미전제 — 사내 서버/VM/k8s 어디든.

## 11. 성공 기준

1. `git clone` → `pnpm i` → `pnpm dev` 3명령으로 로컬 전체 기동 (docker 필요).
2. 테스트 계정 시드로 로그인 → 예제 5페이지 전부 동작.
3. `pnpm test`(단위) / `pnpm test:integration` / `pnpm e2e` 전부 그린.
4. 새 도메인 추가 절차가 문서 보고 30분 내 가능 (features 슬라이스 복제 → 라우터 등록 → 페이지).
5. 웹 코드 어디에도 `@repo/prisma` import 없음 (grep으로 검증 가능).
