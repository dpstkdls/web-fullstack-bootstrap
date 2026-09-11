import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  // JIT 내부 패키지(TS 소스)를 web이 직접 컴파일 (스펙 §3)
  transpilePackages: ["@repo/ui", "@repo/i18n", "@repo/features", "@repo/lib"],
  async rewrites() {
    // same-origin 프록시 — 쿠키 SameSite/CORS 문제 회피 (스펙 §4)
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
