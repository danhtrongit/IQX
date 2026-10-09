export const COMPANY = {
  product: "IQX",
  legalName: "Viet Nam Stock Express Company Limited",
  shortName: "VNSE",
  taxCode: "0319077430",
  address:
    "702A, 7th Floor, Centre Point, 106 Nguyen Van Troi, Phu Nhuan, Ho Chi Minh City, Vietnam",
  website: "https://iqx.vn",
  founded: "August 2025",
} as const

export const LEGAL_LINE_VI =
  "IQX là sản phẩm của Công ty TNHH Viet Nam Stock Express (VNSE) — MST 0319077430 — 702A, Tầng 7, Centre Point, 106 Nguyễn Văn Trỗi, Phú Nhuận, TP. Hồ Chí Minh."

export const LEGAL_LINE_EN =
  "IQX is a product of Viet Nam Stock Express Company Limited (VNSE) — Tax code 0319077430 — 702A, 7th Floor, Centre Point, 106 Nguyen Van Troi, Phu Nhuan, Ho Chi Minh City."

export const ABOUT_SEO = {
  title: "About IQX · Viet Nam Stock Express Co., Ltd",
  description:
    "IQX is an investment-learning and simulated-trading platform for the Vietnamese stock market, built by Viet Nam Stock Express Company Limited (VNSE), founded in August 2025.",
}

export const ABOUT_INTRO =
  "IQX helps Vietnamese retail investors learn to invest systematically. Users read the market with clear analytics, study structured lessons, and practise with virtual capital before risking real money."

export const COMPANY_FACTS = [
  { term: "Founded", detail: `${COMPANY.founded}, Ho Chi Minh City` },
  {
    term: "Operated by",
    detail: `${COMPANY.legalName} (${COMPANY.shortName})`,
  },
  { term: "Tax code", detail: COMPANY.taxCode },
  { term: "Registered address", detail: COMPANY.address },
  { term: "Website", detail: "iqx.vn", href: COMPANY.website },
] as const

export const TEAM_COPY =
  "IQX is built by the founding team of Viet Nam Stock Express (VNSE), combining experience in Vietnamese capital markets, investor education and software engineering."

export const PRODUCTS = [
  "Market analytics for HOSE, HNX and UPCOM with 38 technical indicators and stock detail pages.",
  "Investment academy with lessons and a 7-step learning journey (Level 0 to Level 6).",
  "Demo trading with 100 million VND of virtual capital by default. No real money is involved.",
  "Strategy tools: alerts and backtests.",
  "AI-assisted analysis: daily market briefs, stock insights and plain-language financial statement analysis.",
] as const

export const AI_COPY =
  "We are adopting Claude by Anthropic to power IQX's AI features: market analysis and daily briefs, explanations of financial statements, and an investing-learning assistant that answers learners' questions and reviews their simulated trades."

export const DISCLAIMER_EN =
  "IQX provides analytical and educational tools, not investment advice. Simulated trading results do not guarantee real-world results."
