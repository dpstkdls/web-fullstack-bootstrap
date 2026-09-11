"use client";

import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function SignupPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(false);
    const form = new FormData(e.currentTarget);
    const { error: authError } = await authClient.signUp.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
      name: String(form.get("name")),
    });
    setPending(false);
    if (authError) return setError(true);
    router.push("/projects");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("signupTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("name")}</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" name="password" type="password" required minLength={8} />
            </div>
            {error && <p className="text-sm text-destructive">{t("failed")}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {t("submitSignup")}
            </Button>
            <Link href="/login" className="block text-center text-sm underline">
              {t("toLogin")}
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
