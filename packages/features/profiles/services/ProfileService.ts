import type { Db } from "@repo/db/client";
import { AppError } from "@repo/lib/errors";
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
