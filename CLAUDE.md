# web-seed

실무 웹 프로젝트 씨앗 모노레포. cal.com 분석에서 배운 패턴 기반, 코드는 전부 신규 작성 (cal.com 코드 복사 금지 — AGPL).

## 현재 상태

- 설계 스펙 확정: [docs/superpowers/specs/2026-09-10-web-seed-design.md](docs/superpowers/specs/2026-09-10-web-seed-design.md) — 모든 작업의 기준 문서
- Phase 1 (모노레포 골격+툴링) 구현 완료: [docs/superpowers/plans/2026-09-10-phase1-skeleton.md](docs/superpowers/plans/2026-09-10-phase1-skeleton.md)
- Phase 2 (db+features/projects) 구현 완료: [docs/superpowers/plans/2026-09-10-phase2-db-features.md](docs/superpowers/plans/2026-09-10-phase2-db-features.md)
- Phase 3 (apps/api + tRPC + better-auth) 구현 완료: [docs/superpowers/plans/2026-09-10-phase3-api-auth.md](docs/superpowers/plans/2026-09-10-phase3-api-auth.md)
- 다음은 Phase 4 (apps/web + ui + i18n). Phase 4~5 계획은 각 직전 Phase 완료 후 작성

## 핵심 결정 (상세·근거는 스펙과 docs/adr/)

pnpm+Turborepo · Next 15(web) + Fastify+tRPC(별도 api 서버) · better-auth · Drizzle 단독(Prisma 아님) · next-intl+use-intl(ICU JSON 공유) · shadcn 신규 UI · 단순 DI(컨테이너 없음) · JIT 내부 패키지 · 3층 테스트(vitest/testcontainers/Playwright) · 배포는 Docker + nfpm(.deb/.rpm)

## 규칙

- 의존 계층 `lib → db → features → api → apps` 역방향 import 금지
- 테스트는 `TZ=UTC`, 커밋은 conventional commits
- 스펙과 다른 결정이 필요하면 구현 전에 사용자와 논의하고 ADR 갱신
