import { headers } from "next/headers";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

export type ServerSession = { user: { id: string; email: string; name: string } } | null;

// RSC는 rewrites를 안 타므로 API 오리진으로 직접, 쿠키는 수동 전달
export async function getServerSession(): Promise<ServerSession> {
  const cookie = (await headers()).get("cookie") ?? "";
  try {
    const res = await fetch(`${API_ORIGIN}/api/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.user ? body : null;
  } catch {
    // api 미기동 = 세션 확인 불가 = 미인증으로 취급 — fresh clone에서 web만 켠 경우 에러 화면 대신 /login
    return null;
  }
}
