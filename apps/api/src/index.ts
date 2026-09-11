import { createDb } from "@repo/db/client";
import { buildAuth } from "./auth";
import { authOptionsFromEnv } from "./config";
import { env } from "./env";
import { buildServer } from "./server";

const db = createDb(env.DATABASE_URL);
const auth = buildAuth(db, authOptionsFromEnv(env));
const server = await buildServer({ db, auth });
await server.listen({ port: env.PORT, host: "0.0.0.0" });
