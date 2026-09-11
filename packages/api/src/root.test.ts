import type { ProjectDto } from "@repo/features/projects";
import { AppError } from "@repo/lib/errors";
import { describe, expect, it } from "vitest";
import type { Context, ProfileService, ProjectService } from "./context";
import { appRouter, createCaller } from "./root";

const now = new Date();
const FAKE_PROJECT: ProjectDto = {
  id: "3f1e2d3c-0000-4000-8000-000000000001",
  name: "Alpha",
  description: null,
  status: "active",
  createdAt: now,
  updatedAt: now,
};

function ctxWith(overrides: {
  session?: Context["session"];
  projects?: Partial<ProjectService>;
  profiles?: Partial<ProfileService>;
}): Context {
  const session =
    "session" in overrides
      ? (overrides.session as Context["session"])
      : { user: { id: "u1", email: "t@e.com", name: "T" } };
  return {
    session,
    services: {
      projects: (overrides.projects ?? {}) as ProjectService,
      profiles: (overrides.profiles ?? {}) as ProfileService,
    },
  };
}

describe("appRouter", () => {
  it("rejects unauthenticated calls with UNAUTHORIZED", async () => {
    const caller = createCaller(ctxWith({ session: null }));
    await expect(caller.projects.list({ page: 1, pageSize: 20 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("maps AppError NOT_FOUND from service to TRPCError NOT_FOUND", async () => {
    const caller = createCaller(
      ctxWith({
        projects: {
          getById: async () => {
            throw new AppError("NOT_FOUND", "project x not found");
          },
        },
      }),
    );
    await expect(caller.projects.byId({ id: FAKE_PROJECT.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("enforces DTO boundary: extra service fields never leave the router", async () => {
    const leaking = { ...FAKE_PROJECT, secretColumn: "leak" };
    const caller = createCaller(
      ctxWith({ projects: { getById: async () => leaking as ProjectDto } }),
    );
    const result = await caller.projects.byId({ id: FAKE_PROJECT.id });
    expect(result).not.toHaveProperty("secretColumn");
    expect(result.name).toBe("Alpha");
  });

  it("profile.get returns own profile from session user", async () => {
    const caller = createCaller(
      ctxWith({
        profiles: {
          getByUserId: async (userId: string) => ({
            userId,
            displayName: null,
            locale: "ko",
            createdAt: now,
            updatedAt: now,
          }),
        },
      }),
    );
    const profile = await caller.profile.get();
    expect(profile.userId).toBe("u1");
  });
});
