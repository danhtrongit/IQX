/**
 * BCTC storytelling dashboard — block order (SPEC §2.1).
 *
 * The render layer walks BLOCK_ORDER and emits one block per id, so the
 * narrative sequence is CONFIG, not hard-coded in the render layer.
 *
 *   0  Thẻ điểm sức khỏe        (không đánh số)
 *   1  Câu chuyện doanh nghiệp
 *   2  Giá đang đắt hay rẻ?      (Định giá)
 *   3  Bức tranh tài chính
 *   4  Kinh doanh có ổn không?   (A) / Ngân hàng kiếm tiền thế nào? (B)
 *   5  Tiền có thật không?       (A) / Vận hành có hiệu quả không?   (B)
 *   6  Sức khỏe tài chính        (A) / Chất lượng tài sản           (B)
 *   7  Cổ đông nhận được gì?     (Cổ tức)
 */
export type BlockId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

/** Current order: Định giá sớm, ngay sau Câu chuyện. */
export const BLOCK_ORDER: BlockId[] = [0, 1, 2, 3, 4, 5, 6, 7]

// Alternative worth considering (SPEC §2.1): move Định giá near the end (after
// Sức khỏe) so the valuation numbers land after the reader understands the
// fundamentals — swap BLOCK_ORDER for:
//   export const BLOCK_ORDER: BlockId[] = [0, 1, 3, 4, 5, 6, 2, 7]
