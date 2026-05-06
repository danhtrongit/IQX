import { describe, it, expect } from "vitest";
import { adaptMacroFromMultiple } from "../adapters";
import type { ApiMacroGDPItem } from "../types";

// ─── Helper to create mock ApiMacroGDPItem ───────────────

function mockItem(overrides: Partial<ApiMacroGDPItem>): ApiMacroGDPItem {
  return {
    report_data_id: 1,
    id: 1,
    year: 2025,
    group_name: "",
    group_id: 1,
    name: "",
    unit: "%",
    value: 0,
    report_time: "T1/2025",
    source: null,
    ...overrides,
  };
}

// ─── Retail adapter tests ────────────────────────────────

describe("adaptMacroFromMultiple – retail", () => {
  it("should NOT produce 63730.84% from mixed categories", () => {
    // Simulate real MBK retail data with multiple categories in the same month
    const retailData: ApiMacroGDPItem[] = [
      // Month 1 — all categories
      mockItem({ report_data_id: 100, name: "TỔNG SỐ:", unit: "Tỷ VNĐ", value: 550000, report_time: "T3/2025" }),
      mockItem({ report_data_id: 101, name: "Bán lẻ hàng hóa", unit: "Tỷ VNĐ", value: 420000, report_time: "T3/2025" }),
      mockItem({ report_data_id: 102, name: "Dịch vụ lưu trú, ăn uống", unit: "Tỷ VNĐ", value: 60000, report_time: "T3/2025" }),
      mockItem({ report_data_id: 103, name: "Du lịch lữ hành", unit: "Tỷ VNĐ", value: 7651.89, report_time: "T3/2025" }),
      mockItem({ report_data_id: 104, name: "Dịch vụ khác", unit: "Tỷ VNĐ", value: 63730.84, report_time: "T3/2025" }),
      // Month 2 — all categories
      mockItem({ report_data_id: 200, name: "TỔNG SỐ:", unit: "Tỷ VNĐ", value: 570000, report_time: "T4/2025" }),
      mockItem({ report_data_id: 201, name: "Bán lẻ hàng hóa", unit: "Tỷ VNĐ", value: 440000, report_time: "T4/2025" }),
      mockItem({ report_data_id: 202, name: "Dịch vụ lưu trú, ăn uống", unit: "Tỷ VNĐ", value: 62000, report_time: "T4/2025" }),
      mockItem({ report_data_id: 203, name: "Du lịch lữ hành", unit: "Tỷ VNĐ", value: 8200, report_time: "T4/2025" }),
      mockItem({ report_data_id: 204, name: "Dịch vụ khác", unit: "Tỷ VNĐ", value: 65000, report_time: "T4/2025" }),
    ];

    const result = adaptMacroFromMultiple([{ key: "retail", data: retailData }]);

    expect(result).toHaveLength(1);
    const retail = result[0];

    // Must NOT show the bug value "63730.84%"
    expect(retail.value).not.toContain("63730");
    expect(retail.value).not.toContain("%");

    // Must format as VND
    expect(retail.value).toContain("nghìn tỷ");

    // Value should be based on TỔNG SỐ (570000 tỷ = 570.0 nghìn tỷ)
    expect(retail.value).toBe("570.0 nghìn tỷ");
  });

  it("should compute change between same-series periods only", () => {
    const retailData: ApiMacroGDPItem[] = [
      mockItem({ report_data_id: 100, name: "TỔNG SỐ:", unit: "Tỷ VNĐ", value: 500000, report_time: "T3/2025" }),
      mockItem({ report_data_id: 101, name: "Dịch vụ khác", unit: "Tỷ VNĐ", value: 63730.84, report_time: "T3/2025" }),
      mockItem({ report_data_id: 200, name: "TỔNG SỐ:", unit: "Tỷ VNĐ", value: 550000, report_time: "T4/2025" }),
      mockItem({ report_data_id: 201, name: "Dịch vụ khác", unit: "Tỷ VNĐ", value: 65000, report_time: "T4/2025" }),
    ];

    const result = adaptMacroFromMultiple([{ key: "retail", data: retailData }]);
    const retail = result[0];

    // Change should be (550000 - 500000) / 500000 * 100 = +10.0%
    expect(retail.change).toBe("+10.0%");
    expect(retail.trend).toBe("up");

    // Must NOT have the bug value "+56078.95%"
    expect(retail.change).not.toContain("56078");
  });

  it("should use sparkline from TỔNG SỐ series only", () => {
    const retailData: ApiMacroGDPItem[] = [
      mockItem({ report_data_id: 50, name: "TỔNG SỐ:", unit: "Tỷ VNĐ", value: 480000, report_time: "T2/2025" }),
      mockItem({ report_data_id: 51, name: "Dịch vụ khác", unit: "Tỷ VNĐ", value: 60000, report_time: "T2/2025" }),
      mockItem({ report_data_id: 100, name: "TỔNG SỐ:", unit: "Tỷ VNĐ", value: 500000, report_time: "T3/2025" }),
      mockItem({ report_data_id: 101, name: "Dịch vụ khác", unit: "Tỷ VNĐ", value: 63730, report_time: "T3/2025" }),
      mockItem({ report_data_id: 200, name: "TỔNG SỐ:", unit: "Tỷ VNĐ", value: 550000, report_time: "T4/2025" }),
      mockItem({ report_data_id: 201, name: "Dịch vụ khác", unit: "Tỷ VNĐ", value: 65000, report_time: "T4/2025" }),
    ];

    const result = adaptMacroFromMultiple([{ key: "retail", data: retailData }]);
    const retail = result[0];

    // Sparkline should only contain TỔNG SỐ values, sorted ascending
    expect(retail.sparkline).toEqual([480000, 500000, 550000]);
  });

  it("should fall back to 'Bán lẻ hàng hóa' if no TỔNG SỐ", () => {
    const retailData: ApiMacroGDPItem[] = [
      mockItem({ report_data_id: 100, name: "Bán lẻ hàng hóa", unit: "Tỷ VNĐ", value: 420000, report_time: "T3/2025" }),
      mockItem({ report_data_id: 200, name: "Bán lẻ hàng hóa", unit: "Tỷ VNĐ", value: 440000, report_time: "T4/2025" }),
    ];

    const result = adaptMacroFromMultiple([{ key: "retail", data: retailData }]);
    expect(result).toHaveLength(1);
    expect(result[0].value).toContain("nghìn tỷ");
  });

  it("should set label to 'Tổng bán lẻ'", () => {
    const retailData: ApiMacroGDPItem[] = [
      mockItem({ report_data_id: 100, name: "TỔNG SỐ:", unit: "Tỷ VNĐ", value: 500000, report_time: "T3/2025" }),
      mockItem({ report_data_id: 200, name: "TỔNG SỐ:", unit: "Tỷ VNĐ", value: 550000, report_time: "T4/2025" }),
    ];

    const result = adaptMacroFromMultiple([{ key: "retail", data: retailData }]);
    expect(result[0].name).toBe("Tổng bán lẻ");
  });
});

// ─── GDP adapter tests ───────────────────────────────────

describe("adaptMacroFromMultiple – gdp", () => {
  it("should filter to Tổng GDP series only", () => {
    const gdpData: ApiMacroGDPItem[] = [
      mockItem({ report_data_id: 1, group_name: "Tăng trưởng thực của GDP", name: "Tổng GDP", value: 6.5, report_time: "Q4/2024" }),
      mockItem({ report_data_id: 2, group_name: "Tăng trưởng thực của GDP", name: "Công nghiệp", value: 7.2, report_time: "Q4/2024" }),
      mockItem({ report_data_id: 3, group_name: "Tăng trưởng thực của GDP", name: "Tổng GDP", value: 6.93, report_time: "Q1/2025" }),
      mockItem({ report_data_id: 4, group_name: "Tăng trưởng thực của GDP", name: "Công nghiệp", value: 7.8, report_time: "Q1/2025" }),
    ];

    const result = adaptMacroFromMultiple([{ key: "gdp", data: gdpData }]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("GDP");
    expect(result[0].value).toBe("6.93%");
    // Change: 6.93 - 6.5 = +0.43%
    expect(result[0].change).toBe("+0.43%");
    // Sparkline: only Tổng GDP values
    expect(result[0].sparkline).toEqual([6.5, 6.93]);
  });
});

// ─── CPI adapter tests ──────────────────────────────────

describe("adaptMacroFromMultiple – cpi", () => {
  it("should prefer YoY CPI series", () => {
    const cpiData: ApiMacroGDPItem[] = [
      mockItem({ report_data_id: 1, name: "So sánh với cùng kỳ năm trước", value: 3.0, report_time: "T3/2025" }),
      mockItem({ report_data_id: 2, name: "So sánh với tháng trước", value: 0.2, report_time: "T3/2025" }),
      mockItem({ report_data_id: 3, name: "So sánh với cùng kỳ năm trước", value: 3.15, report_time: "T4/2025" }),
      mockItem({ report_data_id: 4, name: "So sánh với tháng trước", value: 0.1, report_time: "T4/2025" }),
    ];

    const result = adaptMacroFromMultiple([{ key: "cpi", data: cpiData }]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("CPI");
    expect(result[0].value).toBe("3.15%");
    expect(result[0].sparkline).toEqual([3.0, 3.15]);
  });
});

// ─── Industrial Production adapter tests ─────────────────

describe("adaptMacroFromMultiple – industrial_production", () => {
  it("should filter to 'Toàn ngành công nghiệp' only", () => {
    const ipData: ApiMacroGDPItem[] = [
      mockItem({ report_data_id: 1, name: "Toàn ngành công nghiệp", value: 5.2, report_time: "T3/2025" }),
      mockItem({ report_data_id: 2, name: "Khai khoáng", value: -2.1, report_time: "T3/2025" }),
      mockItem({ report_data_id: 3, name: "Toàn ngành công nghiệp", value: 5.8, report_time: "T4/2025" }),
      mockItem({ report_data_id: 4, name: "Khai khoáng", value: -1.5, report_time: "T4/2025" }),
    ];

    const result = adaptMacroFromMultiple([{ key: "industrial_production", data: ipData }]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("SX Công nghiệp");
    expect(result[0].value).toBe("5.8%");
    expect(result[0].sparkline).toEqual([5.2, 5.8]);
  });
});

// ─── Multiple indicators combined ───────────────────────

describe("adaptMacroFromMultiple – combined", () => {
  it("should return up to 6 indicators without cross-contamination", () => {
    const results = [
      {
        key: "gdp",
        data: [
          mockItem({ report_data_id: 1, group_name: "Tăng trưởng thực của GDP", name: "Tổng GDP", value: 6.5 }),
          mockItem({ report_data_id: 2, group_name: "Tăng trưởng thực của GDP", name: "Tổng GDP", value: 6.93 }),
        ],
      },
      {
        key: "retail",
        data: [
          mockItem({ report_data_id: 10, name: "TỔNG SỐ:", unit: "Tỷ VNĐ", value: 500000 }),
          mockItem({ report_data_id: 11, name: "Dịch vụ khác", unit: "Tỷ VNĐ", value: 63730 }),
          mockItem({ report_data_id: 20, name: "TỔNG SỐ:", unit: "Tỷ VNĐ", value: 550000 }),
          mockItem({ report_data_id: 21, name: "Dịch vụ khác", unit: "Tỷ VNĐ", value: 65000 }),
        ],
      },
    ];

    const indicators = adaptMacroFromMultiple(results);
    expect(indicators).toHaveLength(2);
    expect(indicators[0].name).toBe("GDP");
    expect(indicators[1].name).toBe("Tổng bán lẻ");

    // No cross-contamination
    expect(indicators[1].value).not.toContain("%");
    expect(indicators[1].value).toContain("nghìn tỷ");
  });
});
