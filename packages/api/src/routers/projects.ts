import {
  createProjectInputSchema,
  listProjectsQuerySchema,
  projectDtoSchema,
  updateProjectInputSchema,
} from "@repo/features/projects";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

export const projectsRouter = router({
  list: protectedProcedure.input(listProjectsQuerySchema).query(async ({ ctx, input }) => {
    const page = await ctx.services.projects.list(input);
    return { ...page, items: page.items.map((item) => projectDtoSchema.parse(item)) };
  }),

  byId: protectedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    return projectDtoSchema.parse(await ctx.services.projects.getById(input.id));
  }),

  create: protectedProcedure.input(createProjectInputSchema).mutation(async ({ ctx, input }) => {
    return projectDtoSchema.parse(await ctx.services.projects.create(input));
  }),

  update: protectedProcedure
    .input(z.object({ id: z.uuid(), patch: updateProjectInputSchema }))
    .mutation(async ({ ctx, input }) => {
      return projectDtoSchema.parse(await ctx.services.projects.update(input.id, input.patch));
    }),

  delete: protectedProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.services.projects.delete(input.id);
    return { id: input.id };
  }),
});
