// Broker alias normalization. Sources print the broker in many spellings ("VDS", "Rồng Việt",
// "GTJA (Vietnam)"); the engine only ever uses the canonical key.

/** canonical key → raw aliases (as printed by sources / commonly used). */
const BROKER_ALIASES: Record<string, string[]> = {
  VNDIRECT: ['VNDIRECT', 'VNDS', 'VND', 'VNDirect Securities', 'Chứng khoán VNDIRECT'],
  VDSC: ['VDSC', 'VDS', 'Rồng Việt', 'Chứng khoán Rồng Việt', 'Rong Viet Securities'],
  NHSV: ['NHSV', 'Nhật Việt', 'Chứng khoán Nhật Việt', 'NHSV Securities'],
  GTJA: ['GTJA', 'Guotai', 'Guotai Junan', 'Guotai Haitong', 'Haitong', 'GTJA Vietnam'],
  VIETCAP: [
    'Vietcap',
    'VCSC',
    'VCI',
    'Bản Việt',
    'Chứng khoán Bản Việt',
    'Viet Capital Securities',
  ],
  SSI: ['SSI', 'SSI Research', 'Chứng khoán SSI'],
  HSC: ['HSC', 'HCMS', 'Chứng khoán TP.HCM', 'Ho Chi Minh City Securities'],
  MBS: ['MBS', 'MB Securities', 'Chứng khoán MB'],
  BSC: ['BSC', 'BIDV Securities', 'Chứng khoán BIDV'],
  KBSV: ['KBSV', 'KBS', 'KB Securities Vietnam', 'Chứng khoán KB Việt Nam'],
  ACBS: ['ACBS', 'ACB Securities', 'Chứng khoán ACB'],
  FPTS: ['FPTS', 'FPT Securities', 'Chứng khoán FPT'],
  VCBS: ['VCBS', 'Vietcombank Securities', 'Chứng khoán Vietcombank'],
  TCBS: ['TCBS', 'Techcom Securities', 'Chứng khoán Kỹ Thương'],
  KIS: ['KIS', 'KIS Vietnam', 'Korea Investment Securities'],
  MIRAE: ['Mirae', 'MAS', 'Mirae Asset', 'Mirae Asset Securities'],
  YUANTA: ['Yuanta', 'Yuanta Vietnam', 'Chứng khoán Yuanta'],
  AGRISECO: ['Agriseco', 'AGR', 'Chứng khoán Agribank'],
  PHS: ['PHS', 'Phú Hưng', 'Chứng khoán Phú Hưng'],
  BVSC: ['BVSC', 'BVS', 'Bảo Việt', 'Chứng khoán Bảo Việt'],
  SHS: ['SHS', 'Sài Gòn - Hà Nội', 'Chứng khoán Sài Gòn Hà Nội'],
  CTS: ['CTS', 'VietinBank Securities', 'Chứng khoán VietinBank'],
  VPBS: ['VPBS', 'VPBankS', 'Chứng khoán VPBank'],
  MSBS: ['MSBS', 'Chứng khoán MSB'],
  LPBS: ['LPBS', 'Chứng khoán LPBank'],
  DNSE: ['DNSE', 'Chứng khoán DNSE'],
  VIX: ['VIX', 'Chứng khoán VIX'],
  ABS: ['ABS', 'Chứng khoán An Bình'],
  WSS: ['WSS', 'Chứng khoán Phố Wall'],
  ASC: ['ASC', 'Chứng khoán Á Châu'],
};

/** Every raw alias plus canonical key; used to forbid broker names in AI output. */
export const BROKER_DISPLAY_NAMES: string[] = [
  ...new Set(
    Object.entries(BROKER_ALIASES).flatMap(([canonical, aliases]) => [canonical, ...aliases]),
  ),
];

/** Lower-case, no diacritics, parentheses removed, punctuation collapsed to single spaces. */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const LOOKUP = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(BROKER_ALIASES)) {
  LOOKUP.set(foldText(canonical), canonical);
  for (const alias of aliases) LOOKUP.set(foldText(alias), canonical);
}

const NOISE_PREFIX =
  /^(?:cong ty (?:co phan )?chung khoan|ctcp chung khoan|ctcp|chung khoan|cong ty)\s+/;

export interface NormalizedBroker {
  broker: string;
  brokerRaw: string;
}

/** Maps a raw broker label to its canonical key. Unknown labels become an upper-case slug. */
export function normalizeBroker(raw: string | null | undefined): NormalizedBroker {
  const brokerRaw = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const folded = foldText(brokerRaw);
  if (!folded) return { broker: 'UNKNOWN', brokerRaw: brokerRaw || 'UNKNOWN' };
  const direct = LOOKUP.get(folded) ?? LOOKUP.get(folded.replace(NOISE_PREFIX, ''));
  if (direct) return { broker: direct, brokerRaw };
  // Token / bigram scan: "Vietcap Securities", "SSI Research Team"...
  const tokens = folded.split(' ');
  for (let size = Math.min(3, tokens.length); size >= 1; size -= 1) {
    for (let i = 0; i + size <= tokens.length; i += 1) {
      const hit = LOOKUP.get(tokens.slice(i, i + size).join(' '));
      if (hit) return { broker: hit, brokerRaw };
    }
  }
  const slug = folded.replace(NOISE_PREFIX, '').replace(/ /g, '_').toUpperCase().slice(0, 40);
  return { broker: slug || 'UNKNOWN', brokerRaw };
}
