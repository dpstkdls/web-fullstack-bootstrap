"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { use } from "react";
import { ProjectForm } from "@/components/project-form";
import { useTRPC } from "@/trpc/react";

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const trpc = useTRPC();
  const router = useRouter();
  const query = useQuery(trpc.projects.byId.queryOptions({ id }));
  const update = useMutation(
    trpc.projects.update.mutationOptions({
      onSuccess: () => router.push(`/projects/${id}`),
    }),
  );
  if (!query.data) return <p>{tc("loading")}</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("editTitle")}</h1>
      <ProjectForm
        defaults={{
          name: query.data.name,
          description: query.data.description ?? "",
          status: query.data.status,
        }}
        pending={update.isPending}
        onSubmit={(v) => update.mutate({ id, patch: v })}
      />
    </div>
  );
}
