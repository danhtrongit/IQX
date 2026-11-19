import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import { recordAudit, type AuditContext } from '../users/audit.js';
import type { IqxDraft, IqxTemplateKind } from './iqx-templates.schemas.js';
import {
  validateContent,
  type IqxContent,
  type IqxFieldError,
} from './iqx-templates.validation.js';

type Timestamp = Date | string;

type TemplateRow = {
  id: string;
  kind: IqxTemplateKind;
  slug: string;
  sort_order: number;
  visibility: 'shown' | 'hidden';
  current_version: number | null;
  draft: Record<string, unknown> | null;
  draft_updated_at: Timestamp | null;
  draft_updated_by: string | null;
  draft_updated_by_name: string | null;
  updated_at: Timestamp;
  updated_by: string | null;
  updated_by_name: string | null;
  content: Record<string, unknown> | null;
  used_30d: number | string;
};

type VersionRow = {
  version: number;
  content: Record<string, unknown>;
  published_at: Timestamp;
  published_by: string | null;
  published_by_name: string | null;
  reason: string;
};

type AuditRow = {
  action: string;
  created_at: Timestamp;
  admin_user_id: string | null;
  admin_name: string | null;
  note: string | null;
  payload_after: Record<string, unknown> | null;
};

type Actor = { id: string | null; name: string } | null;

export type IqxPublishedItem = {
  id: string;
  slug: string;
  kind: IqxTemplateKind;
  version: number;
  content: IqxContent;
  pair: { id: string; slug: string; name: string; version: number } | null;
};

const ACTIONS = [
  'create',
  'draft_save',
  'publish',
  'hide',
  'show',
  'reorder',
  'delete_draft',
  'restore',
] as const;
type HistoryAction = (typeof ACTIONS)[number];

/** Seeded and system versions have no admin: shown as IQX. */
const SYSTEM_ACTOR: Actor = { id: null, name: 'IQX' };
const AUDIT_ENTITY = 'iqx_template';

const iso = (value: Timestamp): string => new Date(value).toISOString();
const actor = (id: string | null, name: string | null): Actor =>
  id ? { id, name: name ?? 'Quản trị viên' } : null;
const kindLabel = (kind: IqxTemplateKind) => (kind === 'filter' ? 'Bộ lọc IQX' : 'Chiến lược IQX');

const notFound = () =>
  new NotFoundException({ code: 'IQX_TEMPLATE_NOT_FOUND', message: 'Không tìm thấy mục IQX.' });
const conflict = () =>
  new ConflictException({
    code: 'IQX_TEMPLATE_CONFLICT',
    message: 'Mục này vừa được người khác thay đổi. Tải lại để xem bản mới nhất.',
  });
const invalid = (errors: IqxFieldError[]) =>
  new UnprocessableEntityException({
    code: 'IQX_TEMPLATE_INVALID',
    message: errors[0]?.message ?? 'Mục IQX không hợp lệ.',
    details: errors,
  });

/** Same instant at millisecond precision (what the API hands out); null only equals null. */
function sameInstant(stored: Timestamp | null, given: string | null | undefined): boolean {
  if (stored === null) return given === null || given === undefined;
  if (!given) return false;
  return new Date(stored).toISOString() === new Date(given).toISOString();
}

/** `Theo dòng tiền` → `theo-dong-tien`; a unique suffix is added by the caller. */
export function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'muc';
}

const SELECT_TEMPLATE = `
  select t.id, t.kind, t.slug, t.sort_order, t.visibility, t.current_version, t.draft,
         t.draft_updated_at, t.draft_updated_by, du.full_name as draft_updated_by_name,
         t.updated_at, t.updated_by, uu.full_name as updated_by_name,
         v.content,
         (select count(*) from iqx_template_used u
           where u.template_id = t.id and u.created_at >= now() - interval '30 days') as used_30d
    from iqx_templates t
    left join iqx_template_versions v on v.template_id = t.id and v.version = t.current_version
    left join users du on du.id = t.draft_updated_by
    left join users uu on uu.id = t.updated_by`;

/**
 * Bộ lọc IQX and Chiến lược IQX (spec Tab IQX §4, §5): users read the shown, published versions;
 * admins compose drafts and publish immutable versions. Every admin write is one audit row.
 */
@Injectable()
export class IqxTemplatesService {
  private readonly logger = new Logger(IqxTemplatesService.name);

  constructor(private readonly database: DatabaseService) {}

  // ---------------------------------------------------------------------------------------------
  // Users

  /**
   * Shown and published items of one kind, current version, in `sort_order`. An item whose content
   * no longer passes the current validators (registry changed) is skipped and logged (§4.2).
   */
  async listPublished(
    kind: IqxTemplateKind,
  ): Promise<{ kind: IqxTemplateKind; items: IqxPublishedItem[] }> {
    const rows = await this.database.query<{
      id: string;
      slug: string;
      version: number;
      content: Record<string, unknown>;
    }>(
      `select t.id, t.slug, v.version, v.content
         from iqx_templates t
         join iqx_template_versions v on v.template_id = t.id and v.version = t.current_version
        where t.kind = $1 and t.visibility = 'shown'
        order by t.sort_order, t.created_at, t.id`,
      [kind],
    );
    const pairs = kind === 'filter' ? await this.shownStrategiesBySlug() : new Map();
    const items: IqxPublishedItem[] = [];
    for (const row of rows) {
      const checked = validateContent(kind, row.content);
      if (!checked.ok) {
        this.logger.error(
          `IQX template ${kind}/${row.slug} v${row.version} skipped: ${checked.errors
            .map((error) => `${error.field}: ${error.message}`)
            .join('; ')}`,
        );
        continue;
      }
      const pairSlug = 'pair_slug' in checked.content ? checked.content.pair_slug : null;
      items.push({
        id: row.id,
        slug: row.slug,
        kind,
        version: row.version,
        // Content exactly as published: the check above only decides whether it is still usable.
        content: row.content as IqxContent,
        pair: (pairSlug && pairs.get(pairSlug)) || null,
      });
    }
    return { kind, items };
  }

  /** "Người dùng bấm Dùng" (§5.7): one event per fill of a shown, published version. */
  async recordUsed(userId: string, id: string, version: number): Promise<{ recorded: true }> {
    const [row] = await this.database.query<{ id: string }>(
      `select t.id from iqx_templates t
         join iqx_template_versions v on v.template_id = t.id and v.version = $2
        where t.id = $1 and t.current_version is not null and t.visibility = 'shown'`,
      [id, version],
    );
    if (!row) throw notFound();
    await this.database.query(
      `insert into iqx_template_used (template_id, version, user_id) values ($1, $2, $3)`,
      [id, version, userId],
    );
    return { recorded: true };
  }

  /** Name of a published version, for run snapshots (null when it does not exist). */
  async versionName(id: string, version: number, kind: IqxTemplateKind): Promise<string | null> {
    const [row] = await this.database.query<{ name: string | null }>(
      `select v.content->>'name' as name
         from iqx_template_versions v join iqx_templates t on t.id = v.template_id
        where v.template_id = $1 and v.version = $2 and t.kind = $3`,
      [id, version, kind],
    );
    return row?.name ?? null;
  }

  private async shownStrategiesBySlug() {
    const rows = await this.database.query<{
      id: string;
      slug: string;
      version: number;
      name: string;
    }>(
      `select t.id, t.slug, v.version, v.content->>'name' as name
         from iqx_templates t
         join iqx_template_versions v on v.template_id = t.id and v.version = t.current_version
        where t.kind = 'strategy' and t.visibility = 'shown'`,
    );
    return new Map(rows.map((row) => [row.slug, row]));
  }

  // ---------------------------------------------------------------------------------------------
  // Admin

  async adminList(kind: IqxTemplateKind) {
    const rows = await this.database.query<TemplateRow>(
      `${SELECT_TEMPLATE} where t.kind = $1 order by t.sort_order, t.created_at, t.id`,
      [kind],
    );
    return { kind, items: rows.map((row) => this.listItem(row)) };
  }

  async adminDetail(id: string) {
    return this.detail(this.database, id);
  }

  async create(kind: IqxTemplateKind, draft: IqxDraft, context: AuditContext) {
    return this.database.transaction(async (client) => {
      await client.query(`select pg_advisory_xact_lock(hashtext('iqx_templates:' || $1::text))`, [
        kind,
      ]);
      const slug = await this.freeSlug(client, kind, slugify(draft.name));
      const [created] = await client.query<{ id: string }>(
        `insert into iqx_templates
           (kind, slug, sort_order, visibility, draft, draft_updated_at, draft_updated_by,
            created_by, updated_by)
         values ($1::varchar, $2,
                 coalesce((select max(sort_order) from iqx_templates where kind = $1::varchar), 0) + 1,
                 'shown', $3::jsonb, now(), $4::uuid, $4::uuid, $4::uuid)
         returning id`,
        [kind, slug, JSON.stringify(draft), context.adminId],
      );
      await recordAudit(client, context, {
        action: 'iqx_template.create',
        targetEntity: AUDIT_ENTITY,
        targetId: created!.id,
        after: { kind, slug, draft },
      });
      return this.detail(client, created!.id);
    });
  }

  async saveDraft(id: string, draft: IqxDraft, expectedAt: string | null, context: AuditContext) {
    return this.database.transaction(async (client) => {
      const row = await this.lock(client, id);
      if (!sameInstant(row.draft_updated_at, expectedAt)) throw conflict();
      await client.query(
        `update iqx_templates
            set draft = $2::jsonb, draft_updated_at = now(), draft_updated_by = $3,
                updated_at = now(), updated_by = $3
          where id = $1`,
        [id, JSON.stringify(draft), context.adminId],
      );
      await recordAudit(client, context, {
        action: 'iqx_template.draft_save',
        targetEntity: AUDIT_ENTITY,
        targetId: id,
        before: row.draft,
        after: draft,
      });
      return this.detail(client, id);
    });
  }

  async publish(
    id: string,
    input: {
      content: Record<string, unknown>;
      reason: string;
      expected_version: number | null;
      draft_updated_at?: string | null;
    },
    context: AuditContext,
  ) {
    return this.database.transaction(async (client) => {
      const row = await this.lock(client, id);
      if (row.current_version !== input.expected_version) throw conflict();
      if (
        input.draft_updated_at !== undefined &&
        !sameInstant(row.draft_updated_at, input.draft_updated_at)
      )
        throw conflict();

      const checked = validateContent(row.kind, input.content);
      const errors = checked.ok ? [] : [...checked.errors];
      const name = typeof input.content.name === 'string' ? input.content.name.trim() : '';
      if (row.kind === 'filter') {
        const pair = input.content.pair_slug;
        if (typeof pair === 'string' && pair) {
          const [found] = await client.query<{ id: string }>(
            `select id from iqx_templates
              where kind = 'strategy' and slug = $1 and current_version is not null`,
            [pair],
          );
          if (!found)
            errors.push({
              field: 'pair_slug',
              message: 'Đi cặp với: chọn một Chiến lược IQX đã xuất bản.',
            });
        }
      }
      if (errors.length || !checked.ok) throw invalid(errors);

      if (name) {
        const [taken] = await client.query<{ id: string }>(
          `select t.id from iqx_templates t
             join iqx_template_versions v on v.template_id = t.id and v.version = t.current_version
            where t.kind = $1 and t.id <> $2 and lower(v.content->>'name') = lower($3)
            limit 1`,
          [row.kind, id, name],
        );
        if (taken)
          throw new ConflictException({
            code: 'IQX_TEMPLATE_NAME_TAKEN',
            message: `Tên “${name}” đã có ở một ${kindLabel(row.kind)} khác.`,
            details: [{ field: 'name', message: 'Tên đã được dùng.' }],
          });
      }

      const version = (row.current_version ?? 0) + 1;
      const [previous] = row.current_version
        ? await client.query<{ content: Record<string, unknown> }>(
            `select content from iqx_template_versions where template_id = $1 and version = $2`,
            [id, row.current_version],
          )
        : [];
      await client.query(
        `insert into iqx_template_versions (template_id, version, content, published_by, reason)
         values ($1, $2, $3::jsonb, $4, $5)`,
        [id, version, JSON.stringify(checked.content), context.adminId, input.reason],
      );
      // A first publish shows the item at the end of the list; a hidden item stays hidden.
      await client.query(
        `update iqx_templates
            set current_version = $2, draft = null, draft_updated_at = null, draft_updated_by = null,
                visibility = case when current_version is null then 'shown' else visibility end,
                sort_order = case when current_version is null
                  then coalesce((select max(sort_order) from iqx_templates
                                  where kind = $4::varchar and id <> $1::uuid), 0) + 1
                  else sort_order end,
                updated_at = now(), updated_by = $3
          where id = $1`,
        [id, version, context.adminId, row.kind],
      );
      await recordAudit(client, context, {
        action: 'iqx_template.publish',
        targetEntity: AUDIT_ENTITY,
        targetId: id,
        before: previous ? { version: row.current_version, content: previous.content } : null,
        after: { version, content: checked.content },
        note: input.reason,
      });
      return this.detail(client, id);
    });
  }

  async setVisibility(
    id: string,
    visibility: 'shown' | 'hidden',
    reason: string,
    context: AuditContext,
  ) {
    return this.database.transaction(async (client) => {
      const row = await this.lock(client, id);
      if (row.current_version === null)
        throw new ConflictException({
          code: 'IQX_TEMPLATE_NOT_PUBLISHED',
          message: 'Mục chưa xuất bản nên không ẩn hoặc hiện được.',
        });
      if (row.visibility === visibility)
        throw new ConflictException({
          code: 'IQX_TEMPLATE_CONFLICT',
          message:
            visibility === 'hidden'
              ? 'Mục này đang ẩn. Tải lại để xem bản mới nhất.'
              : 'Mục này đang hiện. Tải lại để xem bản mới nhất.',
        });
      await client.query(
        `update iqx_templates set visibility = $2, updated_at = now(), updated_by = $3 where id = $1`,
        [id, visibility, context.adminId],
      );
      await recordAudit(client, context, {
        action: visibility === 'hidden' ? 'iqx_template.hide' : 'iqx_template.show',
        targetEntity: AUDIT_ENTITY,
        targetId: id,
        before: { visibility: row.visibility },
        after: { visibility },
        note: reason,
      });
      return this.detail(client, id);
    });
  }

  /** Writes `sort_order` from the full ordered list of one kind (§5.5 ↑ ↓). */
  async reorder(kind: IqxTemplateKind, ids: readonly string[], context: AuditContext) {
    return this.database.transaction(async (client) => {
      await client.query(`select pg_advisory_xact_lock(hashtext('iqx_templates:' || $1::text))`, [
        kind,
      ]);
      const rows = await client.query<{ id: string }>(
        `select id from iqx_templates where kind = $1 order by sort_order, created_at, id for update`,
        [kind],
      );
      const current = rows.map((row) => row.id);
      const same =
        current.length === ids.length &&
        new Set(ids).size === ids.length &&
        ids.every((id) => current.includes(id));
      if (!same) throw conflict();
      for (const [index, id] of ids.entries())
        await client.query(
          `update iqx_templates set sort_order = $2, updated_at = now(), updated_by = $3
            where id = $1 and sort_order <> $2`,
          [id, index + 1, context.adminId],
        );
      await recordAudit(client, context, {
        action: 'iqx_template.reorder',
        targetEntity: AUDIT_ENTITY,
        before: { kind, ids: current },
        after: { kind, ids },
      });
      const list = await client.query<TemplateRow>(
        `${SELECT_TEMPLATE} where t.kind = $1 order by t.sort_order, t.created_at, t.id`,
        [kind],
      );
      return { kind, items: list.map((row) => this.listItem(row)) };
    });
  }

  /** Only a never published item can be deleted (§5.5). */
  async deleteDraft(id: string, context: AuditContext) {
    return this.database.transaction(async (client) => {
      const row = await this.lock(client, id);
      if (row.current_version !== null)
        throw new ConflictException({
          code: 'IQX_TEMPLATE_PUBLISHED',
          message: 'Mục đã xuất bản không xóa được. Muốn bỏ thì bấm Ẩn.',
        });
      await client.query(`delete from iqx_templates where id = $1`, [id]);
      await recordAudit(client, context, {
        action: 'iqx_template.delete_draft',
        targetEntity: AUDIT_ENTITY,
        targetId: id,
        before: { kind: row.kind, slug: row.slug, draft: row.draft },
      });
      return { id, deleted: true as const };
    });
  }

  /** "Khôi phục làm bản nháp": copies one published version into `draft` (§5.5). */
  async restore(id: string, version: number, context: AuditContext) {
    return this.database.transaction(async (client) => {
      const row = await this.lock(client, id);
      const [found] = await client.query<{ content: Record<string, unknown> }>(
        `select content from iqx_template_versions where template_id = $1 and version = $2`,
        [id, version],
      );
      if (!found)
        throw new NotFoundException({
          code: 'IQX_TEMPLATE_VERSION_NOT_FOUND',
          message: `Không có phiên bản v${version}.`,
        });
      await client.query(
        `update iqx_templates
            set draft = $2::jsonb, draft_updated_at = now(), draft_updated_by = $3,
                updated_at = now(), updated_by = $3
          where id = $1`,
        [id, JSON.stringify(found.content), context.adminId],
      );
      await recordAudit(client, context, {
        action: 'iqx_template.restore',
        targetEntity: AUDIT_ENTITY,
        targetId: id,
        before: row.draft,
        after: { version, draft: found.content },
        note: `Khôi phục từ v${version}`,
      });
      return this.detail(client, id);
    });
  }

  // ---------------------------------------------------------------------------------------------

  private async lock(client: SqlClient, id: string) {
    const [row] = await client.query<{
      id: string;
      kind: IqxTemplateKind;
      slug: string;
      visibility: 'shown' | 'hidden';
      current_version: number | null;
      draft: Record<string, unknown> | null;
      draft_updated_at: Timestamp | null;
    }>(
      `select id, kind, slug, visibility, current_version, draft, draft_updated_at
         from iqx_templates where id = $1 for update`,
      [id],
    );
    if (!row) throw notFound();
    return row;
  }

  private async freeSlug(client: SqlClient, kind: IqxTemplateKind, base: string): Promise<string> {
    const rows = await client.query<{ slug: string }>(
      `select slug from iqx_templates where kind = $1 and (slug = $2 or slug like $2 || '-%')`,
      [kind, base],
    );
    const used = new Set(rows.map((row) => row.slug));
    if (!used.has(base)) return base;
    for (let index = 2; ; index += 1) if (!used.has(`${base}-${index}`)) return `${base}-${index}`;
  }

  private listItem(row: TemplateRow) {
    const content = row.content ?? {};
    const draft = row.draft ?? {};
    const text = (value: unknown) => (typeof value === 'string' ? value : '');
    return {
      id: row.id,
      kind: row.kind,
      slug: row.slug,
      sort_order: Number(row.sort_order),
      visibility: row.visibility,
      status:
        row.current_version === null
          ? ('unpublished' as const)
          : row.visibility === 'shown'
            ? ('shown' as const)
            : ('hidden' as const),
      current_version: row.current_version,
      name: text(content.name) || text(draft.name),
      idea: text(content.idea) || text(draft.idea),
      has_draft: row.draft !== null,
      draft_updated_at: row.draft_updated_at ? iso(row.draft_updated_at) : null,
      updated_at: iso(row.updated_at),
      updated_by: actor(row.updated_by, row.updated_by_name) ?? SYSTEM_ACTOR,
      used_30d: Number(row.used_30d),
    };
  }

  private async detail(client: Pick<SqlClient, 'query'>, id: string) {
    const [row] = await client.query<TemplateRow>(`${SELECT_TEMPLATE} where t.id = $1`, [id]);
    if (!row) throw notFound();
    const versions = await client.query<VersionRow>(
      `select v.version, v.content, v.published_at, v.published_by, u.full_name as published_by_name,
              v.reason
         from iqx_template_versions v left join users u on u.id = v.published_by
        where v.template_id = $1 order by v.version desc`,
      [id],
    );
    const audits = await client.query<AuditRow>(
      `select a.action, a.created_at, a.admin_user_id, u.full_name as admin_name, a.note,
              a.payload_after
         from admin_audit_log a left join users u on u.id = a.admin_user_id
        where a.target_entity = $2
          and (a.target_id = $1::text
               or (a.action = 'iqx_template.reorder' and a.payload_after -> 'ids' ? $1::text))
        order by a.created_at desc`,
      [id, AUDIT_ENTITY],
    );
    const versionView = (item: VersionRow) => ({
      version: item.version,
      content: item.content,
      published_at: iso(item.published_at),
      published_by: actor(item.published_by, item.published_by_name) ?? SYSTEM_ACTOR,
      reason: item.reason,
    });
    const history = audits.flatMap((entry) => {
      const action = entry.action.replace(/^iqx_template\./, '') as HistoryAction;
      if (!ACTIONS.includes(action)) return [];
      const version = entry.payload_after?.version;
      return [
        {
          action,
          at: iso(entry.created_at),
          by: actor(entry.admin_user_id, entry.admin_name) ?? SYSTEM_ACTOR,
          reason: entry.note,
          version: typeof version === 'number' ? version : null,
        },
      ];
    });
    // Versions published without an audit row (the seed) still show in the history.
    const audited = new Set(
      history.filter((item) => item.action === 'publish').map((item) => item.version),
    );
    for (const item of versions) {
      if (audited.has(item.version)) continue;
      history.push({
        action: 'publish',
        at: iso(item.published_at),
        by: actor(item.published_by, item.published_by_name) ?? SYSTEM_ACTOR,
        reason: item.reason,
        version: item.version,
      });
    }
    history.sort((a, b) => b.at.localeCompare(a.at));
    const current = versions.find((item) => item.version === row.current_version);
    return {
      ...this.listItem(row),
      draft: row.draft,
      draft_updated_by: actor(row.draft_updated_by, row.draft_updated_by_name),
      current: current ? versionView(current) : null,
      versions: versions.map(versionView),
      history,
    };
  }
}
