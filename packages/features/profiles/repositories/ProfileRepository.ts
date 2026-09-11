import type { DbLike } from "@repo/db/client";
import type { ProfileDto, UpdateProfileInput } from "../dto";

export interface ProfileRepository {
  findByUserId(userId: string, db?: DbLike): Promise<ProfileDto | null>;
  insert(userId: string, db?: DbLike): Promise<ProfileDto>;
  update(userId: string, input: UpdateProfileInput): Promise<ProfileDto | null>;
}
