/**
 * Lưu trữ "SACO nhận định": bài, ảnh, tim, bình luận, báo cáo và nhật ký (migration 0047). Chỉ đọc và
 * ghi; mọi luật nghiệp vụ (ai được làm gì, thông điệp lỗi) nằm ở `SacoPostsService`.
 */

import { Injectable } from '@nestjs/common';

import type { SqlClient } from '../../platform/database/database.service.js';

export const SACO_POSTS_REPOSITORY = Symbol('SACO_POSTS_REPOSITORY');

export type DbPostStatus = 'draft' | 'published' | 'hidden';
export type DbCommentStatus = 'visible' | 'hidden' | 'deleted';
export type PostLogAction = 'publish' | 'hide' | 'unhide';
export type PostActorRole = 'saco' | 'admin' | 'team_lead';

export type SacoRow = {
  id: string;
  userId: string;
  leadUserId: string;
  displayName: string;
  active: boolean;
  onDuty: boolean;
};

/** Một bài kèm SACO, trưởng nhóm và các số đếm dành cho người xem. */
export type PostRow = {
  id: string;
  sacoId: string;
  sacoName: string;
  sacoActive: boolean;
  sacoOnDuty: boolean;
  sacoUserId: string;
  leadUserId: string;
  leadName: string;
  headline: string;
  bodyHtml: string;
  status: DbPostStatus;
  revision: number;
  createdAt: Date;
  savedAt: Date;
  publishedAt: Date | null;
  heartCount: number;
  commentCount: number;
  newComments: number;
  hearted: boolean;
};

export type ManagePostRow = {
  id: string;
  sacoId: string;
  sacoName: string;
  leadName: string;
  headline: string;
  status: DbPostStatus;
  publishedAt: Date | null;
  heartCount: number;
  commentCount: number;
  reports: number;
};

export type PostLogRow = {
  action: PostLogAction;
  actorName: string;
  actorRole: PostActorRole;
  at: Date;
};

export type ImageRow = {
  id: string;
  postId: string;
  path: string;
  mime: string;
  bytes: number;
};

export type NewImage = {
  id: string;
  postId: string;
  path: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
};

export type CommentRow = {
  id: string;
  postId: string;
  authorName: string;
  isAuthor: boolean;
  mine: boolean;
  text: string;
  createdAt: Date;
  reported: boolean;
};

/** Một bình luận kèm bài và SACO để kiểm tra quyền. */
export type CommentContext = {
  id: string;
  postId: string;
  userId: string;
  status: DbCommentStatus;
  postStatus: DbPostStatus;
  sacoUserId: string;
  sacoActive: boolean;
  leadUserId: string;
};

export type CommentReportRow = {
  commentId: string;
  postId: string;
  headline: string;
  sacoName: string;
  authorName: string;
  text: string;
  createdAt: Date;
  reports: number;
};

/** Phạm vi của một danh sách quản trị: `null` là mọi nhóm. */
export type StaffScope = { leadUserId: string | null };
export type ReportScope = { leadUserId?: string; sacoId?: string };

/**
 * Tên người viết: SACO tác giả dùng tên SACO, người khác dùng tên trên sàn rồi tới họ tên tài khoản.
 * Cần các bí danh `c` (bình luận), `s` (SACO của bài), `u` (người viết) và `tp` (hồ sơ sàn).
 */
const WRITER_NAME = `CASE WHEN c.is_author THEN s.display_name
  ELSE COALESCE(NULLIF(tp.display_name, ''), NULLIF(u.full_name, ''), 'Người dùng') END`;

const POST_COLUMNS = `
  p.id, p.saco_id AS "sacoId", s.display_name AS "sacoName", s.active AS "sacoActive",
  s.on_duty AS "sacoOnDuty", s.user_id AS "sacoUserId", s.lead_user_id AS "leadUserId",
  COALESCE(l.full_name, '') AS "leadName", p.headline, p.body_html AS "bodyHtml", p.status,
  p.revision, p.created_at AS "createdAt", p.saved_at AS "savedAt", p.published_at AS "publishedAt",
  p.heart_count AS "heartCount", p.comment_count AS "commentCount",
  (SELECT count(*)::int FROM tf_post_comments nc
    WHERE nc.post_id = p.id AND nc.status = 'visible' AND nc.user_id <> s.user_id
      AND nc.created_at > COALESCE(p.comments_seen_at, p.published_at)) AS "newComments",
  ($1::uuid IS NOT NULL AND EXISTS (
    SELECT 1 FROM tf_post_hearts h WHERE h.post_id = p.id AND h.user_id = $1::uuid)) AS hearted`;

/** `$1` của mọi truy vấn dùng POST_COLUMNS là người xem (uuid hoặc null, để tính `hearted`). */
const POST_FROM = `FROM tf_posts p
  JOIN tf_sacos s ON s.id = p.saco_id
  LEFT JOIN users l ON l.id = s.lead_user_id`;

export abstract class SacoPostsRepository {
  abstract sacoOfUser(db: SqlClient, userId: string): Promise<SacoRow | null>;
  abstract isActiveLead(db: SqlClient, userId: string): Promise<boolean>;

  abstract post(db: SqlClient, id: string, viewerId: string | null): Promise<PostRow | null>;
  /** Khoá hàng bài tới hết transaction. */
  abstract lockPost(tx: SqlClient, id: string): Promise<PostRow | null>;
  abstract listToday(
    db: SqlClient,
    from: Date,
    to: Date,
    viewerId: string,
    limit: number,
  ): Promise<PostRow[]>;

  abstract countDrafts(db: SqlClient, sacoId: string): Promise<number>;
  abstract createDraft(db: SqlClient, sacoId: string): Promise<string>;
  abstract saveDraft(
    db: SqlClient,
    input: { id: string; sacoId: string; headline: string; bodyHtml: string; baseRevision: number },
  ): Promise<{ revision: number; savedAt: Date } | null>;
  abstract publish(
    tx: SqlClient,
    input: { id: string; headline: string; bodyHtml: string },
  ): Promise<void>;
  abstract deleteDraft(tx: SqlClient, id: string, sacoId: string): Promise<boolean>;
  abstract listMine(db: SqlClient, sacoId: string, limit: number): Promise<PostRow[]>;
  abstract markCommentsSeen(db: SqlClient, id: string, sacoId: string): Promise<boolean>;

  abstract listManage(
    db: SqlClient,
    scope: StaffScope,
    status: 'published' | 'hidden' | null,
    limit: number,
  ): Promise<ManagePostRow[]>;
  abstract setStatus(
    tx: SqlClient,
    id: string,
    from: DbPostStatus,
    to: DbPostStatus,
  ): Promise<boolean>;
  abstract insertLog(
    tx: SqlClient,
    postId: string,
    action: PostLogAction,
    actorUserId: string,
    actorRole: PostActorRole,
  ): Promise<void>;
  abstract log(db: SqlClient, postId: string): Promise<PostLogRow[]>;

  abstract countImages(db: SqlClient, postId: string): Promise<number>;
  abstract insertImage(db: SqlClient, image: NewImage): Promise<void>;
  abstract image(db: SqlClient, id: string): Promise<ImageRow | null>;
  abstract imagePaths(db: SqlClient, postId: string): Promise<string[]>;

  abstract insertHeart(tx: SqlClient, postId: string, userId: string): Promise<boolean>;
  abstract deleteHeart(tx: SqlClient, postId: string, userId: string): Promise<boolean>;
  abstract bumpHearts(tx: SqlClient, postId: string, delta: number): Promise<number>;

  abstract insertComment(
    tx: SqlClient,
    input: { postId: string; userId: string; isAuthor: boolean; text: string },
  ): Promise<string>;
  abstract comment(db: SqlClient, id: string, lock: boolean): Promise<CommentContext | null>;
  abstract commentView(db: SqlClient, id: string, viewerId: string): Promise<CommentRow | null>;
  abstract listComments(
    db: SqlClient,
    postId: string,
    viewerId: string,
    limit: number,
  ): Promise<CommentRow[]>;
  abstract setCommentStatus(
    tx: SqlClient,
    id: string,
    from: readonly DbCommentStatus[],
    to: DbCommentStatus,
    moderatorId: string,
  ): Promise<boolean>;
  abstract bumpComments(tx: SqlClient, postId: string, delta: number): Promise<number>;
  abstract insertReport(tx: SqlClient, commentId: string, reporterId: string): Promise<boolean>;
  abstract commentReports(
    db: SqlClient,
    scope: ReportScope,
    limit: number,
  ): Promise<CommentReportRow[]>;
}

@Injectable()
export class PgSacoPostsRepository extends SacoPostsRepository {
  async sacoOfUser(db: SqlClient, userId: string): Promise<SacoRow | null> {
    const rows = await db.query<SacoRow>(
      `SELECT id, user_id AS "userId", lead_user_id AS "leadUserId", display_name AS "displayName",
              active, on_duty AS "onDuty"
         FROM tf_sacos WHERE user_id = $1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  async isActiveLead(db: SqlClient, userId: string): Promise<boolean> {
    const rows = await db.query(
      `SELECT 1 FROM team_lead_profiles WHERE user_id = $1 AND status = 'active'`,
      [userId],
    );
    return rows.length > 0;
  }

  async post(db: SqlClient, id: string, viewerId: string | null): Promise<PostRow | null> {
    const rows = await db.query<PostRow>(`SELECT ${POST_COLUMNS} ${POST_FROM} WHERE p.id = $2`, [
      viewerId,
      id,
    ]);
    return rows[0] ?? null;
  }

  async lockPost(tx: SqlClient, id: string): Promise<PostRow | null> {
    const rows = await tx.query<PostRow>(
      `SELECT ${POST_COLUMNS} ${POST_FROM} WHERE p.id = $2 FOR UPDATE OF p`,
      [null, id],
    );
    return rows[0] ?? null;
  }

  listToday(db: SqlClient, from: Date, to: Date, viewerId: string, limit: number) {
    return db.query<PostRow>(
      `SELECT ${POST_COLUMNS} ${POST_FROM}
        WHERE p.status = 'published' AND s.active
          AND p.published_at >= $2 AND p.published_at < $3
        ORDER BY p.published_at DESC, p.id DESC
        LIMIT $4`,
      [viewerId, from, to, limit],
    );
  }

  async countDrafts(db: SqlClient, sacoId: string): Promise<number> {
    const rows = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tf_posts WHERE saco_id = $1 AND status = 'draft'`,
      [sacoId],
    );
    return rows[0]?.n ?? 0;
  }

  async createDraft(db: SqlClient, sacoId: string): Promise<string> {
    const rows = await db.query<{ id: string }>(
      `INSERT INTO tf_posts (saco_id) VALUES ($1) RETURNING id`,
      [sacoId],
    );
    return rows[0]!.id;
  }

  async saveDraft(
    db: SqlClient,
    input: { id: string; sacoId: string; headline: string; bodyHtml: string; baseRevision: number },
  ): Promise<{ revision: number; savedAt: Date } | null> {
    const rows = await db.query<{ revision: number; savedAt: Date }>(
      `UPDATE tf_posts
          SET headline = $3, body_html = $4, revision = revision + 1, saved_at = now()
        WHERE id = $1 AND saco_id = $2 AND status = 'draft' AND revision = $5
        RETURNING revision, saved_at AS "savedAt"`,
      [input.id, input.sacoId, input.headline, input.bodyHtml, input.baseRevision],
    );
    return rows[0] ?? null;
  }

  async publish(
    tx: SqlClient,
    input: { id: string; headline: string; bodyHtml: string },
  ): Promise<void> {
    await tx.query(
      `UPDATE tf_posts
          SET headline = $2, body_html = $3, status = 'published', published_at = now(),
              revision = revision + 1, saved_at = now()
        WHERE id = $1`,
      [input.id, input.headline, input.bodyHtml],
    );
  }

  async deleteDraft(tx: SqlClient, id: string, sacoId: string): Promise<boolean> {
    const rows = await tx.query(
      `DELETE FROM tf_posts WHERE id = $1 AND saco_id = $2 AND status = 'draft' RETURNING id`,
      [id, sacoId],
    );
    return rows.length > 0;
  }

  listMine(db: SqlClient, sacoId: string, limit: number) {
    return db.query<PostRow>(
      `SELECT ${POST_COLUMNS} ${POST_FROM}
        WHERE p.saco_id = $2
        ORDER BY COALESCE(p.published_at, p.saved_at) DESC, p.id DESC
        LIMIT $3`,
      [null, sacoId, limit],
    );
  }

  async markCommentsSeen(db: SqlClient, id: string, sacoId: string): Promise<boolean> {
    const rows = await db.query(
      `UPDATE tf_posts SET comments_seen_at = now() WHERE id = $1 AND saco_id = $2 RETURNING id`,
      [id, sacoId],
    );
    return rows.length > 0;
  }

  listManage(
    db: SqlClient,
    scope: StaffScope,
    status: 'published' | 'hidden' | null,
    limit: number,
  ): Promise<ManagePostRow[]> {
    return db.query<ManagePostRow>(
      `SELECT p.id, p.saco_id AS "sacoId", s.display_name AS "sacoName",
              COALESCE(l.full_name, '') AS "leadName", p.headline, p.status,
              p.published_at AS "publishedAt", p.heart_count AS "heartCount",
              p.comment_count AS "commentCount",
              (SELECT count(*)::int FROM tf_post_comment_reports r
                 JOIN tf_post_comments c ON c.id = r.comment_id
                WHERE c.post_id = p.id AND c.status = 'visible') AS reports
         FROM tf_posts p
         JOIN tf_sacos s ON s.id = p.saco_id
         LEFT JOIN users l ON l.id = s.lead_user_id
        WHERE p.status IN ('published', 'hidden')
          AND ($1::text IS NULL OR p.status = $1)
          AND ($2::uuid IS NULL OR s.lead_user_id = $2)
        ORDER BY p.published_at DESC, p.id DESC
        LIMIT $3`,
      [status, scope.leadUserId, limit],
    ) as Promise<ManagePostRow[]>;
  }

  async setStatus(
    tx: SqlClient,
    id: string,
    from: DbPostStatus,
    to: DbPostStatus,
  ): Promise<boolean> {
    const rows = await tx.query(
      `UPDATE tf_posts SET status = $3 WHERE id = $1 AND status = $2 RETURNING id`,
      [id, from, to],
    );
    return rows.length > 0;
  }

  async insertLog(
    tx: SqlClient,
    postId: string,
    action: PostLogAction,
    actorUserId: string,
    actorRole: PostActorRole,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO tf_post_log (post_id, action, actor_user_id, actor_role) VALUES ($1, $2, $3, $4)`,
      [postId, action, actorUserId, actorRole],
    );
  }

  log(db: SqlClient, postId: string): Promise<PostLogRow[]> {
    return db.query<PostLogRow>(
      `SELECT g.action, COALESCE(u.full_name, '') AS "actorName", g.actor_role AS "actorRole",
              g.created_at AS at
         FROM tf_post_log g LEFT JOIN users u ON u.id = g.actor_user_id
        WHERE g.post_id = $1 ORDER BY g.id`,
      [postId],
    ) as Promise<PostLogRow[]>;
  }

  async countImages(db: SqlClient, postId: string): Promise<number> {
    const rows = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tf_post_images WHERE post_id = $1`,
      [postId],
    );
    return rows[0]?.n ?? 0;
  }

  async insertImage(db: SqlClient, image: NewImage): Promise<void> {
    await db.query(
      `INSERT INTO tf_post_images (id, post_id, path, mime, bytes, width, height)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [image.id, image.postId, image.path, image.mime, image.bytes, image.width, image.height],
    );
  }

  async image(db: SqlClient, id: string): Promise<ImageRow | null> {
    const rows = await db.query<ImageRow>(
      `SELECT id, post_id AS "postId", path, mime, bytes FROM tf_post_images WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async imagePaths(db: SqlClient, postId: string): Promise<string[]> {
    const rows = await db.query<{ path: string }>(
      `SELECT path FROM tf_post_images WHERE post_id = $1`,
      [postId],
    );
    return rows.map((row) => row.path);
  }

  async insertHeart(tx: SqlClient, postId: string, userId: string): Promise<boolean> {
    const rows = await tx.query(
      `INSERT INTO tf_post_hearts (post_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING post_id`,
      [postId, userId],
    );
    return rows.length > 0;
  }

  async deleteHeart(tx: SqlClient, postId: string, userId: string): Promise<boolean> {
    const rows = await tx.query(
      `DELETE FROM tf_post_hearts WHERE post_id = $1 AND user_id = $2 RETURNING post_id`,
      [postId, userId],
    );
    return rows.length > 0;
  }

  async bumpHearts(tx: SqlClient, postId: string, delta: number): Promise<number> {
    const rows = await tx.query<{ n: number }>(
      `UPDATE tf_posts SET heart_count = GREATEST(heart_count + $2, 0) WHERE id = $1
       RETURNING heart_count AS n`,
      [postId, delta],
    );
    return rows[0]?.n ?? 0;
  }

  async insertComment(
    tx: SqlClient,
    input: { postId: string; userId: string; isAuthor: boolean; text: string },
  ): Promise<string> {
    const rows = await tx.query<{ id: string }>(
      `INSERT INTO tf_post_comments (post_id, user_id, is_author, text)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [input.postId, input.userId, input.isAuthor, input.text],
    );
    return rows[0]!.id;
  }

  async comment(db: SqlClient, id: string, lock: boolean): Promise<CommentContext | null> {
    const rows = await db.query<CommentContext>(
      `SELECT c.id, c.post_id AS "postId", c.user_id AS "userId", c.status,
              p.status AS "postStatus", s.user_id AS "sacoUserId", s.active AS "sacoActive",
              s.lead_user_id AS "leadUserId"
         FROM tf_post_comments c
         JOIN tf_posts p ON p.id = c.post_id
         JOIN tf_sacos s ON s.id = p.saco_id
        WHERE c.id = $1${lock ? ' FOR UPDATE OF c' : ''}`,
      [id],
    );
    return rows[0] ?? null;
  }

  async commentView(db: SqlClient, id: string, viewerId: string): Promise<CommentRow | null> {
    const rows = await db.query<CommentRow>(
      `SELECT c.id, c.post_id AS "postId", ${WRITER_NAME} AS "authorName",
              c.is_author AS "isAuthor", (c.user_id = $2) AS mine, c.text,
              c.created_at AS "createdAt",
              EXISTS (SELECT 1 FROM tf_post_comment_reports r
                       WHERE r.comment_id = c.id AND r.reporter_user_id = $2) AS reported
         FROM tf_post_comments c
         JOIN tf_posts p ON p.id = c.post_id
         JOIN tf_sacos s ON s.id = p.saco_id
         JOIN users u ON u.id = c.user_id
         LEFT JOIN tf_profiles tp ON tp.user_id = c.user_id
        WHERE c.id = $1`,
      [id, viewerId],
    );
    return rows[0] ?? null;
  }

  listComments(
    db: SqlClient,
    postId: string,
    viewerId: string,
    limit: number,
  ): Promise<CommentRow[]> {
    return db.query<CommentRow>(
      `SELECT c.id, c.post_id AS "postId", ${WRITER_NAME} AS "authorName",
              c.is_author AS "isAuthor", (c.user_id = $2) AS mine, c.text,
              c.created_at AS "createdAt",
              EXISTS (SELECT 1 FROM tf_post_comment_reports r
                       WHERE r.comment_id = c.id AND r.reporter_user_id = $2) AS reported
         FROM tf_post_comments c
         JOIN tf_posts p ON p.id = c.post_id
         JOIN tf_sacos s ON s.id = p.saco_id
         JOIN users u ON u.id = c.user_id
         LEFT JOIN tf_profiles tp ON tp.user_id = c.user_id
        WHERE c.post_id = $1 AND c.status = 'visible'
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT $3`,
      [postId, viewerId, limit],
    ) as Promise<CommentRow[]>;
  }

  async setCommentStatus(
    tx: SqlClient,
    id: string,
    from: readonly DbCommentStatus[],
    to: DbCommentStatus,
    moderatorId: string,
  ): Promise<boolean> {
    const rows = await tx.query(
      `UPDATE tf_post_comments SET status = $3, moderated_by = $4, moderated_at = now()
        WHERE id = $1 AND status = ANY($2::text[]) RETURNING id`,
      [id, [...from], to, moderatorId],
    );
    return rows.length > 0;
  }

  async bumpComments(tx: SqlClient, postId: string, delta: number): Promise<number> {
    const rows = await tx.query<{ n: number }>(
      `UPDATE tf_posts SET comment_count = GREATEST(comment_count + $2, 0) WHERE id = $1
       RETURNING comment_count AS n`,
      [postId, delta],
    );
    return rows[0]?.n ?? 0;
  }

  async insertReport(tx: SqlClient, commentId: string, reporterId: string): Promise<boolean> {
    const rows = await tx.query(
      `INSERT INTO tf_post_comment_reports (comment_id, reporter_user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING comment_id`,
      [commentId, reporterId],
    );
    return rows.length > 0;
  }

  commentReports(db: SqlClient, scope: ReportScope, limit: number): Promise<CommentReportRow[]> {
    return db.query<CommentReportRow>(
      `SELECT c.id AS "commentId", c.post_id AS "postId", p.headline, s.display_name AS "sacoName",
              ${WRITER_NAME} AS "authorName", c.text, c.created_at AS "createdAt",
              (SELECT count(*)::int FROM tf_post_comment_reports r WHERE r.comment_id = c.id) AS reports
         FROM tf_post_comments c
         JOIN tf_posts p ON p.id = c.post_id
         JOIN tf_sacos s ON s.id = p.saco_id
         JOIN users u ON u.id = c.user_id
         LEFT JOIN tf_profiles tp ON tp.user_id = c.user_id
        WHERE c.status = 'visible'
          AND EXISTS (SELECT 1 FROM tf_post_comment_reports r WHERE r.comment_id = c.id)
          AND ($1::uuid IS NULL OR s.lead_user_id = $1)
          AND ($2::uuid IS NULL OR s.id = $2)
        ORDER BY reports DESC, c.created_at DESC
        LIMIT $3`,
      [scope.leadUserId ?? null, scope.sacoId ?? null, limit],
    ) as Promise<CommentReportRow[]>;
  }
}
