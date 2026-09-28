import { z } from 'zod';

export const riskAppetiteSchema = z.enum(['than_trong', 'can_bang', 'tan_cong']);
export const confidenceSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const sizingMethodSchema = z.preprocess(
  (value) => (value === 'linh_hoat' ? 'khau_vi_tu_tin' : value === 'ky_luat' ? 'chia_deu' : value),
  z.enum(['khau_vi_tu_tin', 'chia_deu']),
);

export const riskAppetiteBodySchema = z.object({ khau_vi: riskAppetiteSchema }).strict();
export const cap3TaskBodySchema = z
  .object({ task_no: z.union([z.literal(1), z.literal(2)]) })
  .strict();
export const cap3PlanBodySchema = z
  .object({
    order_id: z.string().uuid(),
    khau_vi: riskAppetiteSchema,
    muc_tu_tin: confidenceSchema,
    cach_khoi_luong: sizingMethodSchema,
    khoi_luong: z.number().int().positive(),
    pct_von: z.number().positive().finite(),
  })
  .strict();
export const orderIdParamSchema = z.string().uuid();

export type RiskAppetiteBody = z.output<typeof riskAppetiteBodySchema>;
export type Cap3TaskBody = z.output<typeof cap3TaskBodySchema>;
export type Cap3PlanBody = z.output<typeof cap3PlanBodySchema>;
