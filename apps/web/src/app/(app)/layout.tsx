import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { getServerSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");
  const t = await getTranslations("common");
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <nav className="flex items-center gap-6">
          <Link href="/projects" className="font-semibold">
            {t("appName")}
          </Link>
          <Link href="/settings" className="text-sm text-muted-foreground">
            {t("settingsLink")}
          </Link>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{session.user.email}</span>
          <LogoutButton label={t("logout")} />
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-6">{children}</main>
    </div>
  );
}
