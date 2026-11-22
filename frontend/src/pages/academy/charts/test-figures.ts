/**
 * v5 `figure` fixtures: one model of each `fig`, copied from the `FIG.draw` calls of the v5 mockup
 * (`IQX-Hoc-Vien-v5-MAU.html`), mockup colour keys mapped to tones (up pos, dn neg, bl/s1 p1, gd warn,
 * or/s2 p5, pu p4). Shapes follow plan Học viện v5 §5.
 */
import type { FigureChartModel } from "../content-types"

export const FIGURE_FORMULA: FigureChartModel = {
  kind: "figure",
  fig: "formula",
  items: [
    { t: "TOI quý này", v: "34.329 tỷ", tone: "p1", notes: ["Q2/26"] },
    { t: "TOI cùng kỳ", v: "25.310 tỷ", tone: "warn", notes: ["Q2/25"] },
    { t: "Tăng trưởng", v: "35,6%", tone: "pos", notes: ["So với cùng kỳ"], hl: true },
  ],
  ops: ["so với", "="],
  height: 200,
}

export const FIGURE_LINES: FigureChartModel = {
  kind: "figure",
  fig: "lines",
  title: "Báo cáo kết quả kinh doanh của tổ chức tín dụng",
  rows: [
    { report: "Từ cho vay", line: "Thu nhập lãi thuần", code: "Phần lớn TOI", tone: "p1" },
    { report: "Ngoài lãi", line: "Lãi thuần từ dịch vụ, ngoại hối", code: "Ổn định", tone: "pos" },
    { report: "Ngoài lãi", line: "Lãi thuần chứng khoán kinh doanh, đầu tư", code: "Dao động", tone: "p5" },
    { report: "Ngoài lãi", line: "Lãi thuần hoạt động khác, góp vốn", code: null, tone: "warn" },
  ],
}

export const FIGURE_HBAR: FigureChartModel = {
  kind: "figure",
  fig: "hbar",
  title: "P/B hợp lý tăng theo ROE · số minh họa",
  items: [
    { label: "ROE 10%", value: 1, tone: "warn" },
    { label: "ROE 15%", value: 1.5, tone: "p1" },
    { label: "ROE 20%", value: 2, tone: "pos" },
    { label: "Ngân hàng hiệu quả cao trong nhiều năm liền", value: 2.5, tone: "pos" },
  ],
  decimals: 1,
  unit: " lần",
  note: "Ngân hàng sinh lời tốt hơn trên vốn chủ thì đáng giá cao hơn so với sổ sách.",
  label_width: 250,
}

export const FIGURE_STACK: FigureChartModel = {
  kind: "figure",
  fig: "stack",
  title: "Doanh thu hoạt động Q2/26 của công ty chứng khoán mẫu",
  parts: [
    { label: "Môi giới", value: 332, tone: "p1" },
    { label: "Cho vay margin", value: 500, tone: "p5" },
    { label: "Tự doanh", value: 190, tone: "pos" },
    { label: "Ngân hàng đầu tư và khác", value: 70, tone: "p4" },
  ],
  decimals: 0,
  unit: " tỷ",
  note: null,
}

export const FIGURE_WF: FigureChartModel = {
  kind: "figure",
  fig: "wf",
  title: "Từ 100 đồng phí thuần đến LNST · số minh họa",
  items: [
    { label: "Phí thuần", value: 100, step: "base", tone: "p1" },
    { label: "Bồi thường, chi phí", value: 98, step: "minus", tone: "neg" },
    { label: "Lãi nghiệp vụ", value: 2, step: "total", tone: "warn" },
    { label: "Lãi đầu tư", value: 13, step: "plus", tone: "pos" },
    { label: "Thuế", value: 3, step: "minus", tone: "neg" },
    { label: "LNST", value: 12, step: "total", tone: "p1" },
  ],
  decimals: 0,
  unit: " đồng",
  height: 270,
}

/** Chart ids as the v5 importer names them (`<lesson svg id>`), keyed for the block fixtures. */
export const FIGURE_CHARTS: Record<string, FigureChartModel> = {
  "c10l1-g1": FIGURE_FORMULA,
  "c10l1-g2": FIGURE_LINES,
  "c10l15-g2": FIGURE_HBAR,
  "c11l1-g2": FIGURE_STACK,
  "c12l8-g2": FIGURE_WF,
}
