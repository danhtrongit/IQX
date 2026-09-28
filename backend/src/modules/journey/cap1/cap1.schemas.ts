import { z } from 'zod';

export const cap1TaskSchema = z.object({ task_no: z.number().int().min(1).max(5) });
export const cap1KehoachSchema = z.object({
  order_id: z.uuid(),
  lyDo: z.enum(['ky_thuat', 'dong_tien', 'noi_bo', 'tin_tuc', 'dinh_gia']),
  trangThai_luc_dat: z.enum(['ung_ho', 'trung_tinh', 'can_chu_y', 'nguoc_chieu']),
  vung_mua: z.number().int().positive(),
  co_bam_doc_chi_tiet: z.boolean().default(false),
  snapshot: z.record(z.string(), z.unknown()).nullable().optional(),
});
export const cap1KetsoSchema = z.object({
  order_id: z.uuid(),
  cam_xuc: z.enum(['binh_tinh', 'so', 'hoi_tiec', 'khong_ro']).nullable().optional(),
});
export type Cap1TaskInput = z.infer<typeof cap1TaskSchema>;
export type Cap1KehoachInput = z.infer<typeof cap1KehoachSchema>;
export type Cap1KetsoInput = z.infer<typeof cap1KetsoSchema>;
