import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { SqlClient } from '../../platform/database/index.js';
import { recordAudit, type AuditContext } from '../users/audit.js';
import {
  AcademyConfigRepository,
  type AcademyConfigLogRow,
  type AcademyConfigRow,
  type AcademyConfigWithActor,
  type AcademyLeaderRow,
} from './academy-config.repository.js';
import type {
  AcademyConfigCreate,
  AcademyConfigItem,
  AcademyConfigListResponse,
  AcademyConfigLogsResponse,
  AcademyConfigPreview,
  AcademyConfigWrite,
  TeamAcademyConfigResponse,
} from './academy-config.schemas.js';
import {
  adminConfig,
  allChapterIds,
  buildAcademyProgram,
  fullConfigData,
  normalizeChapterIds,
  type AcademyConfigData,
  type AcademyProgram,
  type ResolvedAcademyConfig,
} from './academy.config.js';
import { ACADEMY_CONTENT, type AcademyContent, type AcademyContentSource } from './academy.content.types.js';
import type { AcademyConfigPort } from './academy.ports.js';
import { chapterIdOf } from './content/v4/schema.js';

const dataOf = (row: AcademyConfigData): { mode: AcademyConfigData['mode']; chapter_ids: string[] } => ({
  mode: row.mode,
  chapter_ids: [...row.chapter_ids],
});

const sameData = (a: AcademyConfigData, b: AcademyConfigData): boolean =>
  a.mode === b.mode &&
  a.chapter_ids.length === b.chapter_ids.length &&
  a.chapter_ids.every((id, index) => id === b.chapter_ids[index]);

const iso = (value: Date | string): string => (value instanceof Date ? value : new Date(value)).toISOString();

const DASHBOARD_WARNING =
  'Nút Học ở Dashboard của các chỉ tiêu thuộc chương này sẽ không có bài.';

/**
 * Academy configs (supplement v4.1 §1, §8). Three jobs:
 *   1. resolve the config of a user on every call, from his group (`AcademyConfigPort`, §8.2);
 *   2. admin CRUD with a change log and the global audit trail (§1.3, §1.4, §8.3);
 *   3. the read-only view of a team lead's own group (§1.3).
 * A config only says which chapters a group learns and how; no progress is ever read, moved or deleted here (§7).
 */
@Injectable()
export class AcademyConfigService implements AcademyConfigPort {
  constructor(
    private readonly repository: AcademyConfigRepository,
    @Inject(ACADEMY_CONTENT) private readonly content: AcademyContentSource,
  ) {}

  /* ---------------------------------------------------------------------------------- resolution (§8.2) */

  async configOf(userId: string): Promise<ResolvedAcademyConfig> {
    const found = (await this.configsOf([userId])).get(userId);
    if (!found) throw new Error('academy config lookup returned no entry');
    return found;
  }

  /**
   * Admin: the built-in view of all chapters, free. Active team lead: his own group's config. Member: the config of the
   * lead of his group (a revoked lead keeps his members). No own config for that lead, or no group: the default config.
   * Unknown ids get the default. Any database error propagates: there is no fallback to another config.
   */
  async configsOf(userIds: readonly string[]): Promise<Map<string, ResolvedAcademyConfig>> {
    const content = this.content();
    const ids = [...new Set(userIds)];
    const result = new Map<string, ResolvedAcademyConfig>();
    if (ids.length === 0) return result;

    const [subjects, rows] = await Promise.all([
      this.repository.subjects(ids),
      this.repository.configsForUsers(ids),
    ]);
    const subjectOf = new Map(subjects.map((subject) => [subject.user_id, subject]));
    const defaultRow = rows.find((row) => row.owner_type === 'default');
    const ownByLeader = new Map(
      rows.flatMap((row) => (row.owner_type === 'leader' && row.leader_id ? [[row.leader_id, row] as const] : [])),
    );
    const fallback: ResolvedAcademyConfig = defaultRow
      ? { ...dataOf(defaultRow), source: 'default', config_id: defaultRow.id }
      : { ...fullConfigData(content), source: 'default', config_id: null };

    for (const id of ids) {
      const subject = subjectOf.get(id);
      if (subject?.role === 'admin') {
        result.set(id, adminConfig(content));
        continue;
      }
      const leaderId = subject ? (subject.is_active_lead ? subject.user_id : subject.group_lead_id) : null;
      const own = leaderId ? ownByLeader.get(leaderId) : undefined;
      result.set(
        id,
        own ? { ...dataOf(own), source: 'leader', config_id: own.id } : fallback,
      );
    }
    return result;
  }

  /* --------------------------------------------------------------------------------------- admin (§1.4) */

  /** The table of configs: the default first, then every team lead (with or without an own config). */
  async list(): Promise<AcademyConfigListResponse> {
    const content = this.content();
    const [configs, leaders, members, defaultUsers, activeLeads] = await Promise.all([
      this.repository.allConfigs(),
      this.repository.leaders(),
      this.repository.memberCounts(),
      this.repository.defaultUserCount(),
      this.repository.activeLeadIds(),
    ]);
    const defaultRow = configs.find((row) => row.owner_type === 'default') ?? null;
    const defaultData = defaultRow ? dataOf(defaultRow) : fullConfigData(content);
    const ownByLeader = new Map(
      configs.flatMap((row) => (row.owner_type === 'leader' && row.leader_id ? [[row.leader_id, row] as const] : [])),
    );

    const items: AcademyConfigItem[] = [
      configItem(content, {
        row: defaultRow,
        data: defaultData,
        owner_type: 'default',
        leader: null,
        name: 'Mặc định',
        inherits_default: false,
        user_count: defaultUsers,
      }),
      ...leaders.map((leader) => {
        const own = ownByLeader.get(leader.user_id) ?? null;
        return configItem(content, {
          row: own,
          data: own ? dataOf(own) : defaultData,
          owner_type: 'leader',
          leader,
          name: leader.full_name,
          inherits_default: own === null,
          user_count: (members.get(leader.user_id) ?? 0) + (activeLeads.has(leader.user_id) ? 1 : 0),
        });
      }),
    ];
    return {
      catalog_version: content.catalog.catalog_version,
      catalog_chapters: catalogChapters(content),
      items,
    };
  }

  /** "Xem trước": the chapters exactly as the group's learners would see them, renumbered. */
  preview(input: AcademyConfigWrite): AcademyConfigPreview {
    const content = this.content();
    const chapterIds = this.validChapterIds(content, input.chapter_ids);
    const program = buildAcademyProgram(content, { mode: input.mode, chapter_ids: chapterIds });
    const chosen = new Set(chapterIds);
    return {
      mode: program.mode,
      ...programSummary(program, allChapterIds(content).length),
      warnings: catalogChapters(content)
        .filter((chapter) => chapter.has_dashboard_metrics && !chosen.has(chapter.chapter_id))
        .map((chapter) => ({
          code: 'DASHBOARD_METRIC_CHAPTER_REMOVED' as const,
          chapter_id: chapter.chapter_id,
          title: chapter.title,
          message: DASHBOARD_WARNING,
        })),
    };
  }

  /** "Tạo cấu hình riêng" for a team lead. 409 when he already has one. */
  async create(input: AcademyConfigCreate, audit: AuditContext): Promise<AcademyConfigItem> {
    const content = this.content();
    const chapterIds = this.validChapterIds(content, input.chapter_ids);
    const after: AcademyConfigData = { mode: input.mode, chapter_ids: chapterIds };

    await this.repository.transaction(async (tx) => {
      const leader = await this.repository.leader(input.leader_id, tx);
      if (!leader)
        throw new NotFoundException({
          code: 'ACADEMY_LEADER_NOT_FOUND',
          message: 'Không tìm thấy trưởng nhóm.',
        });
      // The group learned with the default until now: that is its "before".
      const before = await this.defaultData(content, tx);
      const row = await this.repository.insertConfig(tx, {
        owner_type: 'leader',
        leader_id: leader.user_id,
        mode: after.mode,
        chapter_ids: after.chapter_ids,
        updated_by: audit.adminId,
      });
      if (!row)
        throw new ConflictException({
          code: 'ACADEMY_CONFIG_EXISTS',
          message: 'Trưởng nhóm này đã có cấu hình riêng.',
        });
      await this.repository.insertLog(tx, {
        config_id: row.id,
        owner_type: 'leader',
        leader_id: leader.user_id,
        action: 'create',
        changed_by: audit.adminId,
        before,
        after,
      });
      await recordAudit(tx, audit, {
        action: 'academy_config.create',
        targetEntity: 'academy_config',
        targetId: row.id,
        before: { leader_id: leader.user_id, ...before },
        after: { leader_id: leader.user_id, ...after },
      });
    });
    return this.itemOfLeader(input.leader_id);
  }

  /** Saves the default config or a lead's own. An unchanged save writes nothing. */
  async update(id: string, input: AcademyConfigWrite, audit: AuditContext): Promise<AcademyConfigItem> {
    const content = this.content();
    const chapterIds = this.validChapterIds(content, input.chapter_ids);
    const after: AcademyConfigData = { mode: input.mode, chapter_ids: chapterIds };

    const saved = await this.repository.transaction(async (tx) => {
      const row = await this.repository.configById(id, tx, true);
      if (!row) throw configNotFound();
      const before = dataOf(row);
      if (sameData(before, after)) return row;
      const updated = await this.repository.updateConfig(tx, id, { ...after, updated_by: audit.adminId });
      await this.repository.insertLog(tx, {
        config_id: id,
        owner_type: row.owner_type,
        leader_id: row.leader_id,
        action: 'update',
        changed_by: audit.adminId,
        before,
        after,
      });
      await recordAudit(tx, audit, {
        action: 'academy_config.update',
        targetEntity: 'academy_config',
        targetId: id,
        before: { owner_type: row.owner_type, leader_id: row.leader_id, ...before },
        after: { owner_type: row.owner_type, leader_id: row.leader_id, ...after },
      });
      return updated;
    });
    return saved.owner_type === 'default' ? this.itemOfDefault() : this.itemOfLeader(saved.leader_id ?? '');
  }

  /** "Về mặc định": deletes a lead's own config; the group goes back to the default. The default itself stays. */
  async remove(id: string, audit: AuditContext): Promise<AcademyConfigItem> {
    const content = this.content();
    const leaderId = await this.repository.transaction(async (tx) => {
      const row = await this.repository.configById(id, tx, true);
      if (!row) throw configNotFound();
      if (row.owner_type === 'default' || !row.leader_id)
        throw new ConflictException({
          code: 'ACADEMY_CONFIG_DEFAULT_PROTECTED',
          message: 'Không xoá được cấu hình mặc định.',
        });
      const before = dataOf(row);
      const after = await this.defaultData(content, tx);
      await this.repository.deleteConfig(tx, id);
      await this.repository.insertLog(tx, {
        config_id: id,
        owner_type: 'leader',
        leader_id: row.leader_id,
        action: 'delete',
        changed_by: audit.adminId,
        before,
        after,
      });
      await recordAudit(tx, audit, {
        action: 'academy_config.delete',
        targetEntity: 'academy_config',
        targetId: id,
        before: { leader_id: row.leader_id, ...before },
        after: { leader_id: row.leader_id, ...after },
      });
      return row.leader_id;
    });
    return this.itemOfLeader(leaderId);
  }

  /** Change log of a config (also after a "Về mặc định" and a new own config: the log follows the lead). */
  async logs(id: string, limit: number): Promise<AcademyConfigLogsResponse> {
    const row = await this.repository.configById(id);
    if (!row) throw configNotFound();
    const rows: AcademyConfigLogRow[] = await this.repository.logs(
      row.owner_type === 'default' || !row.leader_id
        ? { owner_type: 'default' }
        : { owner_type: 'leader', leader_id: row.leader_id },
      limit,
    );
    return {
      items: rows.map((log) => ({
        id: log.id,
        action: log.action,
        changed_at: iso(log.changed_at),
        changed_by: log.changed_by
          ? {
              id: log.changed_by,
              username: log.changed_by_username ?? '',
              full_name: log.changed_by_full_name ?? '',
            }
          : null,
        before: log.before ? dataOf(log.before) : null,
        after: log.after ? dataOf(log.after) : null,
      })),
    };
  }

  /* -------------------------------------------------------------------------- team lead, read only (§1.3) */

  /** The config of the lead's own group: his own, or the default when he has none. Never writes. */
  async teamConfig(leadId: string): Promise<TeamAcademyConfigResponse> {
    const content = this.content();
    const [own, fallback] = await Promise.all([
      this.repository.leaderConfig(leadId),
      this.repository.defaultConfig(),
    ]);
    const row = own ?? fallback;
    const data = row ? dataOf(row) : fullConfigData(content);
    const program = buildAcademyProgram(content, data);
    return {
      has_own_config: own !== null,
      read_only: true,
      mode: program.mode,
      ...programSummary(program, allChapterIds(content).length),
      updated_at: row ? iso(row.updated_at) : null,
    };
  }

  /* ------------------------------------------------------------------------------------------ helpers */

  private validChapterIds(content: AcademyContent, chapterIds: readonly string[]): string[] {
    const checked = normalizeChapterIds(content, chapterIds);
    if (checked.ok) return checked.chapter_ids;
    throw new UnprocessableEntityException({
      code: 'ACADEMY_CONFIG_INVALID',
      message:
        checked.reason === 'empty'
          ? 'Phải chọn ít nhất 1 chương.'
          : `Chương không hợp lệ: ${checked.unknown.join(', ')}.`,
      details: checked.unknown.map((chapter_id) => ({ field: 'chapter_ids', chapter_id })),
    });
  }

  private async defaultData(content: AcademyContent, client: SqlClient): Promise<AcademyConfigData> {
    const row = await this.repository.defaultConfig(client);
    return row ? dataOf(row) : fullConfigData(content);
  }

  private async itemOfDefault(): Promise<AcademyConfigItem> {
    const found = (await this.list()).items.find((item) => item.owner_type === 'default');
    if (!found) throw configNotFound();
    return found;
  }

  private async itemOfLeader(leaderId: string): Promise<AcademyConfigItem> {
    const found = (await this.list()).items.find((item) => item.leader?.user_id === leaderId);
    if (!found) throw configNotFound();
    return found;
  }
}

function configNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'ACADEMY_CONFIG_NOT_FOUND',
    message: 'Không tìm thấy cấu hình Học viện.',
  });
}

/** The 12 chapters of the catalog as the edit screen lists them (original order and numbers). */
function catalogChapters(content: AcademyContent) {
  return content.catalog.chapters
    .filter((chapter) => chapter.published)
    .map((chapter) => ({
      chapter_id: chapterIdOf(chapter.no),
      no: chapter.no,
      title: chapter.title,
      lesson_count: chapter.lesson_count,
      has_practice: chapter.items.some((item) => item.kind === 'practice'),
      has_dashboard_metrics: chapter.items.some((item) => item.metric_key !== null),
    }));
}

function programSummary(program: AcademyProgram, chapterTotal: number) {
  return {
    chapter_count: program.chapters.length,
    chapter_total: chapterTotal,
    required_total: program.requiredTotal,
    chapters: program.chapters.map((chapter) => ({
      chapter_id: chapter.chapter_id,
      display_no: chapter.display_no,
      title: chapter.title,
      lesson_count: chapter.lesson_count,
      has_practice: chapter.items.some((item) => item.kind === 'practice'),
    })),
  };
}

function configItem(
  content: AcademyContent,
  input: {
    row: AcademyConfigWithActor | null;
    data: AcademyConfigData;
    owner_type: 'default' | 'leader';
    leader: AcademyLeaderRow | null;
    name: string;
    inherits_default: boolean;
    user_count: number;
  },
): AcademyConfigItem {
  const program = buildAcademyProgram(content, input.data);
  const row = input.row;
  return {
    id: row?.id ?? null,
    owner_type: input.owner_type,
    leader: input.leader
      ? {
          user_id: input.leader.user_id,
          username: input.leader.username,
          full_name: input.leader.full_name,
          status: input.leader.status,
        }
      : null,
    name: input.name,
    inherits_default: input.inherits_default,
    mode: program.mode,
    chapter_ids: program.chapters.map((chapter) => chapter.chapter_id),
    chapter_count: program.chapters.length,
    chapter_total: allChapterIds(content).length,
    required_total: program.requiredTotal,
    user_count: input.user_count,
    updated_at: row ? iso(row.updated_at) : null,
    updated_by:
      row?.updated_by !== null && row?.updated_by !== undefined
        ? {
            id: row.updated_by,
            username: row.updated_by_username ?? '',
            full_name: row.updated_by_full_name ?? '',
          }
        : null,
  };
}
