/**
 * Source gates for the chapter 1-4 content packages.
 *
 * Every hash below is copied from the chapter specs (file identification and normalised object
 * hashes). The extractor refuses to run on any other input, and `verify.ts` re-checks that the
 * committed import manifests still record exactly these values.
 */

export type LessonKind = 'technical' | 'fundamental' | 'concept' | 'guide';

export interface ImageGate {
  width: number;
  height: number;
  sha256: string;
}

export interface LessonGate {
  /** Lesson id inside the repository catalogue (`ch0N-l0M`). */
  id: string;
  /** Stable key (`technical:rsi`, `fundamental:revenue_yoy`, `guide:ch02-l01`, ...). */
  lesson_key: string;
  kind: LessonKind;
  /** Name from the approved 13-chapter / 71-lesson catalogue. */
  name: string;
  /** Lesson id used inside the source payload (`rsi`, `ch02-l01`, `rev`). */
  source_id: string;
  /** Capability/config id (indicator or metric id), null for guides and the concept lesson. */
  config_id: string | null;
  /** Spec SHA-256 of the normalised lesson object, when the spec publishes one. */
  object_sha256: string | null;
  /** Expected block inventory of the converted lesson. */
  counts: { charts: number; images: number; tables: number; questions: number };
}

export interface ChapterGate {
  chapter: 1 | 2 | 3 | 4;
  /** Package family stored in lessons[].source.package. */
  package: string;
  /** Repository content_version (<= 32 chars: academy_attempts/grants use varchar(32)). */
  content_version: string;
  /** Accepted source file names (the C4 spec says `-v1.0`, the supplied file has none). */
  html_files: string[];
  html_bytes: number;
  html_sha256: string;
  script_id: string;
  /** Raw text of the payload script. */
  payload_text_sha256: string;
  /** False when the spec does not publish this value and it was pinned from the supplied file. */
  payload_text_in_spec: boolean;
  /** Expected payload `version` string. */
  payload_version: string;
  /** Labels of the four section jump buttons. */
  nav_labels: [string, string, string, string];
  completion:
    | { mode: 'quiz'; question_count: 8; required_correct: 8 }
    | { mode: 'manual'; button_label: string };
  lessons: LessonGate[];
  /** Spec hashes of whole payload sub-trees, keyed by payload property (`$` is the root). */
  object_hashes: Record<string, string>;
  /** Spec hashes of decoded image bytes (C2, C4). */
  images: Record<string, ImageGate>;
  /** Totals the spec states for the chapter. */
  totals: {
    lessons: 6;
    sections: 24;
    images: number;
    charts: number;
    tables: number;
    questions: number;
  };
}

const C2_IMAGES: Record<string, ImageGate> = {
  '01-overview': {
    width: 2160,
    height: 1175,
    sha256: 'a6e2ba505d5cec700672a3355429f4519577e1184d3c6f76bda500e5f0922588',
  },
  '02-inputs': {
    width: 1705,
    height: 154,
    sha256: 'c86ba3ad6c2a98dd381231aff0fa45bed396596455188969985878ebd83130a2',
  },
  '03-add-buy': {
    width: 378,
    height: 140,
    sha256: '0fdc64435affedba1a149589c4748117e290a9781b7128968e525d5e405a428b',
  },
  '04-buy-config': {
    width: 992,
    height: 824,
    sha256: '81555fd3593db36b6e3662201a50d121c7051387997212560052441fa5cba4e9',
  },
  '05-buy-card': {
    width: 1705,
    height: 394,
    sha256: '80d0d9d7f6ee058f139db7a000ebc6d245251a77e30012f87565b44d3ee9c845',
  },
  '06-buy-and': {
    width: 1705,
    height: 469,
    sha256: 'ce200117b3e0c05eaf25ed182470a804644b28fd4c674f8d02bb0ed586e8738f',
  },
  '07-sell-config': {
    width: 992,
    height: 824,
    sha256: '805e8fddc68ccb4e3cd32f2f5e3acbcdd25ad6551a44ebb1a77d2dfff525d322',
  },
  '08-independent': {
    width: 1705,
    height: 391,
    sha256: '997b2ba6bd16e8094224bae945aec9d9a0c6b06401d6ac2b82b4e95c22e44d0b',
  },
  '09-sell-off': {
    width: 1705,
    height: 394,
    sha256: '3ddbb91a06366952203e371ce5c3ed194af2453db10c0fc6556d370de682cd0d',
  },
  '10-assumptions': {
    width: 1705,
    height: 189,
    sha256: '7e05eb23b71693547235bc954160f2320b9ba12462a6a9f27afc062af2b0a645',
  },
  '11-results': {
    width: 1705,
    height: 901,
    sha256: 'a6f779afce99259b3c2aaf63b1732d18ef1bf80a8f593d041b646ffc58608cda',
  },
  '12-kpis': {
    width: 1703,
    height: 193,
    sha256: '271d3ed0f991b0464ef58faadb67eff8a102a05aa9ad089068f467839d3b4eeb',
  },
  '13-chart': {
    width: 1703,
    height: 518,
    sha256: '4adce5912ffcde22a265050b68f669c25195aec12dd872a2fe927c5ec829513e',
  },
  '14-history': {
    width: 1705,
    height: 623,
    sha256: '0e700eba6d420cafc155b8c91c40f502ccac86d8ba9ca069ee0f84eb5292d122',
  },
  '15-trade-detail': {
    width: 992,
    height: 1034,
    sha256: 'e48344cc5653d9efcee1193b6a047320b8e3cf5ebcb2cff9a9a7aa37a14d3f70',
  },
  '16-save': {
    width: 992,
    height: 438,
    sha256: '31f9b642cb438a104d4a99b97065e144bb61ff4c580aae6e7983cd9169012bd0',
  },
  '17-dirty': {
    width: 1703,
    height: 158,
    sha256: 'd41a2e863ce6846bd5a100df6842d40ea05e5e16fa7abc197ed31b1771a1bcd7',
  },
  '18-results-b': {
    width: 1705,
    height: 901,
    sha256: 'ead26e2a92065953404c55902e0eea15ce4e036b0106e5d6515d6c79ec8406e9',
  },
  '19-saved': {
    width: 992,
    height: 536,
    sha256: '7c7739743531a30c0dcdfdf29934cb65f9f981a20f2b1f1c1f6a055a5e90264d',
  },
  '20-open-position': {
    width: 1705,
    height: 371,
    sha256: 'd8f0616fefc4ce4851ffcb64185f1af1eb5816be4ce98a451b95b72194f87d98',
  },
  '21-mobile': {
    width: 567,
    height: 214,
    sha256: '9aa0a64b6f4bf1dbeeaeaafc78a21120902129ec70a4b1442c74e6d230cbfd11',
  },
  '22-bollinger-config': {
    width: 992,
    height: 984,
    sha256: '89f80425aa73a25ba4a16eac14c9d02705d15d762d894c17c99284ac5b855fad',
  },
};

const C4_IMAGES: Record<string, ImageGate> = {
  '01-overview': {
    width: 2160,
    height: 1842,
    sha256: 'd144985101c97fc4a40b02915026d384ffb2dea73ef136b675efc5c98cb15123',
  },
  '02-mobile-entry': {
    width: 585,
    height: 198,
    sha256: '6f4c2457192172c51d433dadf536e0fc0fcd7b9bba78ece65651d8938e22d7f3',
  },
  '03-scope': {
    width: 1742,
    height: 192,
    sha256: 'a190aeb4bbff04585f90535a15f10452d3497576a9239207c8e1447f334b0310',
  },
  '04-library-add': {
    width: 428,
    height: 869,
    sha256: 'a81ef5300711f6954a427fc7aa44830a696045b65b19f10b06a2a3313ffdcd52',
  },
  '05-profit-rule': {
    width: 870,
    height: 228,
    sha256: '60b0075a5b1063e5dc9a94605daf622aec81dbb2da5692d195ce031771d6cf52',
  },
  '06-and-rules': {
    width: 1742,
    height: 347,
    sha256: '61642f17b4d300c899401e67d10fde8edd7df7593c8b0f29d56af5d960245da3',
  },
  '07-edit-rule': {
    width: 870,
    height: 228,
    sha256: '4cc19809982f3f36ce66adb971198fc2949361349b2b1ade64eb732c01d5fddf',
  },
  '08-empty-value': {
    width: 1742,
    height: 912,
    sha256: 'b6e57a49fd8df20c85bbbd27ae939c43e7e0bbed5ea3e182b3a708730967a46a',
  },
  '09-period-quarter': {
    width: 1742,
    height: 347,
    sha256: '41f3817c416d1dce7807d5445bb4ff7f95f70a281007fdf16cda080d0184f837',
  },
  '10-period-ttm': {
    width: 1742,
    height: 1121,
    sha256: '90af5a76727687fd779e87995b75029160a4fbdd8b9bb24ee93cf3a84336d1c2',
  },
  '11-results-A': {
    width: 1742,
    height: 908,
    sha256: '1980cc31e1f8dab60ed16c7066ee2b1c715341ab5e16e2c8cfb4c9a20847e5a6',
  },
  '12-metric-detail': {
    width: 1029,
    height: 1062,
    sha256: '056bd7e53319067a8e9a78e5e44b4c0508298db06e7b2cf5972600449593f73d',
  },
  '13-quality': {
    width: 1029,
    height: 539,
    sha256: 'f6213889ddb9ce5d22f06897111734bcee1c910f6da21add5aa45523d33f2a2c',
  },
  '14-selection': {
    width: 1742,
    height: 912,
    sha256: '0fb67a96291f6f428c303b81a05bc7c5ce323a36eb5f917f2d95c1c0617a96d9',
  },
  '15-save-A': {
    width: 1029,
    height: 477,
    sha256: '3a9bb66a972f96db4dc01e9aaad4645fc81d3410722348663df50f794d6db530',
  },
  '16-saved-A': {
    width: 1029,
    height: 468,
    sha256: '6ee52d97cab46419070a97f7f2fa5fc73e1c51e7959350946cb2765b6b0e86c8',
  },
  '17-filter-B': {
    width: 1742,
    height: 347,
    sha256: 'b720e1a54f98a90dd261229ec065183372a720036c8bf136b960e14a84a291a2',
  },
  '18-results-B': {
    width: 1742,
    height: 717,
    sha256: '4bc9656926efb1e8f364b47fdeffa257ebfe2c12759af383d1ef2aa903274c98',
  },
  '19-saved-AB': {
    width: 1029,
    height: 575,
    sha256: '7b8438393317feddd5c040cc2e9fb31aa9c5492665dc267743398638a880018b',
  },
  '20-save-list': {
    width: 1029,
    height: 477,
    sha256: 'c6dcf18bf5aa16978308ed121c400cb2d6e6cefb81e321a6dc828766eed8c504',
  },
  '21-list-detail': {
    width: 1029,
    height: 848,
    sha256: '1e91bcb7367005c1e2962ca8ecdc0fe17d05a849da9624b07f16561ce5331056',
  },
  '22-apply-direct': {
    width: 1029,
    height: 846,
    sha256: '01e22123128e8d16682ce1e0ea52343d976d456f845e37475ffc1660055a1294',
  },
  '23-apply-saved': {
    width: 1029,
    height: 468,
    sha256: '8e4b668f82625a071a0a5f4859534f2cc12d94b901ae27fb112d1b05144eabdd',
  },
  '24-source-pending': {
    width: 1742,
    height: 252,
    sha256: 'a479e42f456d1a7e5ee879dea5db6dd0a451f69218bcaead49fb047793131bc5',
  },
  '25-source-effective': {
    width: 1742,
    height: 164,
    sha256: '3fa21871b4ad4fa7d9fac5d5e1c9ed1476ae8e3f86fb24db92a360111468eea4',
  },
  '26-return-vn30': {
    width: 1029,
    height: 507,
    sha256: '71c93c4e407d76cbf3a12ad7321cd0d17aff719daf4a923ad10a2f610946c70a',
  },
  '27-bot-old-positions': {
    width: 1029,
    height: 1098,
    sha256: '996ec057f0ceb27459ba840aa6f576bdb278ad63a3a73c2aaf35fc884e393b48',
  },
};

const lesson = (
  id: string,
  lesson_key: string,
  kind: LessonKind,
  name: string,
  source_id: string,
  config_id: string | null,
  object_sha256: string | null,
  counts: Partial<LessonGate['counts']>,
): LessonGate => ({
  id,
  lesson_key,
  kind,
  name,
  source_id,
  config_id,
  object_sha256,
  counts: { charts: 0, images: 0, tables: 0, questions: 0, ...counts },
});

export const CHAPTER_GATES: Record<1 | 2 | 3 | 4, ChapterGate> = {
  1: {
    chapter: 1,
    package: 'iqx-ch1-lessons',
    content_version: 'ch01-v2.0',
    html_files: ['IQX-Hoc-Vien-Chuong-1-MAU-v2.0.html'],
    html_bytes: 695316,
    html_sha256: 'af4da733c6065cad6f381916395a3a2fe3cf737fa0d9bf6f8596a6f7ef5eaff0',
    script_id: 'ch1-content-data',
    payload_text_sha256: '377bd65337dfbbad2e73ae5183b8dddf0a22e32c4cc6b3b1fde7e3e8fb387354',
    payload_text_in_spec: true,
    payload_version: 'iqx-ch1-lessons-2026-10-07-v2.0',
    // Per lesson `toc` in the payload; kept per lesson, this is only the default.
    nav_labels: ['Khái niệm', 'Công thức', 'Tham số', 'Vận dụng'],
    completion: { mode: 'quiz', question_count: 8, required_correct: 8 },
    lessons: [
      lesson(
        'ch01-l01',
        'technical:rsi',
        'technical',
        'RSI',
        'rsi',
        'rsi',
        '150544b0588586e30781273fdade40ca2aea873b234034fcb9dd336a259dfade',
        { charts: 3, tables: 7, questions: 8 },
      ),
      lesson(
        'ch01-l02',
        'technical:macd',
        'technical',
        'MACD',
        'macd',
        'macd',
        'deeab26d7d200f344243b77672b84c895c5138184867108c642c7800b75fb1f4',
        { charts: 3, tables: 6, questions: 8 },
      ),
      lesson(
        'ch01-l03',
        'technical:ma',
        'technical',
        'MA / SMA',
        'ma',
        'ma',
        'b8f7ce7916dc6fad4ce65ac1c7c7a8d4fef9c86526924849e91675312c51c7c5',
        { charts: 3, tables: 6, questions: 8 },
      ),
      lesson(
        'ch01-l04',
        'technical:bollinger',
        'technical',
        'Bollinger Bands',
        'bollinger',
        'bollinger',
        '3e01340cc13a75fc5076f9935efa7699c3a1a302ddff38f45c1541d5becfce5b',
        { charts: 3, tables: 9, questions: 8 },
      ),
      lesson(
        'ch01-l05',
        'technical:volume',
        'technical',
        'Khối lượng',
        'volume',
        'volume',
        '05a62df48cd15face41db502dd242c9c174ef0fc0d6d9aad356e4c777759e066',
        { charts: 4, tables: 5, questions: 8 },
      ),
      lesson(
        'ch01-l06',
        'concept:hop_luu',
        'concept',
        'Hợp lưu',
        'hopluu',
        null,
        'fd80eb57dafac167516496cece2e729f8e50cddf3b6758b6a62372e8aab14308',
        { charts: 0, tables: 8, questions: 8 },
      ),
    ],
    object_hashes: {
      questions: '54a2a8105d42c4aedbacfcbf62a00d115a5b17a45e9955e7231a7e7cd8eb0fd0',
    },
    images: {},
    totals: { lessons: 6, sections: 24, images: 0, charts: 16, tables: 41, questions: 48 },
  },
  2: {
    chapter: 2,
    package: 'iqx-ch2-six-user-guides',
    content_version: 'ch02-v3.0',
    html_files: ['IQX-Hoc-Vien-Chuong-2-MAU-v2.0.html'],
    html_bytes: 1550487,
    html_sha256: '81e155f0eb06542c9de984c1ac9a288d0fe62415345535edb6a31c05972a24e1',
    script_id: 'ch2-content-data',
    payload_text_sha256: 'e81f539f45c0969def93835800a980c9e0a64e6cf9fd269e7a4b94bc4dd1d745',
    payload_text_in_spec: true,
    payload_version: 'iqx-ch2-six-user-guides-v3.0-academy71-shop',
    nav_labels: ['Bắt đầu', 'Thao tác', 'Đối chiếu', 'Lưu ý'],
    completion: { mode: 'manual', button_label: 'Hoàn thành bài học' },
    lessons: [
      lesson(
        'ch02-l01',
        'guide:ch02-l01',
        'guide',
        'Bắt đầu với Backtest',
        'ch02-l01',
        null,
        null,
        {
          images: 3,
          tables: 4,
        },
      ),
      lesson(
        'ch02-l02',
        'guide:ch02-l02',
        'guide',
        'Thiết lập điều kiện Mua',
        'ch02-l02',
        null,
        null,
        { images: 5, tables: 2 },
      ),
      lesson(
        'ch02-l03',
        'guide:ch02-l03',
        'guide',
        'Thiết lập điều kiện Bán',
        'ch02-l03',
        null,
        null,
        { images: 3, tables: 3 },
      ),
      lesson(
        'ch02-l04',
        'guide:ch02-l04',
        'guide',
        'Chọn giả định và chạy kiểm thử',
        'ch02-l04',
        null,
        null,
        { images: 1, tables: 4 },
      ),
      lesson(
        'ch02-l05',
        'guide:ch02-l05',
        'guide',
        'Đọc kết quả và lịch sử giao dịch',
        'ch02-l05',
        null,
        null,
        { images: 6, tables: 2 },
      ),
      lesson(
        'ch02-l06',
        'guide:ch02-l06',
        'guide',
        'Điều chỉnh, so sánh và lưu kết quả',
        'ch02-l06',
        null,
        null,
        { images: 4, tables: 2 },
      ),
    ],
    object_hashes: {},
    images: C2_IMAGES,
    totals: { lessons: 6, sections: 24, images: 22, charts: 0, tables: 17, questions: 0 },
  },
  3: {
    chapter: 3,
    package: 'iqx-ch3-fundamental-six',
    content_version: 'ch03-v2.0',
    html_files: ['IQX-Hoc-Vien-Chuong-3-MAU-v2.0.html'],
    html_bytes: 636852,
    html_sha256: '61ad365c039425c06a6f86ff74f230821ff9d1f8370b259e233d25a9093dbbc9',
    script_id: 'ch3-content-data',
    // The spec publishes no text hash for chapter 3; value pinned from the supplied file.
    payload_text_sha256: '11987b6fa2728cd2a015b5fe58d2e5d265ddb6329191e6b34ab5e24d7ca26653',
    payload_text_in_spec: false,
    payload_version: 'iqx-ch3-fundamental-six-v2.0',
    nav_labels: ['Khái niệm', 'Công thức', 'Kỳ tính', 'Vận dụng'],
    completion: { mode: 'quiz', question_count: 8, required_correct: 8 },
    lessons: [
      lesson(
        'ch03-l01',
        'fundamental:revenue_yoy',
        'fundamental',
        'Tăng trưởng doanh thu YoY',
        'ch03-l01',
        'revenue_yoy',
        'c2f08b8a23fa3361fe1c0e892e92b6b4da295effe53ff3d362e77f49d31592c1',
        { charts: 3, tables: 5, questions: 8 },
      ),
      lesson(
        'ch03-l02',
        'fundamental:profit_yoy',
        'fundamental',
        'Tăng trưởng LNST YoY',
        'ch03-l02',
        'profit_yoy',
        'c9b90dde69f2cdb2cbca30549615a9b21a537f0fa25376d70c2c7782a829759c',
        { charts: 2, tables: 5, questions: 8 },
      ),
      lesson(
        'ch03-l03',
        'fundamental:eps_yoy',
        'fundamental',
        'Tăng trưởng EPS YoY',
        'ch03-l03',
        'eps_yoy',
        '41b96cdf4e2523540a790dc6b0dffc2ec646116ec3029b27a5901afbb5a6cac8',
        { charts: 2, tables: 3, questions: 8 },
      ),
      lesson(
        'ch03-l04',
        'fundamental:gross_margin',
        'fundamental',
        'Biên lợi nhuận gộp',
        'ch03-l04',
        'gross_margin',
        '55e3581918c446535cce8765e6a3e1f2e606dc345201cb5d108509c9cae1c84a',
        { charts: 2, tables: 5, questions: 8 },
      ),
      lesson(
        'ch03-l05',
        'fundamental:net_margin',
        'fundamental',
        'Biên lợi nhuận ròng',
        'ch03-l05',
        'net_margin',
        '73a37be54cf8683ffb45583dbf4a7d8d5ce7a32e33c711afcac97331e96517aa',
        { charts: 2, tables: 2, questions: 8 },
      ),
      lesson(
        'ch03-l06',
        'fundamental:roe',
        'fundamental',
        'ROE',
        'ch03-l06',
        'roe',
        '1b343f0b1b2c9b2a3ea92cb4cf2b81d06576309db8884e7b6b83b5485d739166',
        { charts: 2, tables: 5, questions: 8 },
      ),
    ],
    object_hashes: {
      questions: 'a0f8195025f2a86a3ba7e662daab82847f67ac0436add0ad3303dcb49afab153',
      charts: '2744e12a1124145d75b3bb1e65dc92f31189a5be7f5d2dfa186ca7bff63f1f47',
      datasets: 'c362747759ae4c56eae2a9d6cf3bdbcfbbea256a768a9b6a4996605860bc39e5',
      reference_periods: 'faa28597c58da2002dee1b061b6ee73aca04af0dd285375384df2946466433bc',
    },
    images: {},
    totals: { lessons: 6, sections: 24, images: 0, charts: 13, tables: 25, questions: 48 },
  },
  4: {
    chapter: 4,
    package: 'iqx-ch4-six-filter-guides',
    content_version: 'ch04-v1.0',
    // The spec calls the file `...-MAU-v1.0.html`; the supplied bytes carry no version suffix.
    html_files: ['IQX-Hoc-Vien-Chuong-4-MAU.html', 'IQX-Hoc-Vien-Chuong-4-MAU-v1.0.html'],
    html_bytes: 2016001,
    html_sha256: '65f30d146bd77f8b22a3ee2b0b6b0a216e9b0fdd3d524fc64722ec34ce32b722',
    script_id: 'ch4-content-data',
    payload_text_sha256: 'aa086c10d35c5240104413b563459a31015a2cb448d68f5f4936b30b453dc35a',
    payload_text_in_spec: true,
    payload_version: 'iqx-ch4-six-filter-guides-v1.0-preview',
    nav_labels: ['Bắt đầu', 'Thao tác', 'Đối chiếu', 'Lưu ý'],
    completion: { mode: 'manual', button_label: 'Hoàn thành bài học' },
    lessons: [
      lesson(
        'ch04-l01',
        'guide:ch04-l01',
        'guide',
        'Bắt đầu với Bộ lọc',
        'ch04-l01',
        null,
        '5758feb18f39c6892d4c9aaa120bbaf858ef1af53185a590b3111c3c10cc3679',
        { images: 3, tables: 4 },
      ),
      lesson(
        'ch04-l02',
        'guide:ch04-l02',
        'guide',
        'Thiết lập điều kiện lọc',
        'ch04-l02',
        null,
        'c3df73241ce8eedba907c13c31ffe0895a7259cdbaf532da129686df3b6930fb',
        { images: 5, tables: 3 },
      ),
      lesson(
        'ch04-l03',
        'guide:ch04-l03',
        'guide',
        'Chọn kỳ tính cho từng chỉ tiêu',
        'ch04-l03',
        null,
        '1695ba5ab523a0afd5e88d0b91834876c6101f69c0fa5b8f7e34d1ce0c91105b',
        { images: 2, tables: 3 },
      ),
      lesson(
        'ch04-l04',
        'guide:ch04-l04',
        'guide',
        'Đọc và kiểm tra kết quả',
        'ch04-l04',
        null,
        '3aff94c893b01ff170f805ee11af85b313a55305a844ef248866560777c7fb85',
        { images: 4, tables: 2 },
      ),
      lesson(
        'ch04-l05',
        'guide:ch04-l05',
        'guide',
        'Điều chỉnh và lưu bộ lọc',
        'ch04-l05',
        null,
        '6949242d2538013d4dcf0470b111e6861a5024c8139f4a1afa4916d2286e7a2d',
        { images: 5, tables: 1 },
      ),
      lesson(
        'ch04-l06',
        'guide:ch04-l06',
        'guide',
        'Lưu và áp dụng danh mục cho Bot',
        'ch04-l06',
        null,
        'a7696afda2de859b11b22678f0c7d91371f4e55a1781a1f696238b417549ffd9',
        { images: 8, tables: 4 },
      ),
    ],
    object_hashes: {
      $: 'd7f13eab65aceffe1f54fcb88ac32279cfbc13d7d185ff3a7c7f835fa7afd61f',
      lessons: '7cded5fbc5d95a73e01ff74f52e5be74d82433edc70fcc0b2b33338236f1963f',
      reference_filter: 'c4f4b67da47f30fffdcf7df40c7393aa84437b03eb77a367673f34fe93b09fc8',
    },
    images: C4_IMAGES,
    totals: { lessons: 6, sections: 24, images: 27, charts: 0, tables: 17, questions: 0 },
  },
};

export const CHAPTERS = [1, 2, 3, 4] as const;
export type ChapterNo = (typeof CHAPTERS)[number];

/** The sixteen indicators of the approved registry (Appendix B of the Bot spec). */
export const INDICATOR_IDS = [
  'rsi',
  'macd',
  'ma',
  'bollinger',
  'volume',
  'ema',
  'ma_cross',
  'dmi',
  'stochastic',
  'cci',
  'obv',
  'mfi',
  'cmf',
  'donchian',
  'roc',
  'williams_r',
] as const;

/** Chapter 3 payload aliases -> metric ids of fundamental-registry.json. */
export const C3_METRIC_ALIASES: Record<string, string> = {
  rev: 'revenue_yoy',
  profit: 'profit_yoy',
  eps: 'eps_yoy',
  gm: 'gross_margin',
  nm: 'net_margin',
  roe: 'roe',
};

/** Image link text of the lightbox trigger button (UI chrome, not lesson text). */
export const IMAGE_LINK_TEXT = 'Phóng to ↗';
/** Tag shown on computed chart figures of chapter 1. */
export const ILLUSTRATIVE_TAG = 'Dữ liệu minh họa';

/** The 13 chart positions of chapter 3 lessons (spec 7.1), in reading order. */
export const C3_LESSON_CHART_IDS = [
  'rev-quarters',
  'rev-periods',
  'rev-growth',
  'profit-growth',
  'profit-base',
  'eps-components',
  'eps-shares',
  'gross-composition',
  'gross-four-quarters',
  'net-bridge',
  'net-margins',
  'roe-window',
  'roe-compare',
] as const;

export interface ChartWindow {
  start: number;
  end: number;
  marks: [number, string][];
}

const win = (start: number, end: number, ...marks: [number, string][]): ChartWindow => ({
  start,
  end,
  marks,
});

/**
 * Windows and A/B marks of the chapter 1 figures (design section 1, spec 5.1-5.2): the 16 lesson
 * figures and the ten chart questions, as absolute observation indexes of the source series.
 */
export const C1_CHART_WINDOWS: Record<string, ChartWindow> = {
  'concept-chart': win(117, 176),
  'period-chart': win(117, 176),
  'rsi-application': win(107, 123, [116, 'A'], [117, 'B']),
  'macd-concept': win(117, 176),
  'macd-compare': win(117, 176),
  'macd-application': win(103, 118, [114, 'A']),
  'ma-concept': win(117, 176),
  'ma-compare': win(117, 176),
  'ma-application': win(101, 114, [110, 'A']),
  'boll-concept': win(117, 176),
  'boll-compare': win(117, 176),
  'boll-application': win(15, 20, [19, 'A'], [20, 'B']),
  'volume-concept': win(117, 176),
  'volume-window': win(0, 5),
  'volume-compare': win(117, 176),
  'volume-application': win(97, 108, [103, 'A']),
  'ch01-l01-q03': win(117, 124, [119, 'A'], [124, 'B']),
  'ch01-l01-q04': win(103, 118, [115, 'B']),
  'ch01-l02-q03': win(103, 118, [114, 'A']),
  'ch01-l02-q04': win(103, 113, [107, 'A'], [110, 'B']),
  'ch01-l03-q03': win(101, 114, [110, 'A']),
  'ch01-l03-q04': win(101, 114, [110, 'A']),
  'ch01-l04-q03': win(16, 21, [20, 'A']),
  'ch01-l04-q04': win(16, 21, [20, 'A']),
  'ch01-l05-q03': win(97, 108, [103, 'A']),
  'ch01-l05-q04': win(105, 115, [110, 'A']),
};
