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
const fakeTxDb = {
  transaction: async <T>(fn: (tx: never) => Promise<T>) => fn(undefined as never),
};

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
