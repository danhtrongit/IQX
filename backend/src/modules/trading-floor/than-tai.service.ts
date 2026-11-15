/**
 * Thần Tài v2: lượt khấn hằng ngày (gieo quẻ → dự đoán VNINDEX → cầu mã → kết quả cả sàn) cho tài khoản
 * hoặc khách, và quản trị thư viện quẻ. Giờ do server quyết định (`FLOOR_CLOCK`); mọi bước ghi bị từ chối
 * sau 11:30 giờ Việt Nam. Mỗi bước ghi bằng UPDATE có điều kiện nên bấm đúp hay gọi song song chỉ ghi một lần.
 */

import { randomInt } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import { recordAudit, type AuditContext } from '../users/audit.js';
import type { FloorActor } from './floor-actor.js';
import { FLOOR_CLOCK, type FloorClock } from './floor-clock.js';
import { FLOOR_MARKET, type FloorMarketPort } from './floor-market.js';
import {
  THAN_TAI_REPOSITORY,
  type AdminHanh,
  type AdminLa,
  type AdminQue,
  type HanhPatch,
  type LaPatch,
  type QuePatch,
  type ThanTaiRepository,
} from './than-tai.repository.js';
import {
  THAN_TAI_RULES,
  buildDay,
  deadlineOf,
  drawHang,
  isBeforeDeadline,
  normaliseTickers,
  pickLa,
  statusOf,
  stepOf,
  unlistedTickers,
  vnDay,
  vnindexReference,
  type Direction,
  type Hanh,
  type HanhConfig,
  type Rng,
  type ThanTaiResults,
  type ThanTaiToday,
} from './than-tai.logic.js';

export const THAN_TAI_RNG = Symbol('THAN_TAI_RNG');

const secureRng: Rng = () => randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;

const hetGio = (): ConflictException =>
  new ConflictException({
    code: 'HET_GIO',
    message: 'Đã qua 11:30, không khấn tiếp được.',
  });

const conflict = (code: string, message: string): ConflictException =>
  new ConflictException({ code, message });

@Injectable()
export class ThanTaiService {
  private readonly rng: Rng;

  constructor(
    private readonly database: DatabaseService,
    @Inject(THAN_TAI_REPOSITORY) private readonly repository: ThanTaiRepository,
    @Inject(FLOOR_MARKET) private readonly market: FloorMarketPort,
    @Inject(FLOOR_CLOCK) private readonly clock: FloorClock,
    @Optional() @Inject(THAN_TAI_RNG) rng?: Rng,
  ) {
    this.rng = rng ?? secureRng;
  }

  /** Trạng thái hôm nay: bước còn dở, các phần đã chốt, dòng ngày và lá đã gieo. */
  async today(actor: FloorActor): Promise<ThanTaiToday> {
    return this.view(actor, this.clock.now().getTime());
  }

  /** Bước 1: gieo quẻ. Một lá mỗi người và ngày; gọi lại (kể cả song song) trả đúng lá đã gieo. */
  async draw(actor: FloorActor): Promise<ThanTaiToday> {
    const now = this.clock.now();
    const nowMs = now.getTime();
    if (!isBeforeDeadline(nowMs)) throw hetGio();
    const ngay = vnDay(nowMs);
    const existing = await this.repository.findKhan(this.database, actor.key, ngay);
    if (!existing) {
      await this.database.transaction(async (tx) => {
        const byHang = await this.repository.activeLaByHang(tx);
        const hang = drawHang([...byHang.keys()], this.rng);
        const candidates = hang ? byHang.get(hang) : undefined;
        if (!hang || !candidates) {
          throw new ServiceUnavailableException({
            code: 'THU_VIEN_TRONG',
            message: 'Thư viện quẻ chưa có lá nào đang bật.',
          });
        }
        const seen = await this.repository.seenIds(tx, actor.key);
        const picked = pickLa(candidates, seen, this.rng)!;
        const inserted = await this.repository.insertKhan(tx, {
          actorKey: actor.key,
          ngay,
          laId: picked.laId,
          hang,
          at: now,
        });
        // Thua cuộc đua: lượt của request kia đã ghi, không đụng tới vòng không lặp.
        if (!inserted) return;
        if (picked.resetSeen) await this.repository.clearSeen(tx, actor.key, hang);
        await this.repository.markSeen(tx, actor.key, hang, picked.laId);
      });
    }
    return this.view(actor, nowMs);
  }

  /** Bước 2: dự đoán hướng VNINDEX hôm nay, chốt một lần. */
  async predict(actor: FloorActor, direction: Direction): Promise<ThanTaiToday> {
    const now = this.clock.now();
    const nowMs = now.getTime();
    if (!isBeforeDeadline(nowMs)) throw hetGio();
    const ngay = vnDay(nowMs);
    const row = await this.repository.findKhan(this.database, actor.key, ngay);
    if (!row) throw conflict('CHUA_GIEO_QUE', 'Hãy gieo quẻ trước khi dự đoán.');
    if (row.duDoan) throw conflict('DA_DU_DOAN', 'Bạn đã chốt dự đoán hôm nay.');
    const done = await this.repository.setPrediction(this.database, {
      actorKey: actor.key,
      ngay,
      direction,
      at: now,
    });
    if (!done) throw conflict('DA_DU_DOAN', 'Bạn đã chốt dự đoán hôm nay.');
    return this.view(actor, nowMs);
  }

  /** Bước 3: cầu 0–3 mã (mảng rỗng là bỏ qua), chốt một lần. */
  async cau(actor: FloorActor, input: readonly string[]): Promise<ThanTaiToday> {
    const now = this.clock.now();
    const nowMs = now.getTime();
    if (!isBeforeDeadline(nowMs)) throw hetGio();
    const checked = normaliseTickers(input);
    if (!checked.ok) {
      throw new UnprocessableEntityException({
        code: checked.code,
        message:
          checked.code === 'QUA_3_MA'
            ? `Chỉ được cầu tối đa ${THAN_TAI_RULES.maxTickers} mã.`
            : 'Mã cầu phải là 3 ký tự chữ hoặc số và không trùng nhau.',
      });
    }
    const ngay = vnDay(nowMs);
    const row = await this.repository.findKhan(this.database, actor.key, ngay);
    if (!row || row.duDoan === null) {
      throw conflict('CHUA_DU_DOAN', 'Hãy dự đoán VNINDEX trước khi cầu mã.');
    }
    if (row.maCau !== null) throw conflict('DA_CAU', 'Bạn đã dâng lễ cầu mã hôm nay.');
    if (checked.tickers.length > 0) {
      const listed = await this.market.listedSymbols(nowMs);
      const unknown = unlistedTickers(checked.tickers, listed);
      if (unknown.length > 0) {
        throw new UnprocessableEntityException({
          code: 'MA_KHONG_HOP_LE',
          message: `Mã không có trên sàn: ${unknown.join(', ')}.`,
        });
      }
    }
    const done = await this.repository.setCau(this.database, {
      actorKey: actor.key,
      ngay,
      tickers: checked.tickers,
      at: now,
    });
    if (!done) throw conflict('DA_CAU', 'Bạn đã dâng lễ cầu mã hôm nay.');
    return this.view(actor, nowMs);
  }

  /**
   * Bước 4: kết quả cả sàn hôm nay. Trước 11:30 chỉ người đã xong bước 3 xem được; từ 11:30 ai cũng xem
   * được (kể cả chưa đăng nhập).
   */
  async results(actor: FloorActor | null): Promise<ThanTaiResults> {
    const nowMs = this.clock.now().getTime();
    const ngay = vnDay(nowMs);
    if (isBeforeDeadline(nowMs)) {
      const row = actor ? await this.repository.findKhan(this.database, actor.key, ngay) : null;
      if (stepOf(row) !== 4) {
        throw new ForbiddenException({
          code: 'KET_QUA_CHUA_MO',
          message: 'Hoàn tất lượt khấn hoặc chờ sau 11:30 để xem kết quả cả sàn.',
        });
      }
    }
    const tally = await this.repository.tally(this.database, ngay, THAN_TAI_RULES.topTickers);
    return {
      total: tally.up + tally.flat + tally.down,
      up: tally.up,
      flat: tally.flat,
      down: tally.down,
      top5: tally.top5,
      asOf: nowMs,
    };
  }

  // ---------------------------------------------------------------- quản trị

  async adminLaList(): Promise<{ items: AdminLa[] }> {
    return { items: await this.repository.adminListLa(this.database) };
  }

  async adminLaUpdate(id: number, patch: LaPatch, context: AuditContext): Promise<AdminLa> {
    const at = this.clock.now();
    return this.database.transaction(async (tx) => {
      const before = await this.repository.adminFindLa(tx, id);
      if (!before)
        throw new NotFoundException({ code: 'LA_NOT_FOUND', message: 'Không tìm thấy lá quẻ.' });
      await this.repository.adminUpdateLa(tx, id, patch, at);
      const after = (await this.repository.adminFindLa(tx, id))!;
      await recordAudit(tx, context, {
        action: 'trading_floor.than_tai_la_update',
        targetEntity: 'tf_kd_la',
        targetId: String(id),
        before: laAudit(before),
        after: laAudit(after),
      });
      return after;
    });
  }

  async adminQueUpdate(id: number, patch: QuePatch, context: AuditContext): Promise<AdminQue> {
    const at = this.clock.now();
    return this.database.transaction(async (tx) => {
      const before = await this.repository.adminFindQue(tx, id);
      if (!before)
        throw new NotFoundException({ code: 'QUE_NOT_FOUND', message: 'Không tìm thấy quẻ.' });
      await this.repository.adminUpdateQue(tx, id, patch, at);
      const after = (await this.repository.adminFindQue(tx, id))!;
      await recordAudit(tx, context, {
        action: 'trading_floor.than_tai_que_update',
        targetEntity: 'tf_kd_que',
        targetId: String(id),
        before: queAudit(before),
        after: queAudit(after),
      });
      return after;
    });
  }

  async adminHanhList(): Promise<{ items: AdminHanh[] }> {
    return { items: await this.repository.adminListHanh(this.database) };
  }

  async adminHanhUpdate(hanh: Hanh, patch: HanhPatch, context: AuditContext): Promise<AdminHanh> {
    const at = this.clock.now();
    return this.database.transaction(async (tx) => {
      const before = await this.repository.adminFindHanh(tx, hanh);
      if (!before)
        throw new NotFoundException({ code: 'HANH_NOT_FOUND', message: 'Không tìm thấy hành.' });
      await this.repository.adminUpdateHanh(tx, hanh, patch, at);
      const after = (await this.repository.adminFindHanh(tx, hanh))!;
      await recordAudit(tx, context, {
        action: 'trading_floor.than_tai_hanh_update',
        targetEntity: 'tf_hanh_config',
        targetId: hanh,
        before: hanhAudit(before),
        after: hanhAudit(after),
      });
      return after;
    });
  }

  // ---------------------------------------------------------------- nội bộ

  private async view(actor: FloorActor, nowMs: number): Promise<ThanTaiToday> {
    const ngay = vnDay(nowMs);
    const [row, configs, quote] = await Promise.all([
      this.repository.findKhan(this.database, actor.key, ngay),
      this.repository.hanhConfigs(this.database),
      this.market.vnindex(nowMs).catch(() => null),
    ]);
    const la = row ? await this.repository.findLa(this.database, row.laId) : null;
    const byHanh: Partial<Record<Hanh, HanhConfig>> = {};
    for (const config of configs) byHanh[config.hanh] = config;
    return {
      status: statusOf(row, nowMs),
      step: stepOf(row),
      serverTime: nowMs,
      deadline: deadlineOf(ngay),
      day: buildDay(ngay, byHanh),
      vnindexRef: vnindexReference(quote, nowMs),
      la,
      prediction: row?.duDoan ?? null,
      tickers: row?.maCau ?? null,
    };
  }
}

const laAudit = (la: AdminLa) => ({
  ten_hao: la.tenHao,
  hao_van: la.haoVan,
  hao_nghia: la.haoNghia,
  hang: la.hang,
  luan: la.luan,
  chot: la.chot,
  active: la.active,
});

const queAudit = (que: AdminQue) => ({
  ten: que.ten,
  chu_han: que.chuHan,
  tuong: que.tuong,
  thoan: que.thoan,
  thoan_nghia: que.thoanNghia,
});

const hanhAudit = (hanh: AdminHanh) => ({ nganh: hanh.nganh, mau: hanh.mau, huong: hanh.huong });
