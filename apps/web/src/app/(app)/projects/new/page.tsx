"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ProjectForm } from "@/components/project-form";
import { useTRPC } from "@/trpc/react";

export default function NewProjectPage() {
  const t = useTranslations("projects");
  const trpc = useTRPC();
  const router = useRouter();
  const create = useMutation(
    trpc.projects.create.mutationOptions({
      onSuccess: (created) => router.push(`/projects/${created.id}`),
    }),
  );
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
      <ProjectForm pending={create.isPending} onSubmit={(v) => create.mutate(v)} />
    </div>
  );
}
