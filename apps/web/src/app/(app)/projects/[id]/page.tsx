"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { use, useState } from "react";
import { useTRPC } from "@/trpc/react";

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const query = useQuery(trpc.projects.byId.queryOptions({ id }));
  const del = useMutation(
    trpc.projects.delete.mutationOptions({ onSuccess: () => router.push("/projects") }),
  );

  if (!query.data) return <p>{tc("loading")}</p>;
  const p = query.data;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{p.name}</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/projects/${id}/edit`}>{tc("edit")}</Link>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive">{tc("delete")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("deleteConfirm")}</DialogTitle>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {tc("cancel")}
                </Button>
                <Button
                  variant="destructive"
                  disabled={del.isPending}
                  onClick={() => del.mutate({ id })}
                >
                  {tc("delete")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">{p.description ?? "—"}</p>
        <Badge variant={p.status === "active" ? "default" : "secondary"}>
          {p.status === "active" ? t("statusActive") : t("statusArchived")}
        </Badge>
        <p>
          {t("createdAt")}: {p.createdAt.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
