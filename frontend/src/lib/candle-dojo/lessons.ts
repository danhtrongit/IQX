/**
 * Danh mục Candle Dojo: Nhập môn, 5 Dojo, 27 bài (spec v1.2 §2, §6). Chỉ phần văn bản; biểu đồ của từng
 * bài nằm ở `content/exercises.json`. Sao nguyên văn từ backend sang frontend; xem `detector.ts`.
 */

export const CD_CATALOG_VERSION = 'iqx-candle-dojo-v1';

export interface CdDojoDef {
  /** 0 = Nhập môn, 1-5 = Dojo. */
  readonly n: number;
  readonly name: string;
  readonly belt: string;
  readonly color: string;
}

export interface CdLessonDef {
  readonly id: string;
  readonly dojo: 1 | 2 | 3 | 4 | 5;
  readonly title: string;
  readonly cards: readonly string[];
  /** Thẻ chính của bài, dùng cho câu hỏi và nhãn ở bước Săn nến. */
  readonly mainCard: string;
  readonly features: readonly string[];
  /** Câu chú thích từng giai đoạn của bước Câu chuyện. */
  readonly captions: readonly string[];
  /** Số nến của mẫu trong bước Câu chuyện. */
  readonly patternBars: number;
}

export const CD_DOJOS: readonly CdDojoDef[] = [
  {
    n: 0,
    name: 'Nhập môn',
    belt: 'Trắng',
    color: '#F2F2F2',
  },
  {
    n: 1,
    name: 'Nến đơn',
    belt: 'Vàng',
    color: '#F2C200',
  },
  {
    n: 2,
    name: 'Nến đôi',
    belt: 'Xanh',
    color: '#1E9E5A',
  },
  {
    n: 3,
    name: 'Nến ba',
    belt: 'Nâu',
    color: '#8A5A2B',
  },
  {
    n: 4,
    name: 'Mẫu 4 nến',
    belt: 'Đỏ',
    color: '#C8312B',
  },
  {
    n: 5,
    name: 'Mẫu 5 nến trở lên',
    belt: 'Đen',
    color: '#1A1410',
  },
];

export const CD_LESSONS: readonly CdLessonDef[] = [
  {
    id: 'marubozu',
    dojo: 1,
    title: 'Marubozu',
    cards: ['marubozu_tang', 'marubozu_giam'],
    mainCard: 'marubozu_tang',
    features: [
      'Thân chiếm gần trọn cây nến',
      'Bóng mỗi đầu ≤ 5% biên độ',
      'Dài ít nhất 1 ATR',
      'Xanh: Bullish · Đỏ: Bearish',
    ],
    captions: [
      'Thị trường đi ngang, chưa bên nào trội',
      'Mở cửa là phe mua nhảy vào, giá lên một mạch, đóng ở đỉnh',
      'Không có bóng: phe bán không kịp phản ứng',
    ],
    patternBars: 1,
  },
  {
    id: 'doji',
    dojo: 1,
    title: 'Doji',
    cards: ['doji'],
    mainCard: 'doji',
    features: [
      'Thân ≤ 5% biên độ',
      'Giá mở ≈ giá đóng',
      'Nến đủ lớn (≥ 0,5 ATR)',
      'Hai phe hoà nhau',
    ],
    captions: [
      'Giá đang chạy theo một hướng',
      'Trong phiên giá lên xuống giằng co, cuối phiên đóng đúng chỗ mở cửa',
      'Không ai thắng: thị trường đang lưỡng lự',
    ],
    patternBars: 1,
  },
  {
    id: 'hammer',
    dojo: 1,
    title: 'Hammer & Hanging Man',
    cards: ['bua', 'treo_co'],
    mainCard: 'bua',
    features: [
      'Thân nhỏ, nằm trên cùng',
      'Bóng dưới ≥ 2 lần thân',
      'Bóng trên ≤ 15%',
      'Sau nhịp giảm: Hammer · Sau nhịp tăng: Hanging Man',
    ],
    captions: [
      'Phe bán kiểm soát, giá giảm từng phiên',
      'Phiên mới bị bán tháo… rồi phe mua kéo ngược lên, đóng gần đỉnh',
      'Bóng dưới dài là dấu vết phe bán thua',
    ],
    patternBars: 1,
  },
  {
    id: 'invhammer',
    dojo: 1,
    title: 'Inverted Hammer & Shooting Star',
    cards: ['bua_nguoc', 'sao_bang'],
    mainCard: 'bua_nguoc',
    features: [
      'Thân nhỏ, nằm dưới cùng',
      'Bóng trên ≥ 2 lần thân',
      'Bóng dưới ≤ 15%',
      'Sau nhịp giảm: Inverted Hammer · Sau nhịp tăng: Shooting Star',
    ],
    captions: [
      'Giá giảm liên tục nhiều phiên',
      'Phe mua thử đẩy giá lên cao… nhưng cuối phiên bị ép xuống lại',
      'Bóng trên dài: phe mua đã bắt đầu thử sức',
    ],
    patternBars: 1,
  },
  {
    id: 'limitlock',
    dojo: 1,
    title: 'Limit Up Lock & Limit Down Lock',
    cards: ['tran_trang', 'san_trang'],
    mainCard: 'tran_trang',
    features: [
      'Mở, cao, thấp, đóng đều bằng giá trần',
      'Không còn ai bán',
      'Riêng thị trường Việt Nam',
      'Sàn: Limit Down Lock',
    ],
    captions: [
      'Cổ phiếu giao dịch bình thường',
      'Mở cửa đã ở giá trần, cả phiên không ai bán ra',
      'Cây nến chỉ còn một vạch ở giá trần',
    ],
    patternBars: 1,
  },
  {
    id: 'limitclose',
    dojo: 1,
    title: 'Limit Up Close & Limit Down Close',
    cards: ['keo_tran', 'dap_san'],
    mainCard: 'keo_tran',
    features: [
      'Mở cửa từ tham chiếu trở xuống',
      'Đóng cửa đúng giá trần',
      'Riêng thị trường Việt Nam',
      'Ngược lại: Limit Down Close',
    ],
    captions: [
      'Cổ phiếu giao dịch bình thường',
      'Mở cửa dưới tham chiếu, rồi dòng tiền ào vào kéo thẳng lên trần',
      'Đóng cửa ở giá trần: phe mua thắng tuyệt đối',
    ],
    patternBars: 1,
  },
  {
    id: 'engulfing',
    dojo: 2,
    title: 'Engulfing',
    cards: ['nhan_chim_tang', 'nhan_chim_giam'],
    mainCard: 'nhan_chim_tang',
    features: [
      'Nến 2 ngược màu nến 1',
      'Thân nến 2 nuốt trọn thân nến 1',
      'Sau nhịp giảm: Bullish · Sau nhịp tăng: Bearish',
    ],
    captions: [
      'Giá giảm nhiều phiên',
      'Thêm một nến đỏ',
      'Phiên sau mở thấp hơn nhưng phe mua đẩy lên, nuốt trọn nến đỏ',
      'Phe mua giành lại thế trận',
    ],
    patternBars: 2,
  },
  {
    id: 'harami',
    dojo: 2,
    title: 'Harami',
    cards: ['harami_tang', 'harami_giam'],
    mainCard: 'harami_tang',
    features: [
      'Nến 1 dài',
      'Thân nến 2 nằm trong thân nến 1',
      'Thân nến 2 ≤ 50% thân nến 1',
      'Sau nhịp giảm: Bullish · Sau nhịp tăng: Bearish',
    ],
    captions: [
      'Giá giảm mạnh',
      'Một nến đỏ dài',
      'Phiên sau nhỏ hẳn, nằm gọn trong nến đỏ',
      'Đà bán đã chững lại',
    ],
    patternBars: 2,
  },
  {
    id: 'piercing',
    dojo: 2,
    title: 'Piercing Line & Dark Cloud Cover',
    cards: ['duong_xuyen', 'may_den'],
    mainCard: 'duong_xuyen',
    features: [
      'Nến 1 dài',
      'Nến 2 mở dưới giá đóng nến 1',
      'Nến 2 đóng quá nửa thân nến 1',
      'Nhưng chưa nuốt trọn',
    ],
    captions: [
      'Giá đang giảm',
      'Một nến đỏ dài',
      'Phiên sau mở thấp, rồi kéo lên quá nửa nến đỏ',
      'Phe mua phản công',
    ],
    patternBars: 2,
  },
  {
    id: 'tweezer',
    dojo: 2,
    title: 'Tweezer Bottom & Top',
    cards: ['nhip_day', 'nhip_dinh'],
    mainCard: 'nhip_day',
    features: [
      'Nến đỏ rồi nến xanh',
      'Hai đáy bằng nhau',
      'Sau nhịp giảm: Bottom · Đỉnh bằng nhau sau nhịp tăng: Top',
    ],
    captions: [
      'Giá giảm',
      'Nến đỏ chạm một mức đáy',
      'Phiên sau chạm đúng mức đáy đó rồi bật lên',
      'Mức giá này có người mua chặn lại',
    ],
    patternBars: 2,
  },
  {
    id: 'kicker',
    dojo: 2,
    title: 'Kicker',
    cards: ['cu_da_tang', 'cu_da_giam'],
    mainCard: 'cu_da_tang',
    features: [
      'Nến 1 dài',
      'Nến 2 dài, ngược màu',
      'Nến 2 mở gap vượt giá mở nến 1',
      'Không chạm lại nến 1',
    ],
    captions: [
      'Giá đang giảm',
      'Một nến đỏ dài',
      'Có tin bất ngờ: phiên sau mở vọt lên, đi một mạch',
      'Tâm lý đảo chiều hoàn toàn',
    ],
    patternBars: 2,
  },
  {
    id: 'window',
    dojo: 2,
    title: 'Rising & Falling Window',
    cards: ['gap_tang', 'gap_giam'],
    mainCard: 'gap_tang',
    features: [
      'Đang có xu hướng',
      'Nến 2 mở gap, không chạm nến 1',
      'Nến 2 cùng chiều xu hướng, thân rõ',
      'Tăng: Rising · Giảm: Falling',
    ],
    captions: [
      'Giá đang tăng',
      'Một nến xanh',
      'Phiên sau mở vọt lên, để lại khoảng trống',
      'Lực mua còn mạnh',
    ],
    patternBars: 2,
  },
  {
    id: 'separating',
    dojo: 2,
    title: 'Separating Lines',
    cards: ['tach_roi_tang', 'tach_roi_giam'],
    mainCard: 'tach_roi_tang',
    features: [
      'Đang có xu hướng',
      'Nến 1 ngược chiều xu hướng',
      'Nến 2 mở đúng giá mở nến 1',
      'Nến 2 dài, theo xu hướng',
    ],
    captions: [
      'Giá đang tăng',
      'Một phiên giảm, nhiều người tưởng đảo chiều',
      'Phiên sau mở đúng giá cũ và tăng mạnh',
      'Xu hướng tăng tiếp tục',
    ],
    patternBars: 2,
  },
  {
    id: 'onneck',
    dojo: 2,
    title: 'On-Neck',
    cards: ['tren_co'],
    mainCard: 'tren_co',
    features: [
      'Đang giảm',
      'Nến 1 đỏ dài',
      'Nến 2 mở dưới đáy nến 1',
      'Nến 2 đóng ngay tại đáy nến 1',
    ],
    captions: [
      'Giá đang giảm',
      'Một nến đỏ dài',
      'Phiên sau hồi lên nhưng chỉ chạm tới đáy cũ',
      'Lực hồi yếu, đà giảm còn',
    ],
    patternBars: 2,
  },
  {
    id: 'insidebar',
    dojo: 2,
    title: 'Inside Bar',
    cards: ['inside_bar'],
    mainCard: 'inside_bar',
    features: [
      'Nến mẹ dài (≥ 1 ATR)',
      'Nến sau nằm gọn trong biên độ nến mẹ',
      'Nến sau không có hình dạng đặc biệt',
      'Giá đang nén lại',
    ],
    captions: [
      'Thị trường biến động',
      'Một cây nến lớn',
      'Phiên sau co lại, nằm gọn bên trong',
      'Giá nén, chờ bùng nổ',
    ],
    patternBars: 2,
  },
  {
    id: 'star',
    dojo: 3,
    title: 'Morning Star & Evening Star',
    cards: ['sao_mai', 'sao_hom'],
    mainCard: 'sao_mai',
    features: [
      'Nến 1 dài',
      'Nến 2 thân nhỏ, nằm thấp hơn',
      'Nến 3 ngược màu, đóng quá nửa nến 1',
      'Đáy: Morning · Đỉnh: Evening',
    ],
    captions: [
      'Giá giảm mạnh',
      'Một nến đỏ dài',
      'Phiên sau thân nhỏ: phe bán đuối sức',
      'Phe mua vào mạnh, đóng quá nửa nến đỏ',
      'Ngôi sao buổi sáng: trời sắp sáng',
    ],
    patternBars: 3,
  },
  {
    id: 'soldiers',
    dojo: 3,
    title: 'Three White Soldiers & Three Black Crows',
    cards: ['ba_linh', 'ba_qua'],
    mainCard: 'ba_linh',
    features: [
      '3 nến dài cùng màu',
      'Mỗi nến mở trong thân nến trước',
      'Đóng cao dần',
      'Sau nhịp giảm: Soldiers · Sau nhịp tăng: Crows',
    ],
    captions: [
      'Giá giảm kéo dài',
      'Nến xanh dài đầu tiên',
      'Nến thứ hai tiếp nối',
      'Nến thứ ba xác nhận',
      'Ba người lính đã đổi chiều xu hướng',
    ],
    patternBars: 3,
  },
  {
    id: 'advance',
    dojo: 3,
    title: 'Advance Block',
    cards: ['khoi_tien'],
    mainCard: 'khoi_tien',
    features: [
      'Đang tăng',
      '3 nến xanh, đóng cao dần',
      'Thân ngắn dần',
      'Nến cuối có bóng trên dài',
    ],
    captions: [
      'Giá tăng mạnh',
      'Nến xanh dài',
      'Nến xanh ngắn hơn',
      'Nến xanh còn ngắn hơn, bị đẩy xuống từ đỉnh',
      'Lực mua đang cạn',
    ],
    patternBars: 3,
  },
  {
    id: 'twocrows',
    dojo: 3,
    title: 'Two Crows',
    cards: ['hai_qua'],
    mainCard: 'hai_qua',
    features: [
      'Đang tăng',
      'Nến 1 xanh dài',
      'Nến 2 đỏ, mở gap lên',
      'Nến 3 đỏ, đóng vào trong thân nến 1',
    ],
    captions: [
      'Giá tăng',
      'Nến xanh dài',
      'Mở vọt lên nhưng đóng giảm',
      'Thêm nến đỏ, lấp vào nến xanh',
      'Hai con quạ báo hiệu đỉnh',
    ],
    patternBars: 3,
  },
  {
    id: 'fakey',
    dojo: 3,
    title: 'Fakey',
    cards: ['fakey_tang', 'fakey_giam'],
    mainCard: 'fakey_tang',
    features: [
      'Nến mẹ',
      'Inside Bar',
      'Nến 3 phá thủng Inside Bar',
      'Rồi đóng ngược trở lại: phá vỡ giả',
    ],
    captions: [
      'Thị trường giằng co',
      'Nến mẹ',
      'Inside Bar: giá nén',
      'Phá xuống… rồi bị kéo ngược lên',
      'Ai bán theo phá vỡ đã bị bẫy',
    ],
    patternBars: 3,
  },
  {
    id: 'tls',
    dojo: 4,
    title: 'Three-Line Strike',
    cards: ['tan_cong_tang', 'tan_cong_giam'],
    mainCard: 'tan_cong_tang',
    features: [
      '3 nến cùng màu, đóng dần',
      'Nến 4 ngược màu',
      'Nến 4 nuốt trọn cả 3 nến',
      'Sau nhịp giảm: Bullish · Sau nhịp tăng: Bearish',
    ],
    captions: [
      'Giá giảm',
      'Nến đỏ thứ nhất',
      'Nến đỏ thứ hai',
      'Nến đỏ thứ ba',
      'Một nến xanh khổng lồ xoá sạch cả ba',
      'Phe bán bị đánh bật',
    ],
    patternBars: 4,
  },
  {
    id: 'cbs',
    dojo: 4,
    title: 'Concealing Baby Swallow',
    cards: ['en_con'],
    mainCard: 'en_con',
    features: [
      'Đang giảm',
      '2 nến đỏ không bóng',
      'Nến 3 gap xuống, có bóng trên',
      'Nến 4 nuốt trọn cả bóng nến 3',
    ],
    captions: [
      'Giá giảm',
      'Nến đỏ trơn',
      'Nến đỏ trơn thứ hai',
      'Gap xuống, bóng trên chạm vào nến trước',
      'Nến đỏ nuốt trọn: phe bán cạn kiệt',
      'Én con nằm khuất: đáy đã gần',
    ],
    patternBars: 4,
  },
  {
    id: 'threemethods',
    dojo: 5,
    title: 'Three Methods',
    cards: ['ba_pp_tang', 'ba_pp_giam'],
    mainCard: 'ba_pp_tang',
    features: [
      'Đang có xu hướng',
      'Nến 1 dài',
      '3 nến nhỏ nằm trong nến 1',
      'Nến 5 dài cùng chiều, vượt nến 1',
    ],
    captions: [
      'Giá tăng',
      'Nến xanh dài',
      'Nghỉ',
      'Nghỉ',
      'Nghỉ',
      'Nến xanh dài vượt lên',
      'Nghỉ ngơi xong, xu hướng tiếp tục',
    ],
    patternBars: 5,
  },
  {
    id: 'breakaway',
    dojo: 5,
    title: 'Breakaway',
    cards: ['but_pha_tang', 'but_pha_giam'],
    mainCard: 'but_pha_tang',
    features: [
      'Nến 1 dài',
      'Nến 2 gap theo xu hướng',
      'Nến 3, 4 đi tiếp',
      'Nến 5 dài ngược chiều, đóng vào khoảng trống',
    ],
    captions: [
      'Giá giảm',
      'Nến đỏ dài',
      'Gap xuống',
      'Giảm tiếp',
      'Giảm tiếp',
      'Nến xanh lấp vào khoảng trống',
      'Phe bán đã đi quá xa',
    ],
    patternBars: 5,
  },
  {
    id: 'ladder',
    dojo: 5,
    title: 'Ladder Bottom',
    cards: ['day_bac_thang'],
    mainCard: 'day_bac_thang',
    features: [
      'Đang giảm',
      '3 nến đỏ dài, bậc thang đi xuống',
      'Nến 4 đỏ, bóng trên dài',
      'Nến 5 xanh mở cao hơn, vượt đỉnh nến 4',
    ],
    captions: [
      'Giá giảm',
      'Bậc thứ nhất',
      'Bậc thứ hai',
      'Bậc thứ ba',
      'Nến đỏ có bóng trên: phe mua thử sức',
      'Nến xanh bật lên',
      'Bậc thang chạm đáy',
    ],
    patternBars: 5,
  },
  {
    id: 'island',
    dojo: 5,
    title: 'Island Reversal',
    cards: ['dao_day', 'dao_dinh'],
    mainCard: 'dao_day',
    features: [
      'Gap xuống',
      'Một cụm 3–10 nến tách biệt',
      'Gap lên ngược lại',
      'Cụm nến như hòn đảo bị bỏ lại',
    ],
    captions: [
      'Giá giảm',
      'Nến đỏ',
      'Gap xuống',
      'Đi ngang',
      'Đi ngang',
      'Gap lên ngược lại',
      'Hòn đảo bị bỏ lại phía dưới',
    ],
    patternBars: 5,
  },
  {
    id: 'tower',
    dojo: 5,
    title: 'Tower Bottom & Top',
    cards: ['thap_day', 'thap_dinh'],
    mainCard: 'thap_day',
    features: [
      'Nến 1 dài',
      '3–8 nến thân nhỏ đi ngang',
      'Nến cuối dài ngược chiều',
      'Như hai ngọn tháp hai bên',
    ],
    captions: [
      'Giá giảm',
      'Nến đỏ dài',
      'Đi ngang',
      'Đi ngang',
      'Đi ngang',
      'Nến xanh dài bật lên',
      'Hai ngọn tháp đóng khung vùng đáy',
    ],
    patternBars: 5,
  },
];

/** Mã bài của Nhập môn (Giải phẫu cây nến). */
export const CD_INTRO_ID = 'anatomy';

/** Thưởng xu của Candle Dojo (spec v1.2 §2, §5.1, §5.4). */
export const CD_REWARD_XU = { intro: 100, lesson: 100, belt: 300, drill: 20 } as const;

/** Thi đai: 8 câu, đúng từ 6 câu là qua. */
export const CD_EXAM = { questions: 8, passMark: 6 } as const;

const LESSON_BY_ID = new Map<string, CdLessonDef>(CD_LESSONS.map((lesson) => [lesson.id, lesson]));

export function cdLesson(id: string): CdLessonDef | undefined {
  return LESSON_BY_ID.get(id);
}

export function cdLessonsOfDojo(dojo: number): CdLessonDef[] {
  return CD_LESSONS.filter((lesson) => lesson.dojo === dojo);
}
