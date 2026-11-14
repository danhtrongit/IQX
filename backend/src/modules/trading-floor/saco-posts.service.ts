/**
 * SACO nhận định (spec "SACO nhận định"): người dùng đọc bài, thả tim, bình luận; SACO viết nháp,
 * đăng và theo dõi bài của mình; quản trị viên và trưởng nhóm ẩn bài vi phạm.
 *
 * Sự kiện thời gian thực (`post:new`, `post:hidden`, `post:heart`, `post:comment`) chỉ phát sau khi
 * transaction đã commit, qua `FloorEvents`.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { recordAudit, type AuditContext } from '../users/audit.js';
import { FloorEvents } from './floor-events.js';
import {
  charLength,
  cleanHeadline,
  isBodyEmpty,
  sanitizePostHtml,
  truncateChars,
} from './post-html.js';
import { SacoPostsImagesService, POST_IMAGES_PER_POST } from './saco-posts-images.service.js';
import { cleanComment, vnDateString, vnDayStart, vnNextDayStart } from './saco-posts.logic.js';
import {
  SACO_POSTS_REPOSITORY,
  SacoPostsRepository,
  type CommentRow,
  type ManagePostRow,
  type PostRow,
  type SacoRow,
  type StaffScope,
} from './saco-posts.repository.js';
import type {
  CommentReport,
  DraftBody,
  ManagePost,
  ManagePostDetail,
  MyPost,
  MyPostDetail,
  PostCard,
  PostComment,
  PostDetail,
} from './saco-posts.schemas.js';

/** Số bài hôm nay tối đa trả về một lần. */
export const TODAY_LIMIT = 100;
/** Số bình luận tối đa trả về một lần. */
export const COMMENTS_LIMIT = 200;
const MY_POSTS_LIMIT = 200;
const MANAGE_POSTS_LIMIT = 200;
const REPORTS_LIMIT = 200;
const MAX_DRAFTS = 50;
export const HEADLINE_MAX = 90;
export const HEADLINE_DRAFT_MAX = 200;
export const COMMENT_MAX = 500;
/** Khoảng cách tối thiểu giữa hai bình luận của một người. */
export const COMMENT_COOLDOWN_MS = 3_000;
/** Token để thay khoảng cách giữa hai bình luận (bài kiểm thử dùng giá trị ngắn). */
export const SACO_COMMENT_COOLDOWN_MS = Symbol('SACO_COMMENT_COOLDOWN_MS');

const ms = (value: Date | string): number => new Date(value).getTime();

const unavailable = () =>
  new GoneException({ code: 'POST_UNAVAILABLE', message: 'Bài viết không còn hiển thị' });
const postNotFound = () =>
  new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Không tìm thấy bài viết' });
const commentNotFound = () =>
  new NotFoundException({ code: 'COMMENT_NOT_FOUND', message: 'Không tìm thấy bình luận' });
const notDraft = (message = 'Bài đã đăng, không sửa được') =>
  new ConflictException({ code: 'POST_NOT_DRAFT', message });
const draftStale = () =>
  new ConflictException({ code: 'DRAFT_STALE', message: 'Nháp đã được sửa ở nơi khác' });
const invalid = (code: string, message: string) =>
  new UnprocessableEntityException({ code, message });

const toCard = (row: PostRow, hearted = row.hearted): PostCard => ({
  id: row.id,
  sacoId: row.sacoId,
  sacoName: row.sacoName,
  headline: row.headline,
  publishedAt: row.publishedAt ? ms(row.publishedAt) : 0,
  hearts: row.heartCount,
  comments: row.commentCount,
  hearted,
});

const toMyPost = (row: PostRow): MyPost => ({
  id: row.id,
  headline: row.headline,
  status: row.status,
  savedAt: ms(row.savedAt),
  publishedAt: row.publishedAt ? ms(row.publishedAt) : null,
  hearts: row.heartCount,
  comments: row.commentCount,
  newComments: row.newComments,
});

const toMyPostDetail = (row: PostRow): MyPostDetail => ({
  ...toMyPost(row),
  bodyHtml: sanitizePostHtml(row.bodyHtml),
  revision: row.revision,
});

const toComment = (row: CommentRow): PostComment => ({
  id: row.id,
  postId: row.postId,
  authorName: row.authorName,
  isAuthor: row.isAuthor,
  mine: row.mine,
  text: row.text,
  at: ms(row.createdAt),
  reported: row.reported,
});

const toManagePost = (row: ManagePostRow): ManagePost => ({
  id: row.id,
  sacoId: row.sacoId,
  sacoName: row.sacoName,
  leadName: row.leadName,
  headline: row.headline,
  status: row.status,
  publishedAt: row.publishedAt ? ms(row.publishedAt) : null,
  hearts: row.heartCount,
  comments: row.commentCount,
  reports: row.reports,
});

@Injectable()
export class SacoPostsService {
  private readonly lastComment = new Map<string, number>();

  constructor(
    private readonly database: DatabaseService,
    @Inject(SACO_POSTS_REPOSITORY) private readonly repository: SacoPostsRepository,
    private readonly images: SacoPostsImagesService,
    private readonly events: FloorEvents,
    @Inject(SACO_COMMENT_COOLDOWN_MS) private readonly commentCooldownMs: number,
  ) {}

  protected now(): Date {
    return new Date();
  }

  // ================================================================== người đọc

  /** Bài đăng hôm nay (theo ngày Việt Nam) của các SACO còn quyền, mới nhất trước. */
  async today(user: AuthenticatedUser): Promise<{ date: string; items: PostCard[] }> {
    const now = this.now();
    const rows = await this.repository.listToday(
      this.database,
      vnDayStart(now),
      vnNextDayStart(now),
      user.id,
      TODAY_LIMIT,
    );
    return { date: vnDateString(now), items: rows.map((row) => toCard(row)) };
  }

  /** Bài đã đăng của SACO còn quyền đọc được mọi ngày; còn lại là 410. */
  async detail(user: AuthenticatedUser, id: string): Promise<PostDetail> {
    const row = await this.readable(id, user.id);
    return {
      ...toCard(row),
      bodyHtml: sanitizePostHtml(row.bodyHtml),
      sacoOnDuty: row.sacoOnDuty,
      sacoActive: row.sacoActive,
      canModerate: await this.canModerate(user, row),
      isAuthor: row.sacoUserId === user.id,
    };
  }

  async heart(
    user: AuthenticatedUser,
    id: string,
    on: boolean,
  ): Promise<{ hearts: number; hearted: boolean }> {
    const result = await this.database.transaction(async (tx) => {
      const row = await this.repository.lockPost(tx, id);
      if (!row) throw postNotFound();
      if (!isReadable(row)) throw unavailable();
      if (row.sacoUserId === user.id)
        throw new ForbiddenException({
          code: 'OWN_POST',
          message: 'SACO không thả tim bài của chính mình',
        });
      const changed = on
        ? await this.repository.insertHeart(tx, id, user.id)
        : await this.repository.deleteHeart(tx, id, user.id);
      const hearts = changed
        ? await this.repository.bumpHearts(tx, id, on ? 1 : -1)
        : row.heartCount;
      return { hearts, changed };
    });
    if (result.changed) this.events.toAll({ type: 'post:heart', id, hearts: result.hearts });
    return { hearts: result.hearts, hearted: on };
  }

  async comments(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ total: number; items: PostComment[] }> {
    const row = await this.readable(id, user.id);
    const items = await this.repository.listComments(this.database, id, user.id, COMMENTS_LIMIT);
    return { total: row.commentCount, items: items.map(toComment) };
  }

  async addComment(user: AuthenticatedUser, id: string, raw: string): Promise<PostComment> {
    const text = cleanComment(raw);
    if (!text) throw invalid('COMMENT_EMPTY', 'Bình luận đang trống');
    if (charLength(text) > COMMENT_MAX)
      throw invalid('COMMENT_TOO_LONG', `Bình luận tối đa ${COMMENT_MAX} ký tự`);

    const created = await this.database.transaction(async (tx) => {
      const row = await this.repository.lockPost(tx, id);
      if (!row) throw postNotFound();
      if (!isReadable(row)) throw unavailable();
      this.throttleComment(user.id);
      const commentId = await this.repository.insertComment(tx, {
        postId: id,
        userId: user.id,
        isAuthor: row.sacoUserId === user.id,
        text,
      });
      const total = await this.repository.bumpComments(tx, id, 1);
      return { commentId, total };
    });
    this.events.toAll({ type: 'post:comment', postId: id, comments: created.total });
    const view = await this.repository.commentView(this.database, created.commentId, user.id);
    if (!view) throw commentNotFound();
    return toComment(view);
  }

  /** Người viết xoá bình luận của mình. Xoá lại thì bỏ qua. */
  async deleteComment(user: AuthenticatedUser, commentId: string): Promise<{ ok: true }> {
    const outcome = await this.database.transaction(async (tx) => {
      const ctx = await this.repository.comment(tx, commentId, true);
      if (!ctx) throw commentNotFound();
      if (ctx.userId !== user.id)
        throw new ForbiddenException({
          code: 'COMMENT_FORBIDDEN',
          message: 'Bạn chỉ xoá được bình luận của mình',
        });
      if (ctx.status === 'deleted') return null;
      await this.repository.setCommentStatus(
        tx,
        commentId,
        ['visible', 'hidden'],
        'deleted',
        user.id,
      );
      const total =
        ctx.status === 'visible' ? await this.repository.bumpComments(tx, ctx.postId, -1) : null;
      return total === null ? null : { postId: ctx.postId, total };
    });
    if (outcome)
      this.events.toAll({ type: 'post:comment', postId: outcome.postId, comments: outcome.total });
    return { ok: true };
  }

  /** SACO tác giả, quản trị viên hoặc trưởng nhóm của SACO ẩn bình luận. Ẩn lại thì bỏ qua. */
  async hideComment(user: AuthenticatedUser, commentId: string): Promise<{ ok: true }> {
    const outcome = await this.database.transaction(async (tx) => {
      const ctx = await this.repository.comment(tx, commentId, true);
      if (!ctx || ctx.status === 'deleted') throw commentNotFound();
      const allowed = await this.canModerate(user, {
        sacoUserId: ctx.sacoUserId,
        sacoActive: ctx.sacoActive,
        leadUserId: ctx.leadUserId,
      });
      if (!allowed)
        throw new ForbiddenException({
          code: 'COMMENT_FORBIDDEN',
          message: 'Bạn không có quyền ẩn bình luận này',
        });
      if (ctx.status === 'hidden') return null;
      await this.repository.setCommentStatus(tx, commentId, ['visible'], 'hidden', user.id);
      const total = await this.repository.bumpComments(tx, ctx.postId, -1);
      return { postId: ctx.postId, total };
    });
    if (outcome)
      this.events.toAll({ type: 'post:comment', postId: outcome.postId, comments: outcome.total });
    return { ok: true };
  }

  /** Báo cáo một bình luận: mỗi tài khoản một lần, không báo cáo bình luận của chính mình. */
  async reportComment(user: AuthenticatedUser, commentId: string): Promise<{ ok: true }> {
    const ctx = await this.repository.comment(this.database, commentId, false);
    if (!ctx || ctx.status !== 'visible' || ctx.postStatus !== 'published' || !ctx.sacoActive)
      throw commentNotFound();
    if (ctx.userId === user.id)
      throw new BadRequestException({
        code: 'OWN_COMMENT',
        message: 'Bạn không thể báo cáo bình luận của chính mình',
      });
    await this.database.transaction(async (tx) => {
      await this.repository.insertReport(tx, commentId, user.id);
    });
    return { ok: true };
  }

  // ================================================================ SACO tác giả

  async minePosts(user: AuthenticatedUser): Promise<{ items: MyPost[] }> {
    const saco = await this.requireSaco(user.id);
    const rows = await this.repository.listMine(this.database, saco.id, MY_POSTS_LIMIT);
    return { items: rows.map(toMyPost) };
  }

  async createPost(user: AuthenticatedUser): Promise<MyPostDetail> {
    const saco = await this.requireSaco(user.id);
    if ((await this.repository.countDrafts(this.database, saco.id)) >= MAX_DRAFTS)
      throw new ConflictException({
        code: 'TOO_MANY_DRAFTS',
        message: 'Bạn có quá nhiều bản nháp, hãy đăng hoặc xoá bớt',
      });
    const id = await this.repository.createDraft(this.database, saco.id);
    return toMyPostDetail(await this.ownPost(id, saco));
  }

  async minePost(user: AuthenticatedUser, id: string): Promise<MyPostDetail> {
    const saco = await this.requireSaco(user.id);
    return toMyPostDetail(await this.ownPost(id, saco));
  }

  async saveDraft(
    user: AuthenticatedUser,
    id: string,
    body: DraftBody,
  ): Promise<{ revision: number; savedAt: number }> {
    const saco = await this.requireSaco(user.id);
    const saved = await this.repository.saveDraft(this.database, {
      id,
      sacoId: saco.id,
      headline: truncateChars(cleanHeadline(body.headline), HEADLINE_DRAFT_MAX),
      bodyHtml: sanitizePostHtml(body.bodyHtml),
      baseRevision: body.baseRevision,
    });
    if (saved) return { revision: saved.revision, savedAt: ms(saved.savedAt) };
    // Không có hàng nào được cập nhật: phân biệt không có bài, đã đăng và nháp cũ.
    const row = await this.ownPost(id, saco);
    throw row.status === 'draft' ? draftStale() : notDraft();
  }

  async deleteDraft(user: AuthenticatedUser, id: string): Promise<{ ok: true }> {
    const saco = await this.requireSaco(user.id);
    await this.database.transaction(async (tx) => {
      const row = await this.repository.lockPost(tx, id);
      if (!row || row.sacoId !== saco.id) throw postNotFound();
      if (row.status !== 'draft') throw notDraft('Chỉ xoá được bản nháp');
      await this.repository.deleteDraft(tx, id, saco.id);
    });
    await this.images.removePostFiles(id);
    return { ok: true };
  }

  /** Lưu rồi đăng trong một transaction. Đăng lại bài đã đăng thì trả về chính bài đó. */
  async publish(user: AuthenticatedUser, id: string, body: DraftBody): Promise<MyPostDetail> {
    const saco = await this.requireSaco(user.id);
    const published = await this.database.transaction(async (tx) => {
      const row = await this.repository.lockPost(tx, id);
      if (!row || row.sacoId !== saco.id) throw postNotFound();
      if (row.status !== 'draft') return false;
      if (row.revision !== body.baseRevision) throw draftStale();
      const headline = cleanHeadline(body.headline);
      if (!headline) throw invalid('HEADLINE_REQUIRED', 'Cần nhập câu tiêu điểm');
      if (charLength(headline) > HEADLINE_MAX)
        throw invalid('HEADLINE_TOO_LONG', `Câu tiêu điểm tối đa ${HEADLINE_MAX} ký tự`);
      const bodyHtml = sanitizePostHtml(body.bodyHtml);
      if (isBodyEmpty(bodyHtml)) throw invalid('BODY_EMPTY', 'Nội dung bài đang trống');
      await this.repository.publish(tx, { id, headline, bodyHtml });
      await this.repository.insertLog(tx, id, 'publish', user.id, 'saco');
      return true;
    });
    const row = await this.ownPost(id, saco);
    if (published) this.events.toAll({ type: 'post:new', post: toCard(row, false) });
    return toMyPostDetail(row);
  }

  async markCommentsSeen(user: AuthenticatedUser, id: string): Promise<{ ok: true }> {
    const saco = await this.requireSaco(user.id);
    if (!(await this.repository.markCommentsSeen(this.database, id, saco.id))) throw postNotFound();
    return { ok: true };
  }

  async uploadImage(
    user: AuthenticatedUser,
    id: string,
    stream: AsyncIterable<Buffer | Uint8Array>,
  ): Promise<{ id: string; url: string; width: number; height: number }> {
    const saco = await this.requireSaco(user.id);
    const row = await this.ownPost(id, saco);
    if (row.status !== 'draft') throw notDraft();
    if ((await this.repository.countImages(this.database, id)) >= POST_IMAGES_PER_POST)
      throw new ConflictException({
        code: 'TOO_MANY_IMAGES',
        message: `Mỗi bài tối đa ${POST_IMAGES_PER_POST} ảnh`,
      });
    return this.images.store(id, stream);
  }

  async mineCommentReports(user: AuthenticatedUser): Promise<{ items: CommentReport[] }> {
    const saco = await this.requireSaco(user.id);
    return this.reports({ sacoId: saco.id });
  }

  // ================================================================== quản trị

  async managePosts(
    user: AuthenticatedUser,
    status: 'published' | 'hidden' | undefined,
  ): Promise<{ items: ManagePost[] }> {
    const scope = await this.staffScope(user);
    const rows = await this.repository.listManage(
      this.database,
      scope,
      status ?? null,
      MANAGE_POSTS_LIMIT,
    );
    return { items: rows.map(toManagePost) };
  }

  async managePost(user: AuthenticatedUser, id: string): Promise<ManagePostDetail> {
    const scope = await this.staffScope(user);
    const row = await this.repository.post(this.database, id, null);
    if (!row || row.status === 'draft' || !inScope(scope, row)) throw postNotFound();
    const log = await this.repository.log(this.database, id);
    return {
      ...toMyPostDetail(row),
      sacoId: row.sacoId,
      sacoName: row.sacoName,
      leadName: row.leadName,
      log: log.map((entry) => ({
        action: entry.action,
        actorName: entry.actorName,
        actorRole: entry.actorRole,
        at: ms(entry.at),
      })),
    };
  }

  /** Quản trị viên hoặc trưởng nhóm của SACO ẩn bài. Ẩn lại thì bỏ qua. */
  async hidePost(
    user: AuthenticatedUser,
    audit: AuditContext,
    id: string,
  ): Promise<{ id: string; status: 'hidden' }> {
    const scope = await this.staffScope(user);
    const changed = await this.database.transaction(async (tx) => {
      const row = await this.repository.lockPost(tx, id);
      if (!row || row.status === 'draft' || !inScope(scope, row)) throw postNotFound();
      if (row.status === 'hidden') return false;
      await this.repository.setStatus(tx, id, 'published', 'hidden');
      await this.repository.insertLog(tx, id, 'hide', user.id, staffRole(user));
      await recordAudit(tx, audit, {
        action: 'trading_floor.post.hide',
        targetEntity: 'tf_post',
        targetId: id,
        before: { status: 'published' },
        after: { status: 'hidden' },
      });
      return true;
    });
    if (changed) this.events.toAll({ type: 'post:hidden', id });
    return { id, status: 'hidden' };
  }

  /** Chỉ quản trị viên bỏ ẩn. Bài vẫn giữ lúc đăng gốc; chỉ lên bảng nếu vẫn là bài hôm nay. */
  async unhidePost(
    user: AuthenticatedUser,
    audit: AuditContext,
    id: string,
  ): Promise<{ id: string; status: 'published' }> {
    if (user.role !== 'admin')
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'Chỉ quản trị viên được bỏ ẩn bài',
      });
    const changed = await this.database.transaction(async (tx) => {
      const row = await this.repository.lockPost(tx, id);
      if (!row || row.status === 'draft') throw postNotFound();
      if (row.status === 'published') return false;
      await this.repository.setStatus(tx, id, 'hidden', 'published');
      await this.repository.insertLog(tx, id, 'unhide', user.id, 'admin');
      await recordAudit(tx, audit, {
        action: 'trading_floor.post.unhide',
        targetEntity: 'tf_post',
        targetId: id,
        before: { status: 'hidden' },
        after: { status: 'published' },
      });
      return true;
    });
    if (changed) {
      const row = await this.repository.post(this.database, id, null);
      if (
        row?.sacoActive &&
        row.publishedAt &&
        ms(row.publishedAt) >= vnDayStart(this.now()).getTime()
      )
        this.events.toAll({ type: 'post:new', post: toCard(row, false) });
    }
    return { id, status: 'published' };
  }

  async manageCommentReports(user: AuthenticatedUser): Promise<{ items: CommentReport[] }> {
    const scope = await this.staffScope(user);
    return this.reports(scope.leadUserId ? { leadUserId: scope.leadUserId } : {});
  }

  // ====================================================================== nội bộ

  private async reports(scope: {
    leadUserId?: string;
    sacoId?: string;
  }): Promise<{ items: CommentReport[] }> {
    const rows = await this.repository.commentReports(this.database, scope, REPORTS_LIMIT);
    return {
      items: rows.map((row) => ({
        commentId: row.commentId,
        postId: row.postId,
        headline: row.headline,
        sacoName: row.sacoName,
        authorName: row.authorName,
        text: row.text,
        at: ms(row.createdAt),
        reports: row.reports,
      })),
    };
  }

  /** Bài người dùng được đọc: đã đăng và SACO còn quyền. Không có bài là 404, còn lại là 410. */
  private async readable(id: string, viewerId: string): Promise<PostRow> {
    const row = await this.repository.post(this.database, id, viewerId);
    if (!row) throw postNotFound();
    if (!isReadable(row)) throw unavailable();
    return row;
  }

  private async ownPost(id: string, saco: SacoRow): Promise<PostRow> {
    const row = await this.repository.post(this.database, id, null);
    if (!row || row.sacoId !== saco.id) throw postNotFound();
    return row;
  }

  /** Quyền SACO của người gọi; tài khoản bị gỡ quyền không còn vào được mọi đường `/saco/*`. */
  private async requireSaco(userId: string): Promise<SacoRow> {
    const saco = await this.repository.sacoOfUser(this.database, userId);
    if (!saco)
      throw new ForbiddenException({
        code: 'SACO_REQUIRED',
        message: 'Tài khoản này chưa có quyền SACO',
      });
    if (!saco.active)
      throw new ForbiddenException({
        code: 'SACO_REQUIRED',
        message: 'Tài khoản này không còn quyền SACO',
      });
    return saco;
  }

  private async staffScope(user: AuthenticatedUser): Promise<StaffScope> {
    if (user.role === 'admin') return { leadUserId: null };
    if (user.role === 'team_lead') {
      if (!(await this.repository.isActiveLead(this.database, user.id)))
        throw new ForbiddenException({
          code: 'TEAM_LEAD_NOT_ACTIVE',
          message: 'Bạn không còn là trưởng nhóm',
        });
      return { leadUserId: user.id };
    }
    throw new ForbiddenException({
      code: 'INSUFFICIENT_ROLE',
      message: 'Bạn không có quyền thực hiện thao tác này',
    });
  }

  /** SACO tác giả (còn quyền), quản trị viên, hoặc trưởng nhóm đang hoạt động của SACO. */
  private async canModerate(
    user: AuthenticatedUser,
    row: { sacoUserId: string; sacoActive: boolean; leadUserId: string },
  ): Promise<boolean> {
    if (user.role === 'admin') return true;
    if (row.sacoUserId === user.id && row.sacoActive) return true;
    if (user.role === 'team_lead' && row.leadUserId === user.id)
      return this.repository.isActiveLead(this.database, user.id);
    return false;
  }

  /** Mỗi người một bình luận mỗi 3 giây (bộ nhớ của tiến trình API, như giới hạn chat của khu). */
  private throttleComment(userId: string): void {
    const now = Date.now();
    const last = this.lastComment.get(userId);
    if (last !== undefined && now - last < this.commentCooldownMs)
      throw new HttpException(
        { code: 'COMMENT_TOO_FAST', message: 'Bạn gửi bình luận quá nhanh, hãy đợi vài giây' },
        429,
      );
    if (this.lastComment.size > 5_000)
      for (const [key, at] of this.lastComment)
        if (now - at >= this.commentCooldownMs) this.lastComment.delete(key);
    this.lastComment.set(userId, now);
  }
}

const isReadable = (row: Pick<PostRow, 'status' | 'sacoActive'>): boolean =>
  row.status === 'published' && row.sacoActive;

const inScope = (scope: StaffScope, row: Pick<PostRow, 'leadUserId'>): boolean =>
  scope.leadUserId === null || scope.leadUserId === row.leadUserId;

const staffRole = (user: AuthenticatedUser): 'admin' | 'team_lead' =>
  user.role === 'team_lead' ? 'team_lead' : 'admin';
