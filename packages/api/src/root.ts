import { profileRouter } from "./routers/profile";
import { projectsRouter } from "./routers/projects";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({
  projects: projectsRouter,
  profile: profileRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
export { type Context, createContext, type SessionUser } from "./context";
