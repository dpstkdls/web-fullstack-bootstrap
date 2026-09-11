"use client";

import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { setLocaleCookie } from "@/app/actions/locale";
import { useTRPC } from "@/trpc/react";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useQuery(trpc.profile.get.queryOptions());
  const [displayName, setDisplayName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile.data) setDisplayName(profile.data.displayName ?? "");
  }, [profile.data]);

  const update = useMutation(
    trpc.profile.update.mutationOptions({
      onSuccess: async (updated) => {
        await setLocaleCookie(updated.locale as "ko" | "en");
        await queryClient.invalidateQueries();
        setSaved(true);
        router.refresh(); // locale 쿠키 반영 — RSC 메시지 재로드
      },
    }),
  );

  if (!profile.data) return <p>{tc("loading")}</p>;

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">{t("displayName")}</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("locale")}</Label>
          <Select
            value={profile.data.locale}
            onValueChange={(locale) => update.mutate({ locale: locale as "ko" | "en" })}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ko">한국어</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {saved && <p className="text-sm text-muted-foreground">{t("saved")}</p>}
        <Button
          disabled={update.isPending}
          onClick={() => update.mutate({ displayName: displayName === "" ? null : displayName })}
        >
          {tc("save")}
        </Button>
      </CardContent>
    </Card>
  );
}
