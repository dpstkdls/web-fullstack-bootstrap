import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export function createDb(connectionString: string) {
  return drizzle(connectionString, { schema });
}

export type Db = ReturnType<typeof createDb>;
