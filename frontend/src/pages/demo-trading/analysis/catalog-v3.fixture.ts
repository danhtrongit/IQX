/**
 * Danh mục Dashboard v3 giả lập cho kiểm thử, sinh từ `SEC`/`DEFS` của bản mẫu
 * `backend/docs/update-22-11/IQX-Dashboard-Phan-Tich-v3-MAU.html` (khoá bài học theo PLAN §6).
 * 9 ngành, 90 tên, 260 cặp. Chỉ dùng trong kiểm thử.
 */

export type V3Layout = readonly (readonly [chapter: string, groups: readonly (readonly [group: string, names: readonly string[]])[]])[]

export const V3_SECTIONS: Record<string, V3Layout> = {
  "thuong": [
    [
      "Chỉ tiêu chung",
      [
        [
          "Tăng trưởng",
          [
            "Tăng trưởng doanh thu",
            "Tăng trưởng LNST",
            "Tăng trưởng EPS",
            "Revenue CAGR 3Y",
            "Net Profit CAGR 3Y",
            "EPS CAGR 3Y"
          ]
        ],
        [
          "Ổn định",
          [
            "Profit Positive Streak",
            "Revenue Growth Stability",
            "Margin Stability",
            "EPS Stability"
          ]
        ],
        [
          "Hiệu quả",
          [
            "ROE",
            "ROA",
            "Biên lợi nhuận ròng"
          ]
        ],
        [
          "Định giá",
          [
            "P/E",
            "P/B",
            "P/S",
            "PEG"
          ]
        ]
      ]
    ],
    [
      "Chỉ tiêu doanh nghiệp sản xuất",
      [
        [
          "Hiệu quả và biên lợi nhuận",
          [
            "Biên lợi nhuận gộp",
            "ROIC",
            "ROIC Stability",
            "Asset Turnover",
            "Cash Conversion Cycle"
          ]
        ],
        [
          "Nợ và khả năng thanh toán",
          [
            "D/E",
            "Current Ratio",
            "Interest Coverage",
            "Net Debt / EBITDA"
          ]
        ],
        [
          "Dòng tiền",
          [
            "CFO Margin",
            "CFO / LNST",
            "Capex / Revenue",
            "FCF Margin",
            "FCF Positive Streak"
          ]
        ],
        [
          "Định giá",
          [
            "EV / EBITDA",
            "FCF Yield"
          ]
        ]
      ]
    ]
  ],
  "nh": [
    [
      "Chỉ tiêu chung",
      [
        [
          "Tăng trưởng",
          [
            "Tăng trưởng LNST",
            "Tăng trưởng EPS",
            "Revenue CAGR 3Y",
            "Net Profit CAGR 3Y",
            "EPS CAGR 3Y"
          ]
        ],
        [
          "Ổn định",
          [
            "Profit Positive Streak",
            "Revenue Growth Stability",
            "Margin Stability",
            "EPS Stability"
          ]
        ],
        [
          "Hiệu quả",
          [
            "Biên lợi nhuận ròng"
          ]
        ],
        [
          "Định giá",
          [
            "P/E",
            "P/S",
            "PEG"
          ]
        ]
      ]
    ],
    [
      "Chỉ tiêu ngân hàng",
      [
        [
          "Thu nhập và hiệu quả",
          [
            "Tăng trưởng doanh thu",
            "NIM",
            "Lợi suất tài sản sinh lãi và chi phí vốn",
            "CIR",
            "Tỷ trọng thu nhập ngoài lãi",
            "Tăng trưởng lợi nhuận trước dự phòng",
            "ROE",
            "ROA"
          ]
        ],
        [
          "Rủi ro tín dụng",
          [
            "Chi phí tín dụng",
            "Tỷ lệ dự phòng / Dư nợ",
            "Lãi dự thu / Dư nợ"
          ]
        ],
        [
          "Quy mô và vốn",
          [
            "Tăng trưởng tín dụng và huy động",
            "LDR",
            "VCSH / Tổng tài sản"
          ]
        ],
        [
          "Định giá",
          [
            "P/B"
          ]
        ]
      ]
    ]
  ],
  "ck": [
    [
      "Chỉ tiêu chung",
      [
        [
          "Tăng trưởng",
          [
            "Tăng trưởng LNST",
            "Tăng trưởng EPS",
            "Revenue CAGR 3Y",
            "Net Profit CAGR 3Y",
            "EPS CAGR 3Y"
          ]
        ],
        [
          "Ổn định",
          [
            "Profit Positive Streak",
            "Revenue Growth Stability",
            "EPS Stability"
          ]
        ],
        [
          "Hiệu quả",
          [
            "ROA",
            "Biên lợi nhuận ròng"
          ]
        ],
        [
          "Định giá",
          [
            "P/E",
            "P/S",
            "PEG"
          ]
        ]
      ]
    ],
    [
      "Chỉ tiêu chứng khoán",
      [
        [
          "Doanh thu và chi phí",
          [
            "Tăng trưởng doanh thu",
            "Cơ cấu doanh thu hoạt động",
            "Biên lợi nhuận hoạt động",
            "Margin Stability"
          ]
        ],
        [
          "Cho vay margin",
          [
            "Tăng trưởng dư nợ cho vay",
            "Dư nợ cho vay / VCSH",
            "Lợi suất cho vay"
          ]
        ],
        [
          "Môi giới và tự doanh",
          [
            "Biên lợi nhuận môi giới",
            "Tỷ trọng tài sản tự doanh",
            "Hiệu suất tự doanh"
          ]
        ],
        [
          "Chi phí, đòn bẩy và hiệu quả",
          [
            "Chi phí hoạt động / Doanh thu hoạt động",
            "Nợ vay / VCSH",
            "ROE"
          ]
        ],
        [
          "Định giá",
          [
            "P/B"
          ]
        ]
      ]
    ]
  ],
  "bh": [
    [
      "Chỉ tiêu chung",
      [
        [
          "Tăng trưởng",
          [
            "Tăng trưởng doanh thu",
            "Tăng trưởng LNST",
            "Tăng trưởng EPS",
            "Revenue CAGR 3Y",
            "Net Profit CAGR 3Y",
            "EPS CAGR 3Y"
          ]
        ],
        [
          "Ổn định",
          [
            "Profit Positive Streak",
            "Revenue Growth Stability",
            "Margin Stability",
            "EPS Stability"
          ]
        ],
        [
          "Hiệu quả",
          [
            "ROA"
          ]
        ],
        [
          "Định giá",
          [
            "P/E",
            "P/S",
            "PEG"
          ]
        ]
      ]
    ],
    [
      "Chỉ tiêu bảo hiểm",
      [
        [
          "Doanh thu phí",
          [
            "Tăng trưởng doanh thu phí bảo hiểm gốc",
            "Tỷ lệ giữ lại"
          ]
        ],
        [
          "Hiệu quả nghiệp vụ",
          [
            "Tỷ lệ bồi thường",
            "Tỷ lệ chi phí",
            "Combined ratio"
          ]
        ],
        [
          "Đầu tư và lợi nhuận",
          [
            "Lợi suất đầu tư",
            "Cơ cấu lợi nhuận",
            "Biên lợi nhuận ròng",
            "ROE"
          ]
        ],
        [
          "Dự phòng",
          [
            "Dự phòng nghiệp vụ / VCSH"
          ]
        ],
        [
          "Định giá",
          [
            "P/B"
          ]
        ]
      ]
    ]
  ],
  "bds": [
    [
      "Chỉ tiêu chung",
      [
        [
          "Tăng trưởng",
          [
            "Tăng trưởng LNST",
            "Tăng trưởng EPS",
            "Revenue CAGR 3Y",
            "Net Profit CAGR 3Y",
            "EPS CAGR 3Y"
          ]
        ],
        [
          "Ổn định",
          [
            "Profit Positive Streak",
            "Margin Stability",
            "EPS Stability"
          ]
        ],
        [
          "Hiệu quả",
          [
            "ROE",
            "ROA",
            "Biên lợi nhuận ròng"
          ]
        ],
        [
          "Định giá",
          [
            "P/S",
            "PEG"
          ]
        ]
      ]
    ],
    [
      "Chỉ tiêu bất động sản",
      [
        [
          "Doanh thu và lợi nhuận",
          [
            "Tăng trưởng doanh thu",
            "Revenue Growth Stability",
            "Biên lợi nhuận gộp",
            "Lợi nhuận ngoài kinh doanh bất động sản / LNTT"
          ]
        ],
        [
          "Doanh thu chờ ghi nhận",
          [
            "Người mua trả tiền trước / Doanh thu",
            "Tăng trưởng người mua trả tiền trước",
            "Doanh thu chưa thực hiện / VCSH"
          ]
        ],
        [
          "Tồn kho và tài sản",
          [
            "Tồn kho / Tổng tài sản",
            "Số năm bán hết tồn kho",
            "Tỷ trọng bất động sản đầu tư",
            "Phải thu và trả trước / VCSH"
          ]
        ],
        [
          "Nợ và dòng tiền",
          [
            "D/E",
            "Tỷ trọng nợ vay ngắn hạn",
            "Tiền / Nợ vay ngắn hạn",
            "Lãi vay đã trả / Chi phí lãi vay",
            "Interest Coverage",
            "CFO / LNST"
          ]
        ],
        [
          "Định giá",
          [
            "P/E",
            "P/B"
          ]
        ]
      ]
    ]
  ],
  "dk": [
    [
      "Chỉ tiêu chung",
      [
        [
          "Tăng trưởng",
          [
            "Tăng trưởng LNST",
            "Tăng trưởng EPS",
            "Revenue CAGR 3Y",
            "Net Profit CAGR 3Y",
            "EPS CAGR 3Y"
          ]
        ],
        [
          "Ổn định",
          [
            "Profit Positive Streak",
            "Revenue Growth Stability",
            "EPS Stability"
          ]
        ],
        [
          "Hiệu quả",
          [
            "ROE",
            "ROA",
            "Biên lợi nhuận ròng"
          ]
        ],
        [
          "Định giá",
          [
            "P/B",
            "P/S",
            "PEG"
          ]
        ]
      ]
    ],
    [
      "Chỉ tiêu dầu khí",
      [
        [
          "Doanh thu và biên lợi nhuận",
          [
            "Tăng trưởng doanh thu",
            "Biên lợi nhuận gộp",
            "Margin Stability",
            "Số ngày tồn kho"
          ]
        ],
        [
          "Tài sản và đầu tư",
          [
            "Khấu hao / Doanh thu",
            "Capex / Khấu hao",
            "ROIC",
            "FCF Margin"
          ]
        ],
        [
          "Tiền và nợ",
          [
            "Tiền ròng / VCSH",
            "Net Debt / EBITDA",
            "Thu nhập tài chính / LNTT"
          ]
        ],
        [
          "Đơn hàng và cổ tức",
          [
            "Người mua trả tiền trước / Doanh thu",
            "Tỷ lệ chi trả cổ tức"
          ]
        ],
        [
          "Định giá",
          [
            "P/E",
            "EV / EBITDA"
          ]
        ]
      ]
    ]
  ],
  "bl": [
    [
      "Chỉ tiêu chung",
      [
        [
          "Tăng trưởng",
          [
            "Tăng trưởng LNST",
            "Tăng trưởng EPS",
            "Revenue CAGR 3Y",
            "Net Profit CAGR 3Y",
            "EPS CAGR 3Y"
          ]
        ],
        [
          "Ổn định",
          [
            "Profit Positive Streak",
            "Revenue Growth Stability",
            "Margin Stability",
            "EPS Stability"
          ]
        ],
        [
          "Hiệu quả",
          [
            "ROE",
            "ROA",
            "Biên lợi nhuận ròng"
          ]
        ],
        [
          "Định giá",
          [
            "P/B",
            "P/S",
            "PEG"
          ]
        ]
      ]
    ],
    [
      "Chỉ tiêu bán lẻ và tiêu dùng",
      [
        [
          "Doanh thu và biên lợi nhuận",
          [
            "Tăng trưởng doanh thu",
            "Biên lợi nhuận gộp",
            "Chi phí bán hàng và quản lý / Doanh thu",
            "Biên lợi nhuận kinh doanh chính"
          ]
        ],
        [
          "Vốn lưu động",
          [
            "Số ngày tồn kho",
            "Dự phòng giảm giá tồn kho / Tồn kho",
            "Phải trả người bán / Tồn kho",
            "Cash Conversion Cycle",
            "Vay ngắn hạn / Tồn kho"
          ]
        ],
        [
          "Hiệu quả và cổ tức",
          [
            "Doanh thu / Tài sản cố định",
            "ROIC",
            "Tỷ lệ chi trả cổ tức"
          ]
        ],
        [
          "Định giá",
          [
            "P/E"
          ]
        ]
      ]
    ]
  ],
  "dien": [
    [
      "Chỉ tiêu chung",
      [
        [
          "Tăng trưởng",
          [
            "Tăng trưởng LNST",
            "Tăng trưởng EPS",
            "Revenue CAGR 3Y",
            "Net Profit CAGR 3Y",
            "EPS CAGR 3Y"
          ]
        ],
        [
          "Ổn định",
          [
            "Profit Positive Streak",
            "Revenue Growth Stability",
            "EPS Stability"
          ]
        ],
        [
          "Hiệu quả",
          [
            "ROE",
            "ROA",
            "Biên lợi nhuận ròng"
          ]
        ],
        [
          "Định giá",
          [
            "P/E",
            "P/B",
            "P/S",
            "PEG"
          ]
        ]
      ]
    ],
    [
      "Chỉ tiêu điện và tiện ích",
      [
        [
          "Doanh thu và biên lợi nhuận",
          [
            "Tăng trưởng doanh thu",
            "Biên lợi nhuận gộp",
            "Margin Stability",
            "Biên EBITDA"
          ]
        ],
        [
          "Tài sản và đầu tư",
          [
            "Khấu hao / Doanh thu",
            "Tài sản cố định / Tổng tài sản",
            "Xây dựng dở dang / Tài sản cố định",
            "Capex / Khấu hao",
            "Số ngày thu tiền"
          ]
        ],
        [
          "Nợ và chi phí tài chính",
          [
            "D/E",
            "Net Debt / EBITDA",
            "Interest Coverage",
            "Chi phí tài chính ngoài lãi vay / LNTT"
          ]
        ],
        [
          "Cổ tức và định giá",
          [
            "Tỷ lệ chi trả cổ tức",
            "EV / EBITDA"
          ]
        ]
      ]
    ]
  ],
  "vl": [
    [
      "Chỉ tiêu chung",
      [
        [
          "Tăng trưởng",
          [
            "Tăng trưởng LNST",
            "Tăng trưởng EPS",
            "Revenue CAGR 3Y",
            "Net Profit CAGR 3Y",
            "EPS CAGR 3Y"
          ]
        ],
        [
          "Ổn định",
          [
            "Profit Positive Streak",
            "Revenue Growth Stability",
            "EPS Stability"
          ]
        ],
        [
          "Hiệu quả",
          [
            "ROE",
            "ROA",
            "Biên lợi nhuận ròng"
          ]
        ],
        [
          "Định giá",
          [
            "P/E",
            "P/S",
            "PEG"
          ]
        ]
      ]
    ],
    [
      "Chỉ tiêu vật liệu cơ bản",
      [
        [
          "Doanh thu và biên lợi nhuận",
          [
            "Tăng trưởng doanh thu",
            "Biên lợi nhuận gộp",
            "Margin Stability"
          ]
        ],
        [
          "Tồn kho",
          [
            "Số ngày tồn kho",
            "Dự phòng giảm giá tồn kho / Tồn kho",
            "Vay ngắn hạn / Tồn kho"
          ]
        ],
        [
          "Tài sản và đầu tư",
          [
            "Biên EBITDA",
            "Capex / Khấu hao",
            "Xây dựng dở dang / Tài sản cố định",
            "ROIC"
          ]
        ],
        [
          "Nợ và chi phí tài chính",
          [
            "Net Debt / EBITDA",
            "Chi phí tài chính ngoài lãi vay / LNTT"
          ]
        ],
        [
          "Định giá",
          [
            "EV / EBITDA",
            "P/B"
          ]
        ]
      ]
    ]
  ]
}

export const V3_DEFAULTS: Record<string, readonly string[]> = {
  "thuong": [
    "Tăng trưởng doanh thu",
    "Tăng trưởng LNST",
    "Biên lợi nhuận ròng",
    "ROE",
    "D/E",
    "P/E"
  ],
  "nh": [
    "Tăng trưởng LNST",
    "NIM",
    "CIR",
    "Chi phí tín dụng",
    "ROE",
    "P/B"
  ],
  "ck": [
    "Cơ cấu doanh thu hoạt động",
    "Tăng trưởng LNST",
    "Dư nợ cho vay / VCSH",
    "Biên lợi nhuận hoạt động",
    "ROE",
    "P/B"
  ],
  "bh": [
    "Tăng trưởng doanh thu phí bảo hiểm gốc",
    "Combined ratio",
    "Lợi suất đầu tư",
    "Tăng trưởng LNST",
    "ROE",
    "P/B"
  ],
  "bds": [
    "Người mua trả tiền trước / Doanh thu",
    "Tăng trưởng LNST",
    "Số năm bán hết tồn kho",
    "D/E",
    "Lãi vay đã trả / Chi phí lãi vay",
    "P/B"
  ],
  "dk": [
    "Tăng trưởng doanh thu",
    "Biên lợi nhuận gộp",
    "Tăng trưởng LNST",
    "Tiền ròng / VCSH",
    "ROE",
    "EV / EBITDA"
  ],
  "bl": [
    "Tăng trưởng doanh thu",
    "Biên lợi nhuận gộp",
    "Chi phí bán hàng và quản lý / Doanh thu",
    "Số ngày tồn kho",
    "ROIC",
    "P/E"
  ],
  "dien": [
    "Tăng trưởng doanh thu",
    "Biên EBITDA",
    "Capex / Khấu hao",
    "D/E",
    "Interest Coverage",
    "EV / EBITDA"
  ],
  "vl": [
    "Tăng trưởng doanh thu",
    "Biên lợi nhuận gộp",
    "Số ngày tồn kho",
    "Net Debt / EBITDA",
    "Capex / Khấu hao",
    "P/B"
  ]
}

/** Tên chỉ tiêu: [metric_key, khuôn]. */
export const V3_ITEMS: Record<string, readonly [metricKey: string, kind: string]> = {
  "Asset Turnover": [
    "asset_turnover",
    "B"
  ],
  "Biên EBITDA": [
    "ebitda_margin",
    "B"
  ],
  "Biên lợi nhuận gộp": [
    "gross_margin",
    "B"
  ],
  "Biên lợi nhuận hoạt động": [
    "operating_margin",
    "B"
  ],
  "Biên lợi nhuận kinh doanh chính": [
    "core_margin",
    "B"
  ],
  "Biên lợi nhuận môi giới": [
    "brokerage_margin",
    "B"
  ],
  "Biên lợi nhuận ròng": [
    "net_margin",
    "B"
  ],
  "CFO / LNST": [
    "cfo_profit",
    "B"
  ],
  "CFO Margin": [
    "cfo_margin",
    "B"
  ],
  "CIR": [
    "cir",
    "B"
  ],
  "Capex / Khấu hao": [
    "capex_to_depreciation",
    "B"
  ],
  "Capex / Revenue": [
    "capex_revenue",
    "B"
  ],
  "Cash Conversion Cycle": [
    "ccc",
    "C"
  ],
  "Chi phí bán hàng và quản lý / Doanh thu": [
    "sga_to_revenue",
    "B"
  ],
  "Chi phí hoạt động / Doanh thu hoạt động": [
    "opex_to_revenue",
    "B"
  ],
  "Chi phí tài chính ngoài lãi vay / LNTT": [
    "non_interest_fin_cost_to_pbt",
    "B"
  ],
  "Chi phí tín dụng": [
    "credit_cost",
    "B"
  ],
  "Combined ratio": [
    "combined_ratio",
    "B"
  ],
  "Current Ratio": [
    "current_ratio",
    "B"
  ],
  "Cơ cấu doanh thu hoạt động": [
    "revenue_mix",
    "B"
  ],
  "Cơ cấu lợi nhuận": [
    "profit_mix",
    "B"
  ],
  "D/E": [
    "debt_equity",
    "B"
  ],
  "Doanh thu / Tài sản cố định": [
    "revenue_to_fixed_assets",
    "B"
  ],
  "Doanh thu chưa thực hiện / VCSH": [
    "unearned_to_equity",
    "B"
  ],
  "Dư nợ cho vay / VCSH": [
    "margin_loan_to_equity",
    "B"
  ],
  "Dự phòng giảm giá tồn kho / Tồn kho": [
    "inventory_provision_ratio",
    "B"
  ],
  "Dự phòng nghiệp vụ / VCSH": [
    "reserves_to_equity",
    "B"
  ],
  "EPS CAGR 3Y": [
    "eps_cagr3",
    "D"
  ],
  "EPS Stability": [
    "eps_growth_stability",
    "E1"
  ],
  "EV / EBITDA": [
    "ev_ebitda",
    "F"
  ],
  "FCF Margin": [
    "fcf_margin",
    "B"
  ],
  "FCF Positive Streak": [
    "fcf_positive_streak",
    "E2"
  ],
  "FCF Yield": [
    "fcf_yield",
    "F"
  ],
  "Hiệu suất tự doanh": [
    "prop_return",
    "B"
  ],
  "Interest Coverage": [
    "interest_coverage",
    "B"
  ],
  "Khấu hao / Doanh thu": [
    "depreciation_to_revenue",
    "B"
  ],
  "LDR": [
    "ldr",
    "B"
  ],
  "Lãi dự thu / Dư nợ": [
    "accrued_to_loans",
    "B"
  ],
  "Lãi vay đã trả / Chi phí lãi vay": [
    "interest_paid_to_expense",
    "B"
  ],
  "Lợi nhuận ngoài kinh doanh bất động sản / LNTT": [
    "non_core_profit_to_pbt",
    "B"
  ],
  "Lợi suất cho vay": [
    "margin_loan_yield",
    "B"
  ],
  "Lợi suất tài sản sinh lãi và chi phí vốn": [
    "yield_cost",
    "B"
  ],
  "Lợi suất đầu tư": [
    "investment_yield",
    "B"
  ],
  "Margin Stability": [
    "net_margin_stability",
    "E1"
  ],
  "NIM": [
    "nim",
    "B"
  ],
  "Net Debt / EBITDA": [
    "net_debt_ebitda",
    "B"
  ],
  "Net Profit CAGR 3Y": [
    "profit_cagr3",
    "D"
  ],
  "Người mua trả tiền trước / Doanh thu": [
    "buyer_prepay_to_revenue",
    "B"
  ],
  "Nợ vay / VCSH": [
    "borrowings_to_equity",
    "B"
  ],
  "P/B": [
    "pb",
    "F"
  ],
  "P/E": [
    "pe",
    "F"
  ],
  "P/S": [
    "ps",
    "F"
  ],
  "PEG": [
    "peg",
    "F2"
  ],
  "Phải thu và trả trước / VCSH": [
    "prepay_receivables_to_equity",
    "B"
  ],
  "Phải trả người bán / Tồn kho": [
    "payables_to_inventory",
    "B"
  ],
  "Profit Positive Streak": [
    "profit_positive_streak",
    "E2"
  ],
  "ROA": [
    "roa",
    "B"
  ],
  "ROE": [
    "roe",
    "B"
  ],
  "ROIC": [
    "roic",
    "B"
  ],
  "ROIC Stability": [
    "roic_stability",
    "E1"
  ],
  "Revenue CAGR 3Y": [
    "revenue_cagr3",
    "D"
  ],
  "Revenue Growth Stability": [
    "revenue_growth_stability",
    "E1"
  ],
  "Số ngày thu tiền": [
    "receivable_days",
    "B"
  ],
  "Số ngày tồn kho": [
    "inventory_days",
    "B"
  ],
  "Số năm bán hết tồn kho": [
    "inventory_years",
    "B"
  ],
  "Thu nhập tài chính / LNTT": [
    "fin_income_to_pbt",
    "B"
  ],
  "Tiền / Nợ vay ngắn hạn": [
    "cash_to_st_debt",
    "B"
  ],
  "Tiền ròng / VCSH": [
    "net_cash_to_equity",
    "B"
  ],
  "Tài sản cố định / Tổng tài sản": [
    "fixed_assets_to_assets",
    "B"
  ],
  "Tăng trưởng EPS": [
    "eps_yoy",
    "A"
  ],
  "Tăng trưởng LNST": [
    "profit_yoy",
    "A"
  ],
  "Tăng trưởng doanh thu": [
    "revenue_yoy",
    "A"
  ],
  "Tăng trưởng doanh thu phí bảo hiểm gốc": [
    "gwp_growth",
    "A"
  ],
  "Tăng trưởng dư nợ cho vay": [
    "margin_loan_growth",
    "A"
  ],
  "Tăng trưởng lợi nhuận trước dự phòng": [
    "ppop_growth",
    "A"
  ],
  "Tăng trưởng người mua trả tiền trước": [
    "buyer_prepay_growth",
    "A"
  ],
  "Tăng trưởng tín dụng và huy động": [
    "credit_deposit_growth",
    "A"
  ],
  "Tồn kho / Tổng tài sản": [
    "inventory_to_assets",
    "B"
  ],
  "Tỷ lệ bồi thường": [
    "loss_ratio",
    "B"
  ],
  "Tỷ lệ chi phí": [
    "expense_ratio",
    "B"
  ],
  "Tỷ lệ chi trả cổ tức": [
    "dividend_payout",
    "B"
  ],
  "Tỷ lệ dự phòng / Dư nợ": [
    "provision_to_loans",
    "B"
  ],
  "Tỷ lệ giữ lại": [
    "retention_ratio",
    "B"
  ],
  "Tỷ trọng bất động sản đầu tư": [
    "investment_property_share",
    "B"
  ],
  "Tỷ trọng nợ vay ngắn hạn": [
    "st_debt_share",
    "B"
  ],
  "Tỷ trọng thu nhập ngoài lãi": [
    "non_interest_share",
    "B"
  ],
  "Tỷ trọng tài sản tự doanh": [
    "prop_asset_share",
    "B"
  ],
  "VCSH / Tổng tài sản": [
    "equity_to_assets",
    "B"
  ],
  "Vay ngắn hạn / Tồn kho": [
    "st_debt_to_inventory",
    "B"
  ],
  "Xây dựng dở dang / Tài sản cố định": [
    "cip_to_fixed_assets",
    "B"
  ]
}

