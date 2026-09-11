import type { Db, DbLike } from "@repo/db/client";
import { profiles } from "@repo/db/schema";
import { eq } from "drizzle-orm";
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
