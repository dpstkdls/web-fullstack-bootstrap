import { z } from "zod";

// 부팅 시 한 번 호출해 잘못된 배포를 즉시 실패시키는 용도 — 런타임 중 재호출 금지
export function parseEnv<T extends z.ZodRawShape>(
  shape: T,
  source: Record<string, string | undefined> = process.env
): z.infer<z.ZodObject<T>> {
  const result = z.object(shape).safeParse(source);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  ");
    throw new Error(`Invalid environment variables:\n  ${detail}`);
  }
  return result.data;
}
