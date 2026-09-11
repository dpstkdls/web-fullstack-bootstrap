import { z } from "zod";

export const profileDtoSchema = z.object({
  userId: z.string(),
  displayName: z.string().nullable(),
  locale: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ProfileDto = z.infer<typeof profileDtoSchema>;

export const updateProfileInputSchema = z.object({
  displayName: z.string().min(1).max(100).nullable().optional(),
  locale: z.enum(["ko", "en"]).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
