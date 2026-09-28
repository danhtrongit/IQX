import { z } from 'zod';
export const portfolioNarrativeSchema = z
  .object({
    title: z.string().min(1),
    verdict: z.string().min(1),
    lede: z.string().min(1),
    layers: z.record(z.string(), z.string()),
    actions: z.array(z.object({ title: z.string(), detail: z.string() })).max(3),
    watch: z.array(z.unknown()),
    closing: z.string().min(1),
    progress_text: z.string().optional(),
    insight: z.object({ text: z.string() }).optional(),
    low_data_note: z.string().optional(),
  })
  .passthrough();
