import { Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import { BULLETIN_RETENTION_MONTHS, type SlotNumber } from './bulletin.constants.js';
import { dmy } from './bulletin.format.js';
import { BulletinRepository, type FileMeta, type StoredFile } from './bulletin.repository.js';
import type { PublishedSummary } from './bulletin.types.js';
import { BulletinTrackingService, type TrackingView } from './bulletin-tracking.service.js';
import {
  MarketBulletinsService,
  retentionCutoff,
  type PublishedFileInfo,
} from './bulletins.service.js';

export type PublicBulletin = {
  trade_date: string;
  published_at: string;
  /** Lần Public lại gần nhất; null khi chưa Public lại. */
  updated_at: string | null;
  revision: number;
  summary: PublishedSummary | null;
  files: PublishedFileInfo[];
};

export type ArchivePage = {
  items: PublicBulletin[];
  total: number;
  page: number;
  has_more: boolean;
  retention_months: number;
};

type PublicRow = {
  trade_date: string;
  published_at: Date | string | null;
  updated_at: Date | string | null;
  published_revision: number;
  published_summary: PublishedSummary | null;
};

/** Dòng đầu tiên của "Bản tin cũ" là 15, mỗi lần "Xem thêm" thêm 20 (spec §5.2). */
export const ARCHIVE_FIRST_PAGE = 15;
export const ARCHIVE_NEXT_PAGE = 20;

const iso = (value: Date | string | null): string | null =>
  value === null ? null : (value instanceof Date ? value : new Date(value)).toISOString();

/** Phần công khai của bản tin: chỉ bản `public`, không bao giờ trả nội dung nháp. */
@Injectable()
export class BulletinPublicService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: BulletinRepository,
    private readonly bulletins: MarketBulletinsService,
    private readonly tracking: BulletinTrackingService,
  ) {}

  private async attachFiles(rows: readonly PublicRow[]): Promise<PublicBulletin[]> {
    if (!rows.length) return [];
    const metas = await this.database.query<FileMeta & { trade_date: string }>(
      `select f.trade_date, f.variant, f.revision, f.file_name, f.sha256, f.byte_size, f.page_count
         from market_bulletin_files f
         join market_bulletins b on b.trade_date = f.trade_date and b.published_revision = f.revision
        where f.trade_date = any($1::date[])
        order by f.trade_date desc, f.variant`,
      [rows.map((row) => String(row.trade_date).slice(0, 10))],
    );
    return rows.map((row) => {
      const date = String(row.trade_date).slice(0, 10);
      return {
        trade_date: date,
        published_at: iso(row.published_at)!,
        updated_at: iso(row.updated_at),
        revision: Number(row.published_revision),
        summary: row.published_summary ?? null,
        files: metas
          .filter((meta) => String(meta.trade_date).slice(0, 10) === date)
          .map((meta) =>
            this.bulletins.fileInfo({
              ...meta,
              trade_date: date,
              byte_size: Number(meta.byte_size),
              page_count: Number(meta.page_count),
              revision: Number(meta.revision),
            }),
          ),
      };
    });
  }

  async latest(): Promise<{ bulletin: PublicBulletin | null }> {
    const rows = await this.database.query<PublicRow>(
      `select trade_date, published_at, updated_at, published_revision, published_summary
         from market_bulletins where status = 'public' order by trade_date desc limit 1`,
    );
    return { bulletin: (await this.attachFiles(rows))[0] ?? null };
  }

  async byDate(date: string): Promise<{ bulletin: PublicBulletin }> {
    const rows = await this.database.query<PublicRow>(
      `select trade_date, published_at, updated_at, published_revision, published_summary
         from market_bulletins where status = 'public' and trade_date = $1::date`,
      [date],
    );
    const bulletin = (await this.attachFiles(rows))[0];
    if (!bulletin)
      throw new NotFoundException({
        code: 'BULLETIN_NOT_FOUND',
        message: `Chưa có bản tin phiên ${dmy(date)}.`,
      });
    return { bulletin };
  }

  async archive(page: number, now = new Date()): Promise<ArchivePage> {
    const since = retentionCutoff(now);
    const [{ total } = { total: 0 }] = await this.database.query<{ total: number }>(
      `select count(*)::int as total from market_bulletins where status = 'public' and trade_date >= $1::date`,
      [since],
    );
    const limit = page === 1 ? ARCHIVE_FIRST_PAGE : ARCHIVE_NEXT_PAGE;
    const offset = page === 1 ? 0 : ARCHIVE_FIRST_PAGE + ARCHIVE_NEXT_PAGE * (page - 2);
    const rows = await this.database.query<PublicRow>(
      `select trade_date, published_at, updated_at, published_revision, published_summary
         from market_bulletins
        where status = 'public' and trade_date >= $1::date
        order by trade_date desc
        limit $2 offset $3`,
      [since, limit, offset],
    );
    return {
      items: await this.attachFiles(rows),
      total: Number(total),
      page,
      has_more: offset + rows.length < Number(total),
      retention_months: BULLETIN_RETENTION_MONTHS,
    };
  }

  async file(date: string, variant: 'desktop' | 'mobile', revision: number): Promise<StoredFile> {
    const file = await this.repository.publicFile(date, variant, revision);
    if (!file)
      throw new NotFoundException({
        code: 'BULLETIN_FILE_NOT_FOUND',
        message: 'Không tìm thấy file bản tin.',
      });
    return file;
  }

  trackingView(slot: SlotNumber | null): Promise<TrackingView> {
    return this.tracking.view(slot);
  }
}
