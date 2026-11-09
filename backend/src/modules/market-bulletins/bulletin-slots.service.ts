import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { criteriaHash } from '../saved-filters/saved-results.service.js';
import type { ScreenerRow } from '../screener/screener.schemas.js';
import { DailyBarsService } from '../market-integration/daily-bars.service.js';
import { recordAudit, type AuditContext } from '../users/audit.js';
import {
  MAX_PICKS_PER_SLOT,
  MINI_CHART_SESSIONS,
  MINI_CHART_WARMUP,
  type SlotNumber,
} from './bulletin.constants.js';
import { dm, dmy } from './bulletin.format.js';
import { BulletinRepository } from './bulletin.repository.js';
import type { PushSlotBody } from './bulletin.schemas.js';
import type { MiniChartData, SlotPick, SlotSnapshot } from './bulletin.types.js';
import { MarketBulletinsService } from './bulletins.service.js';

type RunRow = {
  id: string;
  definition: unknown;
  session_date: string | null;
  results: ScreenerRow[];
};

type VersionRow = { definition: unknown; name: string };

const unprocessable = (code: string, message: string, details?: unknown) =>
  new UnprocessableEntityException({
    code,
    message,
    ...(details === undefined ? {} : { details }),
  });

/**
 * Nút "Đẩy vào bản tin" của Bộ lọc (spec §4, §6): server kiểm toàn bộ điều kiện đẩy rồi lưu bản chụp của ô.
 * Mã và số liệu luôn lấy từ kết quả lọc giữ trên server và kho nến, không tin danh sách từ trình duyệt.
 */
@Injectable()
export class BulletinSlotsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: BulletinRepository,
    private readonly bulletins: MarketBulletinsService,
    private readonly dailyBars: DailyBarsService,
  ) {}

  async push(
    user: AuthenticatedUser,
    date: string,
    slot: SlotNumber,
    body: PushSlotBody,
    audit: AuditContext,
    now = new Date(),
  ): Promise<{
    slot: SlotNumber;
    trade_date: string;
    picks: number;
    passed_count: number;
    pushed_at: string;
  }> {
    if (user.role !== 'admin')
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Chỉ quản trị viên được đẩy vào bản tin.',
      });

    // §4.2 #1-#3: kết quả phải là của đúng phiên bản đã lưu của bộ lọc.
    const [run] = await this.database.query<RunRow>(
      `select id, definition, session_date, results from screener_runs where id = $1::uuid and user_id = $2::uuid`,
      [body.result_id, user.id],
    );
    if (!run)
      throw new NotFoundException({
        code: 'SCREENER_RESULT_NOT_FOUND',
        message: 'Không tìm thấy kết quả lọc (có thể đã hết hạn lưu); hãy chạy lại bộ lọc.',
      });
    const [version] = await this.database.query<VersionRow>(
      `select fv.definition, f.name
         from filter_versions fv
         join strategy_filters f on f.id = fv.filter_id
        where fv.filter_id = $1::uuid and fv.version = $2 and f.user_id = $3::uuid and f.deleted_at is null`,
      [body.filter_id, body.filter_version, user.id],
    );
    if (!version)
      throw unprocessable(
        'FILTER_NOT_SAVED',
        'Lưu bộ lọc trước khi đẩy vào bản tin. Bản tin dùng bộ lọc đã lưu để ghi nguồn.',
      );
    if (criteriaHash(run.definition) !== criteriaHash(version.definition))
      throw unprocessable(
        'RESULT_NOT_OF_SAVED_VERSION',
        'Điều kiện đã đổi so với phiên bản đã lưu hoặc so với lần chạy. Bấm Lưu bộ lọc, chạy lại rồi đẩy.',
      );

    // §4.2 #4: phiên của kết quả là phiên của bản tin đang chờ (phiên mới nhất đã chốt).
    const sessionDate = run.session_date ? String(run.session_date).slice(0, 10) : null;
    if (sessionDate !== date)
      throw unprocessable(
        'SESSION_MISMATCH',
        `Kết quả là của phiên ${sessionDate ? dm(sessionDate) : '—'}, khác phiên bản tin ${dm(date)}. Chạy lại bộ lọc.`,
      );
    const pending = await this.bulletins.pushContext();
    if (pending.trade_date !== date) {
      const latestSession = (await this.dailyBars.resolveSession(now))?.session ?? null;
      if (latestSession !== date)
        throw unprocessable(
          'SESSION_MISMATCH',
          `Kết quả là của phiên ${dm(date)}, khác phiên bản tin ${pending.trade_date ? dm(pending.trade_date) : '—'}. Chạy lại bộ lọc.`,
        );
    }

    // §6: picks thuộc mã đạt của kết quả, tối đa 10, không rỗng khi có mã đạt.
    const rows = Array.isArray(run.results) ? run.results : [];
    const passed = rows.filter((row) => row.passed);
    const passedSymbols = new Set(passed.map((row) => row.symbol));
    const picks = [...new Set(body.picks.map((symbol) => symbol.toUpperCase()))];
    if (picks.length > MAX_PICKS_PER_SLOT)
      throw unprocessable('TOO_MANY_PICKS', `Chọn tối đa ${MAX_PICKS_PER_SLOT} mã cho mỗi bộ lọc.`);
    const outside = picks.filter((symbol) => !passedSymbols.has(symbol));
    if (outside.length)
      throw unprocessable(
        'PICKS_NOT_IN_RESULT',
        'Có mã không thuộc các mã đạt của kết quả.',
        outside,
      );
    if (passed.length > 0 && picks.length === 0)
      throw unprocessable('PICKS_EMPTY', 'Kết quả có mã đạt nên cần chọn ít nhất một mã.');
    if (passed.length === 0 && picks.length > 0)
      throw unprocessable('PICKS_NOT_IN_RESULT', 'Kết quả không có mã đạt nên không chọn mã nào.');

    const { picks: pickRows, chart } = await this.snapshotPicks(picks, date);
    const snapshot: SlotSnapshot = {
      slot,
      trade_date: date,
      display_name: body.display_name.trim(),
      filter_id: body.filter_id,
      filter_name: version.name,
      filter_version: body.filter_version,
      result_id: body.result_id,
      conditions: body.conditions,
      passed_count: passed.length,
      picks: pickRows,
      chart,
      pushed_by: user.id,
      pushed_at: now.toISOString(),
    };

    await this.database.transaction(async (tx) => {
      await this.repository.ensureDraft(tx, date);
      const bulletin = await this.repository.find(tx, date, true);
      if (!bulletin)
        throw new NotFoundException({
          code: 'BULLETIN_NOT_FOUND',
          message: `Không có bản tin phiên ${dmy(date)}.`,
        });
      // §4.2 #5 và §3.6: danh sách mã khoá từ lần Public đầu tới khi gỡ.
      if (bulletin.slots_locked)
        throw new ConflictException({
          code: 'BULLETIN_LOCKED',
          message: `Bản tin phiên ${dmy(date)} đã Public, danh sách mã đã khoá.`,
        });
      await this.repository.upsertSlot(tx, snapshot, {
        at: snapshot.pushed_at,
        by: user.id,
        result_id: snapshot.result_id,
        filter_version: snapshot.filter_version,
        picks: pickRows.map((pick) => pick.symbol),
      });
      await recordAudit(tx, audit, {
        action: 'bulletin.slot.push',
        targetEntity: 'market_bulletin',
        targetId: date,
        after: {
          slot,
          filter_id: body.filter_id,
          filter_version: body.filter_version,
          result_id: body.result_id,
          passed_count: passed.length,
          picks: pickRows.map((pick) => pick.symbol),
        },
        note: `Đẩy ${pickRows.length} mã vào Bộ lọc ${slot} của bản tin phiên ${dmy(date)}`,
      });
    });
    await this.bulletins.refreshChecks(this.database, date);
    return {
      slot,
      trade_date: date,
      picks: pickRows.length,
      passed_count: passed.length,
      pushed_at: snapshot.pushed_at,
    };
  }

  /** Giá đóng cửa, ±% và GTGD của từng mã tại phiên T từ kho nến, xếp theo GTGD giảm dần, cùng biểu đồ của mã đầu. */
  private async snapshotPicks(
    symbols: readonly string[],
    date: string,
  ): Promise<{ picks: SlotPick[]; chart: MiniChartData | null }> {
    if (!symbols.length) return { picks: [], chart: null };
    const columns = await this.dailyBars.loadColumns(symbols);
    const picks: Array<SlotPick & { index: number }> = [];
    for (const symbol of symbols) {
      const series = columns.get(symbol);
      const index = series ? series.d.indexOf(date) : -1;
      if (!series || index < 0 || !(series.v[index]! > 0))
        throw unprocessable('NO_SESSION_DATA', `Mã ${symbol} chưa có dữ liệu phiên ${dmy(date)}.`);
      const close = series.c[index]!;
      const previous = index > 0 ? series.c[index - 1]! : null;
      picks.push({
        symbol,
        close,
        change_pct: previous && previous > 0 ? (close / previous - 1) * 100 : null,
        value_bn: (close * series.v[index]!) / 1e6,
        index,
      });
    }
    picks.sort(
      (a, b) => (b.value_bn ?? -1) - (a.value_bn ?? -1) || a.symbol.localeCompare(b.symbol),
    );
    const top = picks[0]!;
    const series = columns.get(top.symbol)!;
    const end = top.index + 1;
    const start = Math.max(0, end - (MINI_CHART_SESSIONS + MINI_CHART_WARMUP));
    const chart: MiniChartData = {
      symbol: top.symbol,
      d: series.d.slice(start, end),
      o: series.o.slice(start, end),
      h: series.h.slice(start, end),
      l: series.l.slice(start, end),
      c: series.c.slice(start, end),
      v: series.v.slice(start, end),
    };
    return {
      picks: picks.map((pick) => ({
        symbol: pick.symbol,
        close: pick.close,
        change_pct: pick.change_pct,
        value_bn: pick.value_bn,
      })),
      chart,
    };
  }
}
