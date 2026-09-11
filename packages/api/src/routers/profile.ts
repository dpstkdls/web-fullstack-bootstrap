import { profileDtoSchema, updateProfileInputSchema } from "@repo/features/profiles";
import { protectedProcedure, router } from "../trpc";

export const profileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    return profileDtoSchema.parse(await ctx.services.profiles.ensureProfile(ctx.session.user.id));
  }),

  update: protectedProcedure.input(updateProfileInputSchema).mutation(async ({ ctx, input }) => {
    return profileDtoSchema.parse(await ctx.services.profiles.update(ctx.session.user.id, input));
  }),
});
