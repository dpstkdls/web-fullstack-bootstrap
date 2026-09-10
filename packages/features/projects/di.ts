import type { Db } from "@repo/db/client";
import { DrizzleProjectRepository } from "./repositories/DrizzleProjectRepository";
import { ProjectService } from "./services/ProjectService";

export function getProjectService(db: Db): ProjectService {
  return new ProjectService(new DrizzleProjectRepository(db));
}
