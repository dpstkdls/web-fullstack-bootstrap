import { createAuthClient } from "better-auth/react";

// baseURL 생략 — rewrites 프록시 덕에 same-origin /api/auth/* 로 나간다
export const authClient = createAuthClient();
