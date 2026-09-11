import { AppError, type AppErrorCode } from "@repo/lib/errors";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

const CODE_MAP: Record<AppErrorCode, TRPCError["code"]> = {
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  BAD_REQUEST: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  UNAUTHORIZED: "UNAUTHORIZED",
  INTERNAL: "INTERNAL_SERVER_ERROR",
};

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

// 서비스 층은 tRPC를 모른다(스펙 §4) — AppError가 여기서 tRPC 코드로 번역된다
const appErrorToTrpc = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof AppError) {
    const appError = result.error.cause;
    throw new TRPCError({
      code: CODE_MAP[appError.code],
      message: appError.message,
      cause: appError,
    });
  }
  return result;
});

export const publicProcedure = t.procedure.use(appErrorToTrpc);

export const protectedProcedure = publicProcedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
    return next({
      ctx: { ...ctx, session: ctx.session },
    });
  }),
);
