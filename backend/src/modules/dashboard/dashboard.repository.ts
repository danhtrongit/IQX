/**
 * Thiết lập Dashboard phân tích theo tài khoản (spec §6): một dòng cho mỗi tài khoản, lưu trên
 * server nên mở trên máy khác vẫn giữ. Mã đang xem KHÔNG nằm trong thiết lập (trạng thái chung
 * của trang, spec §1.2).
 */
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import { dashboardSettingsSchema, type DashboardSettings } from './dashboard.schemas.js';

export interface StoredDashboardSettings extends DashboardSettings {
  revision: number;
  updated_at: string;
}

/** Persistence of the dashboard settings (faked in unit tests). */
export interface DashboardSettingsStore {
  /** The settings of one account; null when the account never saved anything. */
  find(userId: string): Promise<StoredDashboardSettings | null>;
  /** Writes the settings of one account and bumps the revision. */
  save(userId: string, settings: DashboardSettings): Promise<StoredDashboardSettings>;
}

type SettingsRow = {
  charts: unknown;
  per: unknown;
  nks: unknown;
  revision: number | string;
  updated_at: Date | string;
};

const COLUMNS = 'charts, per, nks, revision, updated_at';

@Injectable()
export class DashboardSettingsRepository implements DashboardSettingsStore {
  constructor(private readonly database: DatabaseService) {}

  async find(userId: string): Promise<StoredDashboardSettings | null> {
    const [row] = await this.database.query<SettingsRow>(
      `SELECT ${COLUMNS} FROM dashboard_settings WHERE user_id = $1`,
      [userId],
    );
    if (!row) return null;
    const parsed = dashboardSettingsSchema.safeParse({
      charts: row.charts,
      per: row.per,
      nks: row.nks,
    });
    // A row written by an older catalogue cannot be trusted: the caller falls back to defaults.
    if (!parsed.success) return null;
    return {
      ...parsed.data,
      revision: Number(row.revision),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  async save(userId: string, settings: DashboardSettings): Promise<StoredDashboardSettings> {
    const [row] = await this.database.query<SettingsRow>(
      `INSERT INTO dashboard_settings (user_id, charts, per, nks, revision, updated_at)
       VALUES ($1, $2::jsonb, $3, $4::jsonb, 1, now())
       ON CONFLICT (user_id) DO UPDATE
          SET charts = excluded.charts,
              per = excluded.per,
              nks = excluded.nks,
              revision = dashboard_settings.revision + 1,
              updated_at = now()
       RETURNING ${COLUMNS}`,
      [userId, JSON.stringify(settings.charts), settings.per, JSON.stringify(settings.nks)],
    );
    const parsed = dashboardSettingsSchema.safeParse({
      charts: row?.charts ?? settings.charts,
      per: row?.per ?? settings.per,
      nks: row?.nks ?? settings.nks,
    });
    return {
      ...(parsed.success ? parsed.data : settings),
      revision: Number(row?.revision ?? 1),
      updated_at: new Date(row?.updated_at ?? new Date()).toISOString(),
    };
  }
}
