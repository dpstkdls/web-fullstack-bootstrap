import { z } from "zod";

export const projectStatusSchema = z.enum(["active", "archived"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projectDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: projectStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ProjectDto = z.infer<typeof projectDtoSchema>;

export const createProjectInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().default(null),
  status: projectStatusSchema.default("active"),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

// create 스키마의 .partial() 재사용 금지 — default("active")가 업데이트마다 값을 되돌려버림
export const updateProjectInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: projectStatusSchema.optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

export const listProjectsQuerySchema = z.object({
  q: z.string().min(1).optional(),
  status: projectStatusSchema.optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export type ProjectPage = {
  items: ProjectDto[];
  total: number;
  page: number;
  pageSize: number;
};
