import type { Db } from "@repo/db/client";
import { AppError } from "@repo/lib/errors";
import type { ProfileDto, UpdateProfileInput } from "../dto";
import type { ProfileRepository } from "../repositories/ProfileRepository";

export class ProfileService {
  constructor(
    private readonly db: Pick<Db, "transaction">,
    private readonly repo: ProfileRepository,
  ) {}

  // 가입 훅과 profile.get(자가 치유)에서 호출. tx로 존재확인+생성을 묶어 동시 호출 시의
  // 원자성을 보장하고, 최종 중복 방지선은 profiles 테이블의 PK(userId) 제약이 맡는다.
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
