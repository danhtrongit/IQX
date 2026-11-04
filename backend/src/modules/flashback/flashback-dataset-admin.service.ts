/**
 * Quản trị kho dữ liệu Flashback (IQX-Flashback-SPEC-DuLieu.md §6): phiên bản đang dùng, danh sách
 * mã và lý do bị loại, nút "Làm mới kho" (chạy nền, không cho chạy hai lần cùng lúc), lịch sử phiên
 * bản kèm nhật ký, cảnh báo, và tham số (§5) đổi được không cần sửa code.
 */

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import { IQX_JOBS_SERVICE } from '../runtime/runtime.types.js';
import { recordAudit, type AuditContext } from '../users/audit.js';
import { vietnamDate } from './flashback.round-builder.js';
import { DATASET_STALE_BUILD_MS } from './flashback-dataset.builder.js';
import {
  applyDatasetConfigPatch,
  datasetConfigToStored,
  decideScheduledRefresh,
  FLASHBACK_DATASET_DEFAULTS,
  readFlashbackDatasetConfig,
  type FlashbackDatasetConfigPatch,
  type StoredDatasetConfig,
} from './flashback-dataset.config.js';
import {
  FLASHBACK_DATASET_JOB_NAME,
  FlashbackDatasetJob,
} from './flashback-dataset.job.js';
import {
  FLASHBACK_DATASET_REPOSITORY,
  FlashbackDatasetRepository,
  type DatasetAlertRow,
  type DatasetProgress,
  type DatasetSymbolRow,
  type DatasetVersionRow,
} from './flashback-dataset.repository.js';

/** Cổng hàng đợi (khớp `JobsService`): chỉ phần cần dùng. */
export interface DatasetJobsPort {
  isEnabled(): boolean;
  runNow(name: string, requestedBy?: string): Promise<Record<string, unknown>>;
}

export interface DatasetVersionView {
  readonly version: number;
  readonly status: DatasetVersionRow['status'];
  readonly created_at: string;
  readonly activated_at: string | null;
  readonly finished_at: string | null;
  readonly symbols_count: number;
  readonly excluded_count: number;
  readonly first_date: string | null;
  readonly last_date: string | null;
  readonly source: string;
  readonly trigger: DatasetVersionRow['trigger'];
  readonly requested_by: string | null;
  readonly duration_ms: number | null;
  /** Nhật ký lần tạo kho (§2.2 bước 5): mã bị loại, nguồn, tham số. */
  readonly log: Record<string, unknown>;
}

export interface DatasetBuildingView {
  readonly version: number;
  readonly started_at: string;
  readonly heartbeat_at: string;
  readonly stale: boolean;
  readonly trigger: DatasetVersionRow['trigger'];
  readonly progress: DatasetProgress;
}

export interface DatasetWarningView {
  readonly code: string;
  readonly level: 'high' | 'medium';
  readonly message: string;
  readonly at: string | null;
}

export interface DatasetAlertView {
  readonly run_at: string;
  readonly level: 'high' | 'medium' | 'low';
  readonly code: string;
  readonly message: string;
}

export interface DatasetSymbolView {
  readonly symbol: string;
  readonly bars_count: number;
  readonly first_date: string | null;
  readonly last_date: string | null;
  readonly status: 'ok' | 'excluded';
  readonly reason: string | null;
  readonly price_source: string | null;
  readonly value_basis: string | null;
  readonly bad_count: number;
}

export interface DatasetStatusView {
  readonly active: DatasetVersionView | null;
  readonly building: DatasetBuildingView | null;
  readonly latest_failed: DatasetVersionView | null;
  readonly config: StoredDatasetConfig;
  readonly config_defaults: StoredDatasetConfig;
  readonly config_invalid: string[];
  readonly warnings: DatasetWarningView[];
  readonly alerts: DatasetAlertView[];
  readonly schedule: {
    readonly due: boolean;
    readonly reason: string;
    readonly anchor: string | null;
  };
}

export interface DatasetRefreshView {
  readonly accepted: true;
  readonly mode: 'queued' | 'inline';
  readonly job_id: string | null;
}

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

function versionView(row: DatasetVersionRow): DatasetVersionView {
  const excluded = row.log.excluded;
  const duration = row.log.duration_ms;
  return {
    version: row.version,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    activated_at: iso(row.activatedAt),
    finished_at: iso(row.finishedAt),
    symbols_count: row.symbolsCount,
    excluded_count: Array.isArray(excluded) ? excluded.length : (row.log.symbols?.excluded ?? 0),
    first_date: row.firstDate,
    last_date: row.lastDate,
    source: row.source,
    trigger: row.trigger,
    requested_by: row.requestedBy,
    duration_ms: typeof duration === 'number' ? duration : null,
    log: row.log as Record<string, unknown>,
  };
}

function symbolView(row: DatasetSymbolRow): DatasetSymbolView {
  return {
    symbol: row.symbol,
    bars_count: row.barsCount,
    first_date: row.firstDate,
    last_date: row.lastDate,
    status: row.status,
    reason: row.reason,
    price_source: row.priceSource,
    value_basis: row.valueBasis,
    bad_count: row.badCount,
  };
}

const alertView = (row: DatasetAlertRow): DatasetAlertView => ({
  run_at: row.runAt.toISOString(),
  level: row.level,
  code: row.code,
  message: row.message,
});

const WARNING_WINDOW_HOURS = 24 * 7;

@Injectable()
export class FlashbackDatasetAdminService {
  private readonly logger = new Logger(FlashbackDatasetAdminService.name);

  constructor(
    private readonly database: DatabaseService,
    @Inject(FLASHBACK_DATASET_REPOSITORY) private readonly repository: FlashbackDatasetRepository,
    private readonly job: FlashbackDatasetJob,
    @Optional() @Inject(IQX_JOBS_SERVICE) private readonly jobs?: DatasetJobsPort,
  ) {}

  /** Tổng quan: phiên bản đang dùng, lần tạo đang chạy, tham số, cảnh báo và lịch làm mới. */
  async status(now: Date = new Date()): Promise<DatasetStatusView> {
    const [active, building, latestFailed, stored, alertRows] = await Promise.all([
      this.repository.activeVersion(),
      this.repository.buildingVersion(),
      this.repository.latestFailedVersion(),
      this.repository.readConfig(),
      this.repository.listAlerts(30),
    ]);
    const { config, invalid } = readFlashbackDatasetConfig(stored);
    const decision = decideScheduledRefresh(
      vietnamDate(now),
      active ? vietnamDate(active.createdAt) : null,
      config,
    );
    const since = now.getTime() - WARNING_WINDOW_HOURS * 3_600_000;
    const recent = alertRows.filter((row) => row.runAt.getTime() >= since);
    const warnings: DatasetWarningView[] = [];

    if (!active) {
      warnings.push({
        code: 'no_active_version',
        level: 'high',
        message:
          'Chưa có phiên bản kho đang dùng: phòng chơi không bắt đầu được ván. Bấm "Làm mới kho".',
        at: null,
      });
    } else if (active.symbolsCount < config.minSymbols) {
      warnings.push({
        code: 'too_few_symbols',
        level: 'high',
        message: `Phiên bản đang dùng chỉ có ${active.symbolsCount} mã, ít hơn ngưỡng ${config.minSymbols} mã hiện hành.`,
        at: iso(active.activatedAt),
      });
    }
    if (latestFailed && (!active || latestFailed.version > active.version)) {
      const reason = String(latestFailed.log.error ?? 'Không rõ lý do');
      const tooFew = latestFailed.symbolsCount < config.minSymbols && latestFailed.symbolsCount > 0;
      warnings.push({
        code: tooFew ? 'too_few_symbols' : 'refresh_failed',
        level: 'high',
        message: tooFew
          ? `Phiên bản ${latestFailed.version} chỉ có ${latestFailed.symbolsCount} mã hợp lệ (cần ≥ ${config.minSymbols}) nên không được kích hoạt; đang giữ kho cũ. ${reason}`
          : `Làm mới kho thất bại (phiên bản ${latestFailed.version}): ${reason}`,
        at: iso(latestFailed.finishedAt ?? latestFailed.createdAt),
      });
    }
    const noCut = recent.filter((row) => row.code === 'no_cut');
    if (noCut.length > 0) {
      warnings.push({
        code: 'no_cut',
        level: 'high',
        message: `Có ván không bắt đầu được vì không tìm được điểm cắt (${noCut.length} cảnh báo trong 7 ngày qua). ${noCut[0]!.message}`,
        at: noCut[0]!.runAt.toISOString(),
      });
    }
    if (invalid.length > 0) {
      warnings.push({
        code: 'config_invalid',
        level: 'medium',
        message: `Tham số không hợp lệ đã được thay bằng mặc định: ${invalid.join(', ')}.`,
        at: null,
      });
    }

    return {
      active: active ? versionView(active) : null,
      building: building
        ? {
            version: building.version,
            started_at: building.createdAt.toISOString(),
            heartbeat_at: building.heartbeatAt.toISOString(),
            stale: now.getTime() - building.heartbeatAt.getTime() >= DATASET_STALE_BUILD_MS,
            trigger: building.trigger,
            progress: building.progress,
          }
        : null,
      latest_failed: latestFailed ? versionView(latestFailed) : null,
      config: datasetConfigToStored(config),
      config_defaults: datasetConfigToStored(FLASHBACK_DATASET_DEFAULTS),
      config_invalid: invalid,
      warnings,
      alerts: recent.map(alertView),
      schedule: { due: decision.due, reason: decision.reason, anchor: decision.anchor },
    };
  }

  /** Danh sách mã của một phiên bản (mặc định: phiên bản đang dùng, nếu chưa có thì bản mới nhất). */
  async symbols(
    version?: number,
  ): Promise<{ version: number | null; status: string | null; symbols: DatasetSymbolView[] }> {
    const target =
      version !== undefined
        ? await this.repository.getVersion(version)
        : ((await this.repository.activeVersion()) ?? (await this.repository.listVersions(1))[0] ?? null);
    if (version !== undefined && !target)
      throw new NotFoundException({
        code: 'DATASET_VERSION_NOT_FOUND',
        message: `Không tìm thấy phiên bản kho ${version}`,
      });
    if (!target) return { version: null, status: null, symbols: [] };
    return {
      version: target.version,
      status: target.status,
      symbols: (await this.repository.listSymbols(target.version)).map(symbolView),
    };
  }

  /** Lịch sử phiên bản: ngày tạo, trạng thái, số mã, nhật ký. */
  async versions(limit = 50): Promise<DatasetVersionView[]> {
    return (await this.repository.listVersions(limit)).map(versionView);
  }

  /**
   * "Làm mới kho": chạy §2.2 ở nền. Có worker (hàng đợi) thì đưa việc vào hàng đợi; không có thì
   * chạy ngay trong tiến trình API. Đang có một lần dựng khác thì từ chối (không cho bấm thêm).
   */
  async refresh(audit: AuditContext, now: Date = new Date()): Promise<DatasetRefreshView> {
    const building = await this.repository.buildingVersion();
    if (building && now.getTime() - building.heartbeatAt.getTime() < DATASET_STALE_BUILD_MS)
      throw new ConflictException({
        code: 'DATASET_REFRESH_RUNNING',
        message: `Đang có một lần làm mới kho chạy (phiên bản ${building.version}), hãy chờ cho tới khi xong`,
      });
    await this.database.transaction((tx) =>
      recordAudit(tx, audit, {
        action: 'flashback.dataset_refresh',
        targetEntity: 'fb_dataset_versions',
        note: 'Làm mới kho dữ liệu Flashback',
      }),
    );
    if (this.jobs?.isEnabled()) {
      const queued = await this.jobs.runNow(FLASHBACK_DATASET_JOB_NAME, audit.adminId);
      return {
        accepted: true,
        mode: 'queued',
        job_id: typeof queued.jobId === 'string' ? queued.jobId : null,
      };
    }
    void this.job.run({ manual: true, requestedBy: audit.adminId, now }).catch((error: unknown) =>
      this.logger.error(
        `Flashback dataset: làm mới thủ công lỗi (${error instanceof Error ? error.message : 'không rõ'})`,
      ),
    );
    return { accepted: true, mode: 'inline', job_id: null };
  }

  /** Đổi tham số (§5): chỉ các khoá được gửi, có kiểm tra khoảng giá trị, ghi nhật ký kiểm tra. */
  async updateConfig(
    patch: FlashbackDatasetConfigPatch,
    audit: AuditContext,
  ): Promise<{ config: StoredDatasetConfig; config_invalid: string[] }> {
    const before = readFlashbackDatasetConfig(await this.repository.readConfig()).config;
    const next = applyDatasetConfigPatch(before, patch);
    const stored = datasetConfigToStored(next);
    await this.database.transaction(async (tx) => {
      await tx.query(
        `insert into flashback_settings (key, value, updated_at) values ('dataset', $1::jsonb, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [JSON.stringify(stored)],
      );
      await recordAudit(tx, audit, {
        action: 'flashback.dataset_config',
        targetEntity: 'flashback_settings',
        targetId: 'dataset',
        before: datasetConfigToStored(before),
        after: stored,
        note: 'Đổi tham số kho dữ liệu Flashback',
      });
    });
    return { config: stored, config_invalid: [] };
  }
}
