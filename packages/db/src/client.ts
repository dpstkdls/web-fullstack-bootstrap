import { drizzle } from "drizzle-orm/node-postgres";
import * as authSchema from "./auth-schema";
import * as schema from "./schema";

export function createDb(connectionString: string) {
  return drizzle(connectionString, { schema: { ...schema, ...authSchema } });
}

export type Db = ReturnType<typeof createDb>;

// 스펙 §5 tx 주입 패턴용: repository 메서드가 Db든 트랜잭션 tx든 받을 수 있게 하는 최소 타입
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbLike = Db | DbTx;
