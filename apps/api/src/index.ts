import { createDb } from "@repo/db/client";
import { buildAuth } from "./auth";
import { env } from "./env";
import { buildServer } from "./server";

const db = createDb(env.DATABASE_URL);
const auth = buildAuth(db, {
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.WEB_ORIGIN],
});
const server = await buildServer({ db, auth });
await server.listen({ port: env.PORT, host: "0.0.0.0" });
