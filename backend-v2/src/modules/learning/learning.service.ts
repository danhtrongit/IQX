import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/index.js';
import { MediaStorageService } from '../media/index.js';
import { LearningRepository } from './learning.repository.js';
import type {
  CourseCreate,
  CourseListQuery,
  CourseUpdate,
  EpisodeCreate,
  EpisodeUpdate,
  ProgressUpdate,
  ReorderInput,
} from './learning.schemas.js';
import type { CourseRow, EpisodeRow } from './learning.types.js';

@Injectable()
export class LearningService {
  constructor(
    private readonly repository: LearningRepository,
    private readonly media: MediaStorageService,
  ) {}

  async list(query: CourseListQuery, publicOnly: boolean) {
    const result = await this.repository.listCourses(query, publicOnly);
    return {
      ...result,
      items: result.items.map((row) => this.courseResponse(row)),
      total_pages: result.total ? Math.ceil(result.total / query.page_size) : 0,
    };
  }

  async publicCourse(slug: string, user?: AuthenticatedUser) {
    const course = (await this.repository.courseBySlug(slug))[0];
    if (!course) throw this.notFound('Khoá học');
    const episodes = await this.repository.episodesForCourse(course.id, true);
    const progress = user ? await this.repository.progress(user.id, course.id) : [];
    const completed = progress.filter((row) => row.completed_at !== null).length;
    return {
      ...this.courseResponse(course),
      episodes: episodes.map(
        ({ file_url: _file, markdown_body: _markdown, course_id: _course, ...row }) =>
          this.serializeEpisode(row),
      ),
      progress_summary: user
        ? {
            completed,
            total: course.total_episodes,
            percent: course.total_episodes
              ? Math.round((completed / course.total_episodes) * 1000) / 10
              : 0,
          }
        : null,
    };
  }

  async adminCourse(id: string) {
    const course = (await this.repository.courseById(id))[0];
    if (!course) throw this.notFound('Khoá học');
    return {
      ...this.courseResponse(course),
      episodes: (await this.repository.episodesForCourse(id)).map((row) => this.adminEpisode(row)),
    };
  }

  async content(id: string, user: AuthenticatedUser) {
    const episode = (await this.repository.episodeById(id))[0];
    if (!episode || !episode.is_published || !episode.course_is_published)
      throw this.notFound('Tập học');
    if (
      episode.course_is_premium &&
      user.role !== 'admin' &&
      !(await this.repository.entitled(user.id))[0]?.entitled
    ) {
      throw new ForbiddenException({
        code: 'PREMIUM_REQUIRED',
        message: 'Yêu cầu gói Premium đang hoạt động',
      });
    }
    const { course_is_published: _published, course_is_premium: _premium, ...data } = episode;
    return {
      ...this.serializeEpisode(data),
      file_url: data.file_url ? this.media.sign(data.file_url, 'lesson') : null,
    };
  }

  progress(userId: string, courseId: string) {
    return this.repository.progress(userId, courseId);
  }

  async updateProgress(user: AuthenticatedUser, episodeId: string, body: ProgressUpdate) {
    const episode = (await this.repository.episodeById(episodeId))[0];
    if (!episode || !episode.is_published || !episode.course_is_published)
      throw this.notFound('Tập học');
    if (
      episode.course_is_premium &&
      user.role !== 'admin' &&
      !(await this.repository.entitled(user.id))[0]?.entitled
    ) {
      throw new ForbiddenException({
        code: 'PREMIUM_REQUIRED',
        message: 'Yêu cầu gói Premium đang hoạt động',
      });
    }
    return this.repository.upsertProgress(user.id, episodeId, episode.course_id, body);
  }

  async createCourse(body: CourseCreate, userId: string) {
    try {
      return this.courseResponse(await this.repository.createCourse(body, userId));
    } catch (error) {
      this.rethrowConflict(error, `Slug '${body.slug}' đã được sử dụng`);
    }
  }
  async updateCourse(id: string, body: CourseUpdate) {
    try {
      const row = await this.repository.updateCourse(id, body);
      if (!row) throw this.notFound('Khoá học');
      return this.courseResponse(row);
    } catch (error) {
      this.rethrowConflict(
        error,
        body.slug ? `Slug '${body.slug}' đã được sử dụng` : 'Dữ liệu khoá học bị trùng',
      );
    }
  }
  async deleteCourse(id: string) {
    const row = await this.repository.softDeleteCourse(id);
    if (!row) throw this.notFound('Khoá học');
    return this.courseResponse(row);
  }
  async createEpisode(courseId: string, body: EpisodeCreate) {
    try {
      const row = await this.repository.createEpisode(courseId, body);
      if (!row) throw this.notFound('Khoá học');
      return this.adminEpisode(row);
    } catch (error) {
      this.rethrowConflict(error, 'Thứ tự tập học đã tồn tại');
    }
  }
  async updateEpisode(id: string, body: EpisodeUpdate) {
    try {
      const row = await this.repository.updateEpisode(id, body);
      if (!row) throw this.notFound('Tập học');
      return this.adminEpisode(row);
    } catch (error) {
      if (error instanceof Error && error.message === 'EPISODE_FILE_REQUIRED')
        throw new BadRequestException({
          code: 'EPISODE_FILE_REQUIRED',
          message: 'Phải upload file trước khi xuất bản tập học dạng PDF/Video',
        });
      this.rethrowConflict(error, 'Thứ tự tập học đã tồn tại');
    }
  }
  async deleteEpisode(id: string): Promise<void> {
    const row = await this.repository.deleteEpisode(id);
    if (!row) throw this.notFound('Tập học');
    await this.media.remove(row.file_url);
  }
  async reorder(courseId: string, body: ReorderInput): Promise<void> {
    try {
      if (!(await this.repository.reorder(courseId, body))) throw this.notFound('Khoá học');
    } catch (error) {
      if (error instanceof Error && error.message === 'EPISODE_COURSE_MISMATCH')
        throw new BadRequestException({
          code: 'EPISODE_COURSE_MISMATCH',
          message: 'Tập học không thuộc khoá học',
        });
      this.rethrowConflict(error, 'Thứ tự tập học bị trùng');
    }
  }

  async uploadEpisode(
    id: string,
    stream: AsyncIterable<Buffer | Uint8Array>,
    declaredMime?: string,
  ) {
    const existing = (await this.repository.episodeById(id))[0];
    if (!existing) throw this.notFound('Tập học');
    if (existing.content_type === 'text')
      throw new BadRequestException({
        code: 'TEXT_UPLOAD_FORBIDDEN',
        message: 'Tập học dạng text không cần upload file',
      });
    const stored = await this.media.store(stream, {
      courseId: existing.course_id,
      kind: existing.content_type,
      declaredMime,
    });
    try {
      const updated = await this.repository.saveEpisodeFile(id, stored.storageUrl, stored.size);
      if (!updated) throw this.notFound('Tập học');
      await this.media.remove(existing.file_url);
      return this.adminEpisode(updated);
    } catch (error) {
      await this.media.remove(stored.storageUrl);
      throw error;
    }
  }

  async uploadThumbnail(
    id: string,
    stream: AsyncIterable<Buffer | Uint8Array>,
    declaredMime?: string,
  ) {
    const existing = (await this.repository.courseById(id))[0];
    if (!existing) throw this.notFound('Khoá học');
    const stored = await this.media.store(stream, {
      courseId: id,
      kind: 'thumbnail',
      declaredMime,
    });
    try {
      const updated = await this.repository.saveThumbnail(id, stored.storageUrl);
      if (!updated) throw this.notFound('Khoá học');
      await this.media.remove(existing.thumbnail_url);
      return this.courseResponse(updated);
    } catch (error) {
      await this.media.remove(stored.storageUrl);
      throw error;
    }
  }

  private courseResponse(row: CourseRow) {
    return {
      ...row,
      thumbnail_url: row.thumbnail_url?.startsWith('media://')
        ? this.media.sign(row.thumbnail_url, 'thumbnail', 900)
        : row.thumbnail_url,
    };
  }
  private adminEpisode(row: EpisodeRow) {
    return {
      ...this.serializeEpisode(row),
      file_url: row.file_url ? this.media.sign(row.file_url, 'lesson') : null,
    };
  }
  private serializeEpisode<T extends Partial<EpisodeRow>>(
    row: T,
  ): T & { file_size_bytes: number | null } {
    return {
      ...row,
      file_size_bytes:
        row.file_size_bytes === null || row.file_size_bytes === undefined
          ? null
          : Number(row.file_size_bytes),
    };
  }
  private notFound(entity: string) {
    return new NotFoundException({ code: 'NOT_FOUND', message: `${entity} không tồn tại` });
  }
  private rethrowConflict(error: unknown, message: string): never {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: unknown }).code)
        : '';
    if (code === '23505') throw new ConflictException({ code: 'CONFLICT', message });
    throw error;
  }
}
