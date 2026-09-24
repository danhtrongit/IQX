import { z } from 'zod';

const eventValueSchema = z.union([z.string().max(160), z.number().finite(), z.boolean(), z.null()]);

const FORBIDDEN_FIELDS = new Set([
  'user_id',
  'email',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'note',
  'notes',
  'ghi_chu',
  'answers',
]);

export const journeyEventSchema = z
  .object({
    event_id: z.uuid(),
    name: z
      .string()
      .min(3)
      .max(80)
      .regex(/^(cap[0-6]|tour|mascot|journey_egg|identity|journey_model)_[a-z0-9_]+$/),
    fields: z.record(z.string(), eventValueSchema).default({}),
  })
  .strict()
  .superRefine((value, context) => {
    const entries = Object.entries(value.fields);
    if (entries.length > 20) {
      context.addIssue({ code: 'custom', path: ['fields'], message: 'Tối đa 20 trường sự kiện' });
    }
    for (const [key] of entries) {
      if (FORBIDDEN_FIELDS.has(key) || key.length > 48 || !/^[A-Za-z0-9_]+$/.test(key)) {
        context.addIssue({
          code: 'custom',
          path: ['fields', key],
          message: 'Trường sự kiện không hợp lệ',
        });
      }
    }
  });

export type JourneyEventInput = z.infer<typeof journeyEventSchema>;
