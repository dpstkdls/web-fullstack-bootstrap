import { describe, expect, it } from "vitest";
import { AppError } from "./errors";

describe("AppError", () => {
  it("carries code and message", () => {
    const e = new AppError("NOT_FOUND", "project 3 not found");
    expect(e.code).toBe("NOT_FOUND");
    expect(e.message).toBe("project 3 not found");
    expect(e).toBeInstanceOf(Error);
  });
});
