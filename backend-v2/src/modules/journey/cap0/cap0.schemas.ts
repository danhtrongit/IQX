import { z } from 'zod';

export const placementSchema = z
  .object({
    answer: z.enum(['never', 'unsure', 'regular']).optional(),
    has_traded_before: z.boolean().optional(),
  })
  .refine((value) => value.answer !== undefined || value.has_traded_before !== undefined, {
    message: 'Cần chọn một câu trả lời xếp lớp',
  });
export const tourSchema = z.object({ skipped: z.boolean().default(false) });
export const tourParamSchema = z.enum(['bantin', 'phantich', 'bctc']);
export const taskSchema = z.object({
  task_no: z.number().int().min(1).max(5),
  gate: z.enum(['star', 'debrief']).nullable().optional(),
});
export const kehoachSchema = z.object({
  order_id: z.uuid(),
  ly_do_doi_thuong: z.string().trim().min(1).max(100),
});
export const kehoachQuerySchema = z.object({ order_id: z.uuid() });

export type PlacementInput = z.infer<typeof placementSchema>;
export type TourInput = z.infer<typeof tourSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type KehoachInput = z.infer<typeof kehoachSchema>;
