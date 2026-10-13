import { describe, expect, it, vi } from 'vitest';
import type { AiProviderService } from '../../src/modules/analysis/ai-provider.service.js';
import {
  ResearchAiInvalidOutputError,
  ResearchAiService,
  chunkReportText,
  targetToVnd,
} from '../../src/modules/research/research-ai.service.js';
import { RESEARCH_PROMPT_VERSIONS, researchPrompt } from '../../src/modules/research/research-prompts.js';
import type { StoredClaim, ThesisBuildInput } from '../../src/modules/research/research.types.js';

type Reply = unknown | ((system: string, user: string) => unknown);

function stub(...replies: Reply[]) {
  const queue = [...replies];
  const complete = vi.fn(async (system: string, user: string, _options?: unknown) => {
    const next = queue.shift();
    const body = typeof next === 'function' ? (next as (s: string, u: string) => unknown)(system, user) : next;
    return {
      content: typeof body === 'string' ? body : JSON.stringify(body),
      model: 'test',
      usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
    };
  });
  return { service: new ResearchAiService({ complete } as unknown as AiProviderService), complete };
}

const report = { symbol: 'HPG', broker: 'SSI', reportDate: '2026-10-01', title: 'HPG', language: 'vi' as const };

const rawClaim = (over: Record<string, unknown> = {}) => ({
  subject: 'Dung Quất 2',
  driver: 'Công suất HRC mới',
  mechanism: 'Tăng sản lượng thép',
  outcome: 'Doanh thu tăng',
  direction: 'positive',
  time_horizon: '2027',
  claim_type: 'growth_driver',
  summary: 'Dự kiến công suất HRC mới đóng góp từ 2027.',
  numbers: [{ metric: 'Sản lượng', value: 5.6, unit: 'triệu tấn', period: '2027' }],
  source_page: 3,
  ...over,
});

describe('chunkReportText', () => {
  const pages = (n: number, size: number) =>
    Array.from({ length: n }, (_, i) => `[[page ${i + 1}]]\n${'x'.repeat(size)}\n`).join('');

  it('keeps small text in one chunk', () => {
    expect(chunkReportText(pages(3, 100))).toHaveLength(1);
    expect(chunkReportText('   ')).toEqual([]);
  });

  it('cuts at page boundaries within the character budget', () => {
    const chunks = chunkReportText(pages(10, 1_000), 3_500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(3_500);
      expect(chunk.startsWith('[[page ')).toBe(true);
    }
    expect(chunks.join('')).toBe(pages(10, 1_000).trim());
  });

  it('keeps at most the first 6 chunks and splits an oversized page', () => {
    const chunks = chunkReportText(pages(40, 1_000), 2_500);
    expect(chunks).toHaveLength(6);
    expect(chunks[0]).toContain('[[page 1]]');
    const huge = chunkReportText(`[[page 1]]\n${'y\n'.repeat(5_000)}`, 3_000);
    expect(huge.length).toBeGreaterThan(1);
    expect(huge.every((c) => c.length <= 3_000)).toBe(true);
  });
});

describe('targetToVnd', () => {
  it('converts by explicit unit', () => {
    expect(targetToVnd(68, 'nghìn đồng')).toBe(68_000);
    expect(targetToVnd(68_000, 'VND')).toBe(68_000);
    expect(targetToVnd('68,000', 'đồng')).toBe(68_000);
    expect(targetToVnd(68.5, 'nghìn đồng')).toBe(68_500);
  });
  it('rejects missing/unknown units and non-positive values', () => {
    expect(targetToVnd(68, null)).toBeNull();
    expect(targetToVnd(68, 'USD')).toBeNull();
    expect(targetToVnd(0, 'VND')).toBeNull();
    expect(targetToVnd('abc', 'VND')).toBeNull();
  });
});

describe('ResearchAiService.extractClaims', () => {
  it('maps valid claims, drops invalid ones and converts the target to VND', async () => {
    const { service, complete } = stub({
      claims: [
        rawClaim(),
        rawClaim({ claim_type: 'not_a_type', summary: 'bad type' }),
        rawClaim({ direction: 'bullish', summary: 'bad direction' }),
        rawClaim({ summary: '', driver: 'x' }),
        rawClaim({ numbers: [{ metric: 'LNST', value: '12' }], summary: 'bad number' }),
        rawClaim({ summary: '  dự kiến công suất hrc mới đóng góp từ 2027.  ' }),
        rawClaim({ summary: 'Ý khác', source_page: null, numbers: undefined }),
      ],
      target: { target_price: 68, unit: 'nghìn đồng', horizon: '12 tháng' },
    });
    const { result, usage } = await service.extractClaims(report, '[[page 1]]\nnội dung');
    expect(result.claims.map((c) => c.summary)).toEqual(['Dự kiến công suất HRC mới đóng góp từ 2027.', 'Ý khác']);
    expect(result.claims[0]).toMatchObject({
      claimType: 'growth_driver',
      timeHorizon: '2027',
      sourcePage: 3,
      numbers: [{ metric: 'Sản lượng', value: 5.6, unit: 'triệu tấn', period: '2027' }],
    });
    expect(result.claims[1]).toMatchObject({ sourcePage: null, numbers: [] });
    expect(result.target).toEqual({ targetPriceVnd: 68_000, horizon: '12 tháng' });
    expect(usage).toEqual({ calls: 1, promptTokens: 100, completionTokens: 10 });
    expect(complete.mock.calls[0]![2]).toMatchObject({ temperature: 0.1, maxTokens: 8000, json: true });
    expect(complete.mock.calls[0]![0]).toContain('nguyên tử');
  });

  it('target in plain VND, null target and unusable unit', async () => {
    const a = await stub({ claims: [], target: { target_price: '68,000', unit: 'VND', horizon: null } }).service.extractClaims(report, 'x');
    expect(a.result.target).toEqual({ targetPriceVnd: 68_000, horizon: null });
    const b = await stub({ claims: [], target: null }).service.extractClaims(report, 'x');
    expect(b.result.target).toBeNull();
    const c = await stub({ claims: [], target: { target_price: 68, unit: 'USD' } }).service.extractClaims(report, 'x');
    expect(c.result.target).toBeNull();
  });

  it('one call per chunk, merges and dedupes, keeps the first target, sums usage, caps at 12', async () => {
    const page = (n: number) => `[[page ${n}]]\n${'z'.repeat(50_000)}\n`;
    const text = page(1) + page(2) + page(3);
    const many = Array.from({ length: 20 }, (_, i) => rawClaim({ summary: `ý ${i}` }));
    const { service, complete } = stub(
      { claims: many.slice(0, 15), target: { target_price: 68, unit: 'nghìn đồng' } },
      { claims: [...many.slice(10), rawClaim({ summary: 'thêm 1' })], target: { target_price: 99, unit: 'nghìn đồng' } },
      { claims: Array.from({ length: 10 }, (_, i) => rawClaim({ summary: `cuối ${i}` })) },
    );
    const { result, usage } = await service.extractClaims(report, text);
    expect(complete).toHaveBeenCalledTimes(3);
    expect(usage).toEqual({ calls: 3, promptTokens: 300, completionTokens: 30 });
    expect(result.claims).toHaveLength(12);
    expect(new Set(result.claims.map((c) => c.summary)).size).toBe(12);
    expect(result.target?.targetPriceVnd).toBe(68_000);
    expect(complete.mock.calls[1]![1]).toContain('"doan":"2/3"');
  });

  it('empty text makes no call', async () => {
    const { service, complete } = stub();
    const { result, usage } = await service.extractClaims(report, '  ');
    expect(result).toEqual({ claims: [], target: null });
    expect(usage.calls).toBe(0);
    expect(complete).not.toHaveBeenCalled();
  });

  it('rejects a whole invalid response', async () => {
    await expect(stub('not json at all').service.extractClaims(report, 'x')).rejects.toMatchObject({
      message: 'RESEARCH_AI_INVALID_OUTPUT',
    });
    await expect(stub({ foo: 1 }).service.extractClaims(report, 'x')).rejects.toBeInstanceOf(ResearchAiInvalidOutputError);
    // fenced JSON is tolerated
    const ok = await stub('```json\n{"claims":[]}\n```').service.extractClaims(report, 'x');
    expect(ok.result.claims).toEqual([]);
  });
});

const stored = (id: string, over: Partial<StoredClaim> = {}): StoredClaim => ({
  id,
  reportId: `r-${id}`,
  symbol: 'HPG',
  broker: 'SSI',
  evidenceDate: '2026-10-01',
  status: 'active',
  subject: 'DQ2',
  driver: 'Công suất HRC mới',
  mechanism: 'Tăng sản lượng',
  outcome: 'Doanh thu tăng',
  direction: 'positive',
  timeHorizon: '2027',
  claimType: 'growth_driver',
  summary: `claim ${id}`,
  numbers: [],
  sourcePage: 1,
  ...over,
});
const thesis = {
  id: 'T1',
  canonicalDriver: 'Công suất HRC mới',
  canonicalMechanism: 'Tăng sản lượng',
  canonicalOutcome: 'Doanh thu tăng',
  direction: 'positive' as const,
  currentSummary: null,
};
const verdict = (driver: boolean, mechanism: boolean, direction: boolean) => ({ driver, mechanism, direction, reason: 'r' });
const item = (claimId: string, relationship: string, extra: Record<string, unknown> = {}) => ({
  claim_id: claimId,
  relationship,
  thesis_id: null,
  new_thesis_key: null,
  invalidates_thesis: false,
  match: verdict(true, true, true),
  ...extra,
});
const draft = (key: string) => ({
  key,
  canonical_driver: 'Dự án A',
  canonical_mechanism: 'Tăng nhu cầu vốn',
  canonical_outcome: 'Áp lực tài chính',
  direction: 'negative',
  is_risk: true,
});

describe('ResearchAiService.matchClaims', () => {
  it('attaches to existing theses and groups new ones by key', async () => {
    const { service, complete } = stub({
      matches: [
        item('c1', 'SUPPORT', { thesis_id: 'T1' }),
        item('c2', 'UPDATE', { thesis_id: 'T1' }),
        item('c3', 'NEW_THESIS', { new_thesis_key: 'n1', match: verdict(false, false, true) }),
        item('c4', 'NEW_THESIS', { new_thesis_key: 'n1', match: verdict(false, false, true) }),
        item('c5', 'IRRELEVANT', { match: verdict(false, false, false) }),
      ],
      new_theses: [draft('n1')],
      disagreements: [],
    });
    const claims = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => stored(id));
    const { result, usage } = await service.matchClaims('HPG', [thesis], claims);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(usage.calls).toBe(1);
    expect(result.matches.map((m) => [m.claimId, m.relationship, m.thesisId])).toEqual([
      ['c1', 'SUPPORT', 'T1'],
      ['c2', 'UPDATE', 'T1'],
      ['c3', 'NEW_THESIS', null],
      ['c4', 'NEW_THESIS', null],
      ['c5', 'IRRELEVANT', null],
    ]);
    expect(result.matches[2]!.newThesisKey).toBeTruthy();
    expect(result.matches[2]!.newThesisKey).toBe(result.matches[3]!.newThesisKey);
    expect(result.newTheses).toEqual([
      expect.objectContaining({ key: result.matches[2]!.newThesisKey, canonicalDriver: 'Dự án A', isRisk: true }),
    ]);
  });

  it('turns an attachment missing driver, mechanism or direction into its own NEW_THESIS', async () => {
    const { service } = stub({
      matches: [
        item('c1', 'SUPPORT', { thesis_id: 'T1', match: verdict(true, false, true) }),
        item('c2', 'UPDATE', { thesis_id: 'T1', match: verdict(true, true, false) }),
        item('c3', 'SUPPORT', { thesis_id: 'T1', match: verdict(false, true, true) }),
        item('c4', 'SUPPORT', { thesis_id: 'T1' }),
      ],
    });
    const claims = ['c1', 'c2', 'c3', 'c4'].map((id) => stored(id, { claimType: id === 'c3' ? 'financial_risk' : 'growth_driver' }));
    const { result } = await service.matchClaims('HPG', [thesis], claims);
    const [m1, m2, m3, m4] = result.matches;
    for (const m of [m1!, m2!, m3!]) {
      expect(m.relationship).toBe('NEW_THESIS');
      expect(m.thesisId).toBeNull();
      expect(m.newThesisKey).toBeTruthy();
    }
    expect(new Set([m1!.newThesisKey, m2!.newThesisKey, m3!.newThesisKey]).size).toBe(3);
    expect(m4).toMatchObject({ relationship: 'SUPPORT', thesisId: 'T1' });
    expect(result.newTheses).toHaveLength(3);
    expect(result.newTheses.find((t) => t.key === m3!.newThesisKey)).toMatchObject({ isRisk: true, canonicalDriver: 'Công suất HRC mới' });
  });

  it('CONTRADICT/REPLACE need driver and mechanism, and only REPLACE can invalidate', async () => {
    const { service } = stub({
      matches: [
        item('c1', 'REPLACE', { thesis_id: 'T1', invalidates_thesis: true, match: verdict(true, true, false) }),
        item('c2', 'CONTRADICT', { thesis_id: 'T1', invalidates_thesis: true, match: verdict(true, true, false) }),
        item('c3', 'REPLACE', { thesis_id: 'T1', invalidates_thesis: true, match: verdict(true, false, false) }),
      ],
    });
    const { result } = await service.matchClaims('HPG', [thesis], ['c1', 'c2', 'c3'].map((id) => stored(id)));
    expect(result.matches[0]).toMatchObject({ relationship: 'REPLACE', thesisId: 'T1', invalidatesThesis: true });
    expect(result.matches[1]).toMatchObject({ relationship: 'CONTRADICT', invalidatesThesis: false });
    expect(result.matches[2]).toMatchObject({ relationship: 'NEW_THESIS', thesisId: null });
  });

  it('unknown thesis ids, missing/duplicate/unknown entries and bad entries become NEW_THESIS singletons', async () => {
    const { service } = stub({
      matches: [
        item('c1', 'SUPPORT', { thesis_id: 'GHOST' }),
        item('c2', 'NEW_THESIS', { new_thesis_key: 'nope' }), // no draft
        item('zzz', 'SUPPORT', { thesis_id: 'T1' }), // not an input claim
        item('c4', 'SUPPORT', { thesis_id: 'T1' }),
        item('c4', 'IRRELEVANT'), // duplicate ignored
        { claim_id: 'c5', relationship: 'MAYBE' }, // schema failure
        // c3 and c5 missing
      ],
    });
    const claims = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => stored(id));
    const { result } = await service.matchClaims('HPG', [thesis], claims);
    expect(result.matches.map((m) => m.claimId)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    expect(result.matches.map((m) => m.relationship)).toEqual(['NEW_THESIS', 'NEW_THESIS', 'NEW_THESIS', 'SUPPORT', 'NEW_THESIS']);
    const keys = result.matches.filter((m) => m.relationship === 'NEW_THESIS').map((m) => m.newThesisKey);
    expect(new Set(keys).size).toBe(4);
    expect(result.newTheses.map((t) => t.key).sort()).toEqual([...(keys as string[])].sort());
  });

  it('keeps disagreements on known refs with >= 2 distinct values and remaps new keys', async () => {
    const { service } = stub({
      matches: [
        item('c1', 'NEW_THESIS', { new_thesis_key: 'n1' }),
        item('c2', 'NEW_THESIS', { new_thesis_key: 'n1' }),
        item('c3', 'SUPPORT', { thesis_id: 'T1' }),
      ],
      new_theses: [draft('n1')],
      disagreements: [
        { thesis_ref: 'n1', dimension: 'timeline', note: 'khác mốc', values: [{ broker: 'SSI', value: 'Q4/2026' }, { broker: 'MBS', value: 'H2/2027' }] },
        { thesis_ref: 'T1', dimension: 'weird', note: '', values: [{ broker: 'SSI', value: 'Q4/2026' }, { broker: 'MBS', value: 'q4/2026' }] },
        { thesis_ref: 'GHOST', dimension: 'size', note: '', values: [{ broker: 'SSI', value: '1' }, { broker: 'MBS', value: '2' }] },
        { thesis_ref: 'T1', dimension: 'weird', note: 'n', values: [{ broker: 'SSI', value: 5 }, { broker: 'MBS', value: 7 }] },
      ],
    });
    const { result } = await service.matchClaims('HPG', [thesis], ['c1', 'c2', 'c3'].map((id) => stored(id)));
    const newKey = result.matches[0]!.newThesisKey;
    expect(result.disagreements).toEqual([
      expect.objectContaining({ thesisRef: newKey, disagreement: expect.objectContaining({ dimension: 'timeline' }) }),
      expect.objectContaining({
        thesisRef: 'T1',
        disagreement: { dimension: 'other', note: 'n', values: [{ broker: 'SSI', value: '5' }, { broker: 'MBS', value: '7' }] },
      }),
    ]);
  });

  it('batches by 12, feeds new theses forward and sums usage', async () => {
    const claims = Array.from({ length: 15 }, (_, i) => stored(`c${i}`));
    const { service, complete } = stub(
      {
        matches: claims.slice(0, 12).map((c) => item(c.id, 'NEW_THESIS', { new_thesis_key: 'n1' })),
        new_theses: [draft('n1')],
      },
      (_s: string, user: string) => {
        const payload = JSON.parse(user) as { theses: { id: string }[]; claims: { id: string }[] };
        const fed = payload.theses.find((t) => t.id !== 'T1')!;
        expect(payload.claims).toHaveLength(3);
        return {
          matches: payload.claims.map((c) => item(c.id, 'SUPPORT', { thesis_id: fed.id })),
        };
      },
    );
    const { result, usage } = await service.matchClaims('HPG', [thesis], claims);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(usage).toEqual({ calls: 2, promptTokens: 200, completionTokens: 20 });
    expect(result.matches).toHaveLength(15);
    expect(result.newTheses).toHaveLength(1);
    const key = result.newTheses[0]!.key;
    expect(result.matches.every((m) => m.relationship === 'NEW_THESIS' && m.newThesisKey === key)).toBe(true);
  });

  it('rejects an invalid envelope and skips the call for no claims', async () => {
    await expect(stub({ matches: 'x' }).service.matchClaims('HPG', [thesis], [stored('c1')])).rejects.toMatchObject({
      message: 'RESEARCH_AI_INVALID_OUTPUT',
    });
    const { service, complete } = stub();
    expect((await service.matchClaims('HPG', [thesis], [])).result.matches).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });
});

const buildInput = (over: Partial<ThesisBuildInput> = {}): ThesisBuildInput => ({
  thesisId: 'T1',
  canonicalDriver: 'Dự án A',
  canonicalMechanism: 'Tăng doanh thu',
  canonicalOutcome: 'Lợi nhuận tăng',
  direction: 'positive',
  isRisk: false,
  disagreement: {
    dimension: 'timeline',
    note: 'SSI nói H1/2027',
    values: [{ broker: 'SSI', value: 'H1/2027' }, { broker: 'Vietcap', value: 'Q4/2026' }],
  },
  previousTitle: null,
  previousSummary: null,
  evidence: [
    {
      brokerRef: 'B1',
      evidenceDate: '2026-10-01',
      claim: {
        subject: 'Dự án A',
        driver: 'Bàn giao',
        mechanism: 'Ghi nhận doanh thu',
        outcome: 'LN tăng',
        direction: 'positive',
        timeHorizon: 'Q4/2026',
        claimType: 'earnings_driver',
        summary: 'Dự kiến bàn giao Q4/2026.',
        numbers: [],
        sourcePage: 2,
      },
    },
  ],
  ...over,
});

describe('ResearchAiService.buildTheses', () => {
  it('returns valid theses, clamps materiality, drops invalid and duplicate items', async () => {
    const { service, complete } = stub({
      theses: [
        { thesis_id: 'T1', title: 'Dự án A bàn giao kỳ vọng', summary: 'Dự kiến đóng góp.', materiality: 7 },
        { thesis_id: 'T1', title: 'Trùng', summary: 'Trùng', materiality: 2 },
        { thesis_id: 'T2', title: '', summary: 'x', materiality: 3 },
        { thesis_id: 'T3', title: 'Có', summary: 'Có', materiality: 'cao' },
        { thesis_id: 'T4', title: 'Lạ', summary: 'Lạ', materiality: 2.4 },
      ],
    });
    const { result, usage } = await service.buildTheses('VIC', [buildInput()]);
    expect(result).toEqual([
      { thesisId: 'T1', title: 'Dự án A bàn giao kỳ vọng', summary: 'Dự kiến đóng góp.', materiality: 5 },
      { thesisId: 'T4', title: 'Lạ', summary: 'Lạ', materiality: 2 },
    ]);
    expect(usage).toEqual({ calls: 1, promptTokens: 100, completionTokens: 10 });
    expect(complete.mock.calls[0]![2]).toMatchObject({ temperature: 0.1, maxTokens: 3000, json: true });
    const user = complete.mock.calls[0]![1] as string;
    expect(user).not.toContain('Lý do bị từ chối');
    expect(user).not.toMatch(/SSI|Vietcap/);
    expect(user).toContain('"source":"B1"');
  });

  it('puts previous rejection reasons in the prompt', async () => {
    const { service, complete } = stub({ theses: [] });
    await service.buildTheses('VIC', [buildInput()], [
      { thesisId: 'T1', code: 'untraceable_number', detail: 'số 15% không có trong evidence' },
    ]);
    const user = complete.mock.calls[0]![1] as string;
    expect(user).toContain('Lý do bị từ chối lần trước');
    expect(user).toContain('T1');
    expect(user).toContain('untraceable_number');
    expect(user).toContain('số 15% không có trong evidence');
  });

  it('rejects an invalid envelope; no inputs means no call', async () => {
    await expect(stub({ result: [] }).service.buildTheses('VIC', [buildInput()])).rejects.toBeInstanceOf(ResearchAiInvalidOutputError);
    const { service, complete } = stub();
    expect((await service.buildTheses('VIC', [])).result).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });
});

describe('research prompts', () => {
  it('load with versions and avoid mockup content', () => {
    for (const kind of ['extract', 'match', 'build'] as const) {
      const prompt = researchPrompt(kind);
      expect(prompt.version).toBe(RESEARCH_PROMPT_VERSIONS[kind]);
      expect(prompt.version).toMatch(/^research-(extract|match|build)-v1\.0\.0$/);
      expect(prompt.text.length).toBeGreaterThan(500);
      expect(prompt.text).not.toMatch(/VCB/);
    }
  });
});
