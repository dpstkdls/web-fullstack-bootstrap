"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { projectStatusSchema } from "@repo/features/projects/dto";
import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";

// 폼 표현용 스키마 — 제출 시 DTO 형태(description null 변환)로 매핑. 서버가 항상 재검증한다.
const formSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  status: projectStatusSchema,
});
export type ProjectFormValues = z.infer<typeof formSchema>;

export type ProjectFormSubmit = {
  name: string;
  description: string | null;
  status: z.infer<typeof projectStatusSchema>;
};

export function ProjectForm({
  defaults,
  pending,
  onSubmit,
}: {
  defaults?: Partial<ProjectFormValues>;
  pending: boolean;
  onSubmit: (values: ProjectFormSubmit) => void;
}) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", status: "active", ...defaults },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) =>
          onSubmit({ ...v, description: v.description === "" ? null : v.description }),
        )}
        className="max-w-lg space-y-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("name")}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("description")}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("status")}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="active">{t("statusActive")}</SelectItem>
                  <SelectItem value="archived">{t("statusArchived")}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={pending}>
          {tc("save")}
        </Button>
      </form>
    </Form>
  );
}
