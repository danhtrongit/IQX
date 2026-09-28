import { z } from 'zod';

const symbol = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9._-]+$/)
  .transform((value) => value.toUpperCase());
const isoDate = z.iso.date();
export const factorSelectionSchema = z
  .object({ id: z.string().min(1).max(80), value: z.number().finite().optional() })
  .strict();
export const strategySideSchema = z
  .object({
    logic: z.enum(['AND', 'OR']).default('AND'),
    factors: z.array(factorSelectionSchema).max(12).default([]),
  })
  .strict();
export const riskInputSchema = z
  .object({
    stop_loss: z.enum(['none', 'atr', 'fixed']).default('atr'),
    stop_atr_mult: z.number().finite().min(0.1).max(20).default(2),
    stop_fixed_pct: z.number().finite().min(0.001).max(0.8).default(0.05),
    take_profit_pct: z.number().finite().min(0.001).max(10).nullable().default(null),
    max_holding: z.number().int().min(2).max(2_500).nullable().default(60),
    position_size: z.enum(['all', 'half', 'quarter', 'tenth', 'fixed']).default('all'),
    position_fixed_amount: z
      .number()
      .finite()
      .positive()
      .max(1_000_000_000_000)
      .default(10_000_000),
    fee: z.enum(['standard', 'low', 'none']).default('standard'),
  })
  .strict();
const defaultRisk = {
  stop_loss: 'atr' as const,
  stop_atr_mult: 2,
  stop_fixed_pct: 0.05,
  take_profit_pct: null,
  max_holding: 60,
  position_size: 'all' as const,
  position_fixed_amount: 10_000_000,
  fee: 'standard' as const,
};
export const backtestRunSchema = z
  .object({
    symbol,
    start: isoDate,
    end: isoDate,
    capital: z.number().finite().min(100_000).max(100_000_000_000_000).default(100_000_000),
    buy: strategySideSchema.refine((value) => value.factors.length > 0, {
      message: 'Tổ hợp mua phải có ít nhất 1 factor',
    }),
    sell: strategySideSchema.default({ logic: 'AND', factors: [] }),
    risk: riskInputSchema.default(defaultRisk),
  })
  .strict()
  .superRefine((value, context) => {
    const start = Date.parse(value.start),
      end = Date.parse(value.end);
    if (start > end)
      context.addIssue({
        code: 'custom',
        path: ['end'],
        message: 'Ngày kết thúc phải sau ngày bắt đầu',
      });
    if ((end - start) / 86_400_000 > 3653)
      context.addIssue({ code: 'custom', path: ['end'], message: 'Khoảng backtest tối đa 10 năm' });
  });
export type BacktestRunInput = z.infer<typeof backtestRunSchema>;

export const strategyConfigSchema = z
  .object({
    buy: strategySideSchema,
    sell: strategySideSchema.default({ logic: 'AND', factors: [] }),
    risk: riskInputSchema.default(defaultRisk),
    symbol: symbol.optional(),
    start: isoDate.optional(),
    end: isoDate.optional(),
    capital: z.number().finite().min(100_000).max(100_000_000_000_000).optional(),
  })
  .strict();
export const strategyCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    symbol: symbol.nullable().optional(),
    config: strategyConfigSchema,
  })
  .strict();
export const strategyUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    symbol: symbol.nullable().optional(),
    config: strategyConfigSchema.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Cần ít nhất một trường để cập nhật',
  });
export const strategyIdSchema = z.uuid();
export type StrategyCreateInput = z.infer<typeof strategyCreateSchema>;
export type StrategyUpdateInput = z.infer<typeof strategyUpdateSchema>;
