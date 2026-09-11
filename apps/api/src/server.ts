import { appRouter, createContext } from "@repo/api";
import type { Db } from "@repo/db/client";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { fromNodeHeaders } from "better-auth/node";
import Fastify from "fastify";
import type { Auth } from "./auth";

export async function buildServer(deps: { db: Db; auth: Auth }) {
  const server = Fastify({ logger: true });

  server.get("/healthz", async () => ({ ok: true }));

  // better-auth는 web-standard Request/Response — Fastify req/reply를 수동 변환해 마운트
  server.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value) headers.append(key, value.toString());
      }
      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
      const response = await deps.auth.handler(req);
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      reply.send(response.body ? await response.text() : null);
    },
  });

  await server.register(fastifyTRPCPlugin, {
    prefix: "/api/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: async ({ req }: { req: { headers: Record<string, unknown> } }) => {
        const session = await deps.auth.api.getSession({
          headers: fromNodeHeaders(req.headers as never),
        });
        return createContext(
          deps.db,
          session
            ? {
                user: {
                  id: session.user.id,
                  email: session.user.email,
                  name: session.user.name,
                },
              }
            : null,
        );
      },
    },
  });

  return server;
}
