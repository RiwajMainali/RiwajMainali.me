import { z } from 'zod';
export const draftSchema = z.object({
  exerciseId: z.string().max(100),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => {
      const d = new Date(s);
      return (
        !isNaN(d.getTime()) &&
        d.toISOString().slice(0, 10) === s &&
        s <= new Date().toISOString().slice(0, 10)
      );
    }, 'Choose a valid date, today or earlier'),
  unit: z.enum(['lb', 'kg']),
  bodyweight: z.number().positive().max(1500).nullable(),
  sets: z
    .array(
      z.object({
        weight: z.number().min(0).max(3000).nullable(),
        reps: z.number().int().min(1).max(1000).nullable(),
        rpe: z.number().min(1).max(10).multipleOf(0.5).nullable(),
        warmup: z.boolean(),
      })
    )
    .min(1)
    .max(100),
  notes: z.string().max(20000),
  mediaIds: z.array(z.string().uuid()).max(20),
  tier: z.enum(['auto', 'novice', 'intermediate', 'advanced', 'elite']),
});
export const revisionSchema = z.number().int().nonnegative();
