import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, realpath, rename, stat, unlink } from 'node:fs/promises';
import { extname, isAbsolute, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fileTypeFromFile } from 'file-type';

import type { Environment } from '../../../platform/config/environment.js';
import { DatabaseService } from '../../../platform/database/index.js';
import type { AuthenticatedUser } from '../../auth/index.js';
import type { CreateMeetingBody, UpdateMeetingBody } from '../office.schemas.js';
import { ictDateString, ictNowParts } from '../office.time.js';
import {
  OFFICE_ALLOWED_DOC_EXTS,
  OFFICE_DOC_TOKEN_TTL_SECONDS,
  OFFICE_MAX_DOC_SIZE_BYTES,
  type OfficeAccessContext,
  type OfficeAllowedDocExt,
} from '../office.types.js';
import { OfficeHub } from '../realtime/office.hub.js';
import { OfficeAccessService } from './office-access.service.js';

export const OFFICE_ROOMS_CLOCK = Symbol('OFFICE_ROOMS_CLOCK');

const DEV_OFFICE_DOC_SECRET = 'iqx-dev-office-document-signing-secret-not-for-production';

const ALLOWED_MIME_TO_EXT: Readonly<Record<string, OfficeAllowedDocExt>> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

type MeetingDbRow = {
  id: string;
  title: string;
  starts_at: Date | string;
  duration_minutes: number;
  platform: string;
  meeting_url: string;
  agenda: unknown;
  recurrence_weekly: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

type DocumentDbRow = {
  id: string;
  team_id: string;
  title: string;
  file_name: string;
  file_ext: string;
  mime_type: string;
  size_bytes: number;
  storage_rel_path: string;
  created_at: Date | string;
};

type DocTokenPayload = {
  docId: string;
  teamId: string;
  exp: number;
};

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const parseAgenda = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
};

const sanitizeFileName = (raw: string): string => {
  const base = raw
    .replace(/[/\\]/g, '_')
    .replace(/[\r\n\0"]/g, '')
    .trim();
  return base.slice(0, 180) || 'document';
};

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const isDocTokenPayload = (value: unknown): value is DocTokenPayload => {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.docId === 'string' &&
    isUuid(obj.docId) &&
    typeof obj.teamId === 'string' &&
    isUuid(obj.teamId) &&
    typeof obj.exp === 'number' &&
    Number.isFinite(obj.exp)
  );
};

/** Advances a weekly recurring meeting's start timestamp so its next occurrence is today or future. */
function effectiveMeetingStart(
  startsAt: Date,
  durationMinutes: number,
  recurrenceWeekly: boolean,
  now: Date,
): Date {
  if (!recurrenceWeekly) return startsAt;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const endMs = startsAt.getTime() + durationMinutes * 60_000;
  if (endMs >= now.getTime()) return startsAt;
  const weeksBehind = Math.floor((now.getTime() - endMs) / weekMs) + 1;
  return new Date(startsAt.getTime() + weeksBehind * weekMs);
}

@Injectable()
export class OfficeRoomsService {
  private readonly now: () => Date;

  constructor(
    private readonly database: DatabaseService,
    private readonly access: OfficeAccessService,
    private readonly config: ConfigService<Environment, true>,
    private readonly hub: OfficeHub,
    @Optional() @Inject(OFFICE_ROOMS_CLOCK) now?: () => Date,
  ) {
    this.now = now ?? (() => new Date());
  }

  // ───────────── Meetings ─────────────

  async listMeetings(user: AuthenticatedUser) {
    const ctx = await this.access.requireMember(user);
    const now = this.now();
    const todayDate = ictNowParts(now).date;

    const rows = await this.database.query<MeetingDbRow>(
      `select id, title, starts_at, duration_minutes, platform, meeting_url,
              agenda, recurrence_weekly, created_at, updated_at
         from office_meetings
        where team_id = $1
        order by starts_at asc, id asc`,
      [ctx.team.id],
    );

    const mapped = rows
      .map((row) => {
        const rawStart = row.starts_at instanceof Date ? row.starts_at : new Date(row.starts_at);
        const start = effectiveMeetingStart(
          rawStart,
          row.duration_minutes,
          row.recurrence_weekly,
          now,
        );
        return {
          id: row.id,
          title: row.title,
          startsAt: start.toISOString(),
          durationMinutes: row.duration_minutes,
          platform: row.platform,
          meetingUrl: row.meeting_url,
          agenda: parseAgenda(row.agenda),
          recurrenceWeekly: row.recurrence_weekly,
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
          _startMs: start.getTime(),
          _endMs: start.getTime() + row.duration_minutes * 60_000,
          _ictDate: ictDateString(start),
        };
      })
      .sort((a, b) => a._startMs - b._startMs);

    const strip = ({ _startMs: _a, _endMs: _b, _ictDate: _c, ...item }: (typeof mapped)[number]) =>
      item;

    const today = mapped.filter((m) => m._ictDate === todayDate).map(strip);
    const upcoming = mapped.filter((m) => m._ictDate > todayDate).map(strip);
    const nextWall = mapped.find((m) => m._endMs >= now.getTime()) ?? mapped[0] ?? null;

    return {
      todayDate,
      today,
      upcoming,
      nextWallMeeting: nextWall ? strip(nextWall) : null,
    };
  }

  async createMeeting(user: AuthenticatedUser, body: CreateMeetingBody) {
    const ctx = await this.access.requireBoss(user);
    const now = this.now();

    const [row] = await this.database.query<MeetingDbRow>(
      `insert into office_meetings
         (team_id, created_by, title, starts_at, duration_minutes, platform, meeting_url, agenda, recurrence_weekly, created_at, updated_at)
       values ($1, $2, $3, $4::timestamptz, $5, $6, $7, $8::jsonb, $9, $10, $10)
       returning id, title, starts_at, duration_minutes, platform, meeting_url,
                 agenda, recurrence_weekly, created_at, updated_at`,
      [
        ctx.team.id,
        user.id,
        body.title,
        body.startsAt,
        body.durationMinutes,
        body.platform,
        body.meetingUrl,
        JSON.stringify(body.agenda),
        body.recurrenceWeekly,
        now,
      ],
    );

    this.hub.broadcastSync(ctx.team.id, 'meetings');
    return this.mapMeeting(row!);
  }

  async updateMeeting(user: AuthenticatedUser, meetingId: string, body: UpdateMeetingBody) {
    const ctx = await this.access.requireBoss(user);
    const now = this.now();

    const [row] = await this.database.query<MeetingDbRow>(
      `update office_meetings
          set title = coalesce($3, title),
              starts_at = coalesce($4::timestamptz, starts_at),
              duration_minutes = coalesce($5, duration_minutes),
              platform = coalesce($6, platform),
              meeting_url = coalesce($7, meeting_url),
              agenda = coalesce($8::jsonb, agenda),
              recurrence_weekly = coalesce($9, recurrence_weekly),
              updated_at = $10
        where id = $1 and team_id = $2
        returning id, title, starts_at, duration_minutes, platform, meeting_url,
                  agenda, recurrence_weekly, created_at, updated_at`,
      [
        meetingId,
        ctx.team.id,
        body.title ?? null,
        body.startsAt ?? null,
        body.durationMinutes ?? null,
        body.platform ?? null,
        body.meetingUrl ?? null,
        body.agenda !== undefined ? JSON.stringify(body.agenda) : null,
        body.recurrenceWeekly ?? null,
        now,
      ],
    );

    if (!row) {
      throw new NotFoundException({
        code: 'OFFICE_MEETING_NOT_FOUND',
        message: 'Không tìm thấy cuộc họp.',
      });
    }

    this.hub.broadcastSync(ctx.team.id, 'meetings');
    return this.mapMeeting(row);
  }

  async deleteMeeting(user: AuthenticatedUser, meetingId: string) {
    const ctx = await this.access.requireBoss(user);
    const deleted = await this.database.query<{ id: string }>(
      `delete from office_meetings where id = $1 and team_id = $2 returning id`,
      [meetingId, ctx.team.id],
    );
    if (deleted.length === 0) {
      throw new NotFoundException({
        code: 'OFFICE_MEETING_NOT_FOUND',
        message: 'Không tìm thấy cuộc họp.',
      });
    }
    this.hub.broadcastSync(ctx.team.id, 'meetings');
    return { ok: true as const };
  }

  private mapMeeting(row: MeetingDbRow) {
    return {
      id: row.id,
      title: row.title,
      startsAt: iso(row.starts_at),
      durationMinutes: row.duration_minutes,
      platform: row.platform,
      meetingUrl: row.meeting_url,
      agenda: parseAgenda(row.agenda),
      recurrenceWeekly: row.recurrence_weekly,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    };
  }

  // ───────────── Documents ─────────────

  async listDocuments(user: AuthenticatedUser) {
    const ctx = await this.access.requireMember(user);
    const rows = await this.database.query<DocumentDbRow>(
      `select id, team_id, title, file_name, file_ext, mime_type, size_bytes, storage_rel_path, created_at
         from office_documents
        where team_id = $1
        order by created_at desc, id desc`,
      [ctx.team.id],
    );

    return {
      items: rows.map((row) => this.mapDocument(row)),
      maxSizeBytes: OFFICE_MAX_DOC_SIZE_BYTES,
      allowedExts: [...OFFICE_ALLOWED_DOC_EXTS],
    };
  }

  async uploadDocument(
    user: AuthenticatedUser,
    input: {
      stream: AsyncIterable<Buffer | Uint8Array>;
      fileName: string;
      title?: string;
    },
    precheckedCtx?: OfficeAccessContext,
  ) {
    const ctx = precheckedCtx ?? (await this.access.requireBoss(user));
    const docId = randomUUID();
    const safeFileName = sanitizeFileName(input.fileName);
    const rawTitle =
      (input.title ?? '').trim() || safeFileName.replace(/\.[^.]+$/, '') || safeFileName;
    const title = rawTitle.slice(0, 160);

    const stored = await this.storeDocumentStream(ctx.team.id, docId, safeFileName, input.stream);
    const now = this.now();

    try {
      const [row] = await this.database.query<DocumentDbRow>(
        `insert into office_documents
           (id, team_id, uploaded_by, title, file_name, file_ext, mime_type, size_bytes, storage_rel_path, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id, team_id, title, file_name, file_ext, mime_type, size_bytes, storage_rel_path, created_at`,
        [
          docId,
          ctx.team.id,
          user.id,
          title,
          safeFileName,
          stored.ext,
          stored.mimeType,
          stored.sizeBytes,
          stored.relativePath,
          now,
        ],
      );
      this.hub.broadcastSync(ctx.team.id, 'documents');
      return this.mapDocument(row!);
    } catch (error) {
      await this.removeStoredFile(stored.relativePath);
      throw error;
    }
  }

  async resolveDownload(
    docId: string,
    token: string,
  ): Promise<{ path: string; size: number; mimeType: string; fileName: string }> {
    const payload = this.verifyDownloadToken(token);
    if (payload.docId !== docId) {
      throw this.invalidToken();
    }

    const [doc] = await this.database.query<DocumentDbRow>(
      `select id, team_id, title, file_name, file_ext, mime_type, size_bytes, storage_rel_path, created_at
         from office_documents
        where id = $1 and team_id = $2`,
      [docId, payload.teamId],
    );
    if (!doc) {
      throw new NotFoundException({
        code: 'OFFICE_DOCUMENT_NOT_FOUND',
        message: 'Không tìm thấy tài liệu.',
      });
    }

    const lexicalPath = this.resolveWithinRoot(doc.storage_rel_path);
    try {
      const canonicalRoot = await realpath(this.mediaRoot());
      const canonicalFile = await realpath(lexicalPath);
      this.assertWithin(canonicalRoot, canonicalFile);
      const info = await stat(canonicalFile);
      if (!info.isFile()) throw new Error('not a file');
      return {
        path: canonicalFile,
        size: info.size,
        mimeType: doc.mime_type,
        fileName: doc.file_name,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new NotFoundException({
        code: 'OFFICE_DOCUMENT_UNAVAILABLE',
        message: 'Tệp tài liệu không tồn tại trên hệ thống lưu trữ.',
      });
    }
  }

  openReadStream(filePath: string): Readable {
    return createReadStream(filePath);
  }

  async deleteDocument(user: AuthenticatedUser, docId: string) {
    const ctx = await this.access.requireBoss(user);
    const deleted = await this.database.query<{ storage_rel_path: string }>(
      `delete from office_documents
        where id = $1 and team_id = $2
        returning storage_rel_path`,
      [docId, ctx.team.id],
    );
    const row = deleted[0];
    if (!row) {
      throw new NotFoundException({
        code: 'OFFICE_DOCUMENT_NOT_FOUND',
        message: 'Không tìm thấy tài liệu.',
      });
    }
    await this.removeStoredFile(row.storage_rel_path);
    this.hub.broadcastSync(ctx.team.id, 'documents');
    return { ok: true as const };
  }

  signDownloadToken(
    docId: string,
    teamId: string,
    ttlSeconds = OFFICE_DOC_TOKEN_TTL_SECONDS,
  ): string {
    const payload: DocTokenPayload = {
      docId,
      teamId,
      exp: Math.floor(this.now().getTime() / 1000) + Math.max(10, Math.min(ttlSeconds, 3600)),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.signingSecret())
      .update(`office-doc:${encoded}`)
      .digest('base64url');
    return `${encoded}.${sig}`;
  }

  verifyDownloadToken(token: string): DocTokenPayload {
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra) throw this.invalidToken();
    const expected = createHmac('sha256', this.signingSecret())
      .update(`office-doc:${encoded}`)
      .digest();
    let supplied: Buffer;
    try {
      supplied = Buffer.from(signature, 'base64url');
    } catch {
      throw this.invalidToken();
    }
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw this.invalidToken();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      throw this.invalidToken();
    }
    if (!isDocTokenPayload(parsed) || parsed.exp < Math.floor(this.now().getTime() / 1000)) {
      throw this.invalidToken();
    }
    return parsed;
  }

  private mapDocument(row: DocumentDbRow) {
    const token = this.signDownloadToken(row.id, row.team_id);
    return {
      id: row.id,
      title: row.title,
      fileName: row.file_name,
      fileExt: row.file_ext,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      downloadUrl: `/api/v2/office/documents/${row.id}/download?token=${encodeURIComponent(token)}`,
      createdAt: iso(row.created_at),
    };
  }

  private async storeDocumentStream(
    teamId: string,
    docId: string,
    originalFileName: string,
    stream: AsyncIterable<Buffer | Uint8Array>,
  ): Promise<{
    ext: OfficeAllowedDocExt;
    mimeType: string;
    sizeBytes: number;
    relativePath: string;
  }> {
    const root = this.mediaRoot();
    if (!isUuid(teamId)) {
      throw new BadRequestException({
        code: 'OFFICE_INVALID_TEAM',
        message: 'Mã nhóm không hợp lệ.',
      });
    }

    await mkdir(root, { recursive: true, mode: 0o700 });
    const canonicalRoot = await realpath(root);
    const tmpDir = resolve(canonicalRoot, '.tmp');
    await mkdir(tmpDir, { recursive: true, mode: 0o700 });
    const canonicalTmpDir = await realpath(tmpDir);
    this.assertWithin(canonicalRoot, canonicalTmpDir);

    const tmpPath = resolve(canonicalTmpDir, `office-${docId}`);
    const handle = await open(tmpPath, 'wx', 0o600);
    let sizeBytes = 0;

    try {
      for await (const incoming of stream) {
        const chunk = Buffer.from(incoming);
        sizeBytes += chunk.length;
        if (sizeBytes > OFFICE_MAX_DOC_SIZE_BYTES) {
          throw new PayloadTooLargeException({
            code: 'OFFICE_DOCUMENT_TOO_LARGE',
            message: 'Tệp vượt quá giới hạn 20 MB.',
          });
        }
        let offset = 0;
        while (offset < chunk.length) {
          const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
          if (bytesWritten <= 0) throw new Error('Unable to write uploaded office document');
          offset += bytesWritten;
        }
      }

      await handle.close();

      if (sizeBytes === 0) {
        throw new BadRequestException({
          code: 'OFFICE_EMPTY_FILE',
          message: 'Tệp tải lên đang trống.',
        });
      }

      // Inspect full file with fileTypeFromFile so OOXML (.docx, .xlsx, .pptx) is accurately
      // distinguished from plain .zip archives.
      const detected = await fileTypeFromFile(tmpPath);
      const ext = detected?.mime ? ALLOWED_MIME_TO_EXT[detected.mime] : undefined;
      if (!detected || !ext) {
        throw new UnsupportedMediaTypeException({
          code: 'OFFICE_UNSUPPORTED_FILE_TYPE',
          message: 'Chỉ hỗ trợ định dạng PDF, DOCX, XLSX, PPTX, PNG, JPG.',
        });
      }

      const declaredExt = extname(originalFileName).replace(/^\./, '').toLowerCase();
      const normalizedDeclared = declaredExt === 'jpeg' ? 'jpg' : declaredExt;
      if (normalizedDeclared && normalizedDeclared !== ext) {
        throw new UnsupportedMediaTypeException({
          code: 'OFFICE_FILE_EXTENSION_MISMATCH',
          message: 'Phần mở rộng tệp không khớp với định dạng thật của tệp.',
        });
      }

      const docsRoot = resolve(canonicalRoot, 'office-docs');
      await mkdir(docsRoot, { recursive: true, mode: 0o700 });
      const canonicalDocsRoot = await realpath(docsRoot);
      this.assertWithin(canonicalRoot, canonicalDocsRoot);

      const teamDir = resolve(canonicalDocsRoot, teamId);
      await mkdir(teamDir, { recursive: true, mode: 0o700 });
      const canonicalTeamDir = await realpath(teamDir);
      this.assertWithin(canonicalDocsRoot, canonicalTeamDir);

      const relativePath = `office-docs/${teamId}/${docId}.${ext}`;
      const destination = resolve(canonicalTeamDir, `${docId}.${ext}`);
      await rename(tmpPath, destination);

      return { ext, mimeType: detected.mime, sizeBytes, relativePath };
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(tmpPath).catch(() => undefined);
      throw error;
    }
  }

  private async removeStoredFile(relativePath: string): Promise<void> {
    try {
      const canonicalRoot = await realpath(this.mediaRoot());
      const canonicalTarget = await realpath(this.resolveWithinRoot(relativePath));
      this.assertWithin(canonicalRoot, canonicalTarget);
      await unlink(canonicalTarget);
    } catch {
      // Best-effort file cleanup.
    }
  }

  private mediaRoot(): string {
    const configured = this.config.get('MEDIA_ROOT', { infer: true });
    if (!configured || !isAbsolute(configured)) {
      throw new ServiceUnavailableException({
        code: 'OFFICE_STORAGE_NOT_CONFIGURED',
        message: 'Kho lưu trữ tài liệu chưa được cấu hình.',
      });
    }
    return resolve(configured);
  }

  private signingSecret(): string {
    const configured = this.config.get('MEDIA_SIGNING_SECRET', { infer: true });
    if (configured && configured.length >= 32) return configured;
    const env = this.config.get('APP_ENV', { infer: true });
    if (env === 'production') {
      throw new ServiceUnavailableException({
        code: 'OFFICE_STORAGE_NOT_CONFIGURED',
        message: 'Khóa ký tài liệu chưa được cấu hình.',
      });
    }
    return DEV_OFFICE_DOC_SECRET;
  }

  private resolveWithinRoot(relativePath: string): string {
    if (!relativePath || relativePath.includes('\0') || isAbsolute(relativePath)) {
      throw new BadRequestException({
        code: 'OFFICE_INVALID_DOC_PATH',
        message: 'Đường dẫn tài liệu không hợp lệ.',
      });
    }
    const root = this.mediaRoot();
    const target = resolve(root, relativePath);
    if (!target.startsWith(`${root}${sep}`)) {
      throw new BadRequestException({
        code: 'OFFICE_INVALID_DOC_PATH',
        message: 'Đường dẫn tài liệu không hợp lệ.',
      });
    }
    return target;
  }

  private assertWithin(root: string, target: string): void {
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      throw new BadRequestException({
        code: 'OFFICE_INVALID_DOC_PATH',
        message: 'Đường dẫn tài liệu không hợp lệ.',
      });
    }
  }

  private invalidToken(): BadRequestException {
    return new BadRequestException({
      code: 'OFFICE_DOC_TOKEN_INVALID',
      message: 'Liên kết tải tài liệu không hợp lệ hoặc đã hết hạn.',
    });
  }
}
