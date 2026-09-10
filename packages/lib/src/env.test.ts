import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("parses valid env", () => {
    const env = parseEnv({ PORT: z.coerce.number() }, { PORT: "3001" });
    expect(env.PORT).toBe(3001);
  });

  it("throws listing missing keys", () => {
    expect(() => parseEnv({ DATABASE_URL: z.string() }, {})).toThrowError(/DATABASE_URL/);
  });
});
