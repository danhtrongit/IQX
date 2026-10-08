export function resultText(result: boolean | null | undefined): string {
  return result === true ? "Đạt" : result === false ? "Không đạt" : "Chưa đánh giá được"
}
