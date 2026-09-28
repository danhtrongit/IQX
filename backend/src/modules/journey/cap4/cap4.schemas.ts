import { z } from 'zod';

import { ASSESSMENTS, LAYERS } from './cap4.types.js';

const assessmentSchema = z.enum(ASSESSMENTS);
const readingMapSchema = z.record(z.string(), assessmentSchema).superRefine((value, context) => {
  for (const layer of Object.keys(value)) {
    if (!(LAYERS as readonly string[]).includes(layer)) {
      context.addIssue({ code: 'custom', path: [layer], message: 'Lớp không hợp lệ' });
    }
  }
});
export const cap4TaskBodySchema = z.object({ task_no: z.literal(1) }).strict();
export const cap4PlanBodySchema = z
  .object({
    order_id: z.string().uuid(),
    doc_5_lop: readingMapSchema
      .refine((value) => Object.keys(value).length > 0, 'doc_5_lop không được để trống')
      .nullable(),
  })
  .strict();
export const cap4OrderIdParamSchema = z.string().uuid();
export type Cap4PlanBody = z.output<typeof cap4PlanBodySchema>;
