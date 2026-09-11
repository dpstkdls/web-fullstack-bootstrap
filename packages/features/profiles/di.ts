import type { Db } from "@repo/db/client";
import { DrizzleProfileRepository } from "./repositories/DrizzleProfileRepository";
import { ProfileService } from "./services/ProfileService";

export function getProfileService(db: Db): ProfileService {
  return new ProfileService(db, new DrizzleProfileRepository(db));
}
