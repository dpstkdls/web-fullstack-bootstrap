import type { Db } from "@repo/db/client";
import { getProfileService, type ProfileService } from "@repo/features/profiles";
import { getProjectService, type ProjectService } from "@repo/features/projects";

export type { ProfileService, ProjectService };

// better-auth 타입에 의존하지 않는 최소 세션 형태 — apps/api 어댑터가 채워 넣는다
export type SessionUser = { id: string; email: string; name: string };

export type Context = {
  session: { user: SessionUser } | null;
  services: { projects: ProjectService; profiles: ProfileService };
};

export function createContext(db: Db, session: Context["session"]): Context {
  return {
    session,
    services: { projects: getProjectService(db), profiles: getProfileService(db) },
  };
}
