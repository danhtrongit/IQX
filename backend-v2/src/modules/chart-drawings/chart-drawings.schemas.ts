import { z } from 'zod';

export const MAX_DRAWING_STATE_BYTES = 512 * 1024;

export const chartSymbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Mã chứng khoán không hợp lệ')
  .transform((value) => value.toUpperCase());

const jsonValueSchema = z.json();

export const chartDrawingUpsertSchema = z.object({
  state: z.record(z.string(), jsonValueSchema).superRefine((state, context) => {
    const bytes = Buffer.byteLength(JSON.stringify(state), 'utf8');
    if (bytes > MAX_DRAWING_STATE_BYTES) {
      context.addIssue({
        code: 'custom',
        message: `Bản vẽ không được vượt quá ${MAX_DRAWING_STATE_BYTES} byte`,
      });
    }
  }),
});

export type ChartDrawingUpsertInput = z.infer<typeof chartDrawingUpsertSchema>;
export type DrawingState = ChartDrawingUpsertInput['state'];
