import { Injectable } from '@nestjs/common';
import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import type {
  CourseCreate,
  CourseListQuery,
  CourseUpdate,
  EpisodeCreate,
  EpisodeUpdate,
  ProgressUpdate,
  ReorderInput,
} from './learning.schemas.js';
import type { CourseRow, EpisodeRow, ProgressRow } from './learning.types.js';

@Injectable()
export class LearningRepository {
  constructor(private readonly database: DatabaseService) {}

  async listCourses(
    query: CourseListQuery,
    publicOnly: boolean,
  ): Promise<{ items: CourseRow[]; total: number }> {
    const values: unknown[] = [];
    const conditions: string[] = publicOnly ? ['is_published = true'] : [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      conditions.push(sql.replace('?', `$${values.length}`));
    };
    if (query.category) add('category = ?', query.category);
    if (query.level) add('level = ?', query.level);
    if (query.is_premium !== undefined) add('is_premium = ?', query.is_premium);
    if (!publicOnly && query.is_published !== undefined)
      add('is_published = ?', query.is_published);
    if (query.search) {
      values.push(query.search, query.search);
      const first = `$${values.length - 1}`;
      const second = `$${values.length}`;
      conditions.push(
        `(title ilike '%' || ${first} || '%' or coalesce(description, '') ilike '%' || ${second} || '%')`,
      );
    }
    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const count = await this.database.query<{ total: string }>(
      `select count(*)::text as total from courses ${where}`,
      values,
    );
    values.push(query.page_size, (query.page - 1) * query.page_size);
    const items = await this.database.query<CourseRow>(
      `select * from courses ${where} order by created_at desc limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { items, total: Number(count[0]?.total ?? 0) };
  }

  courseBySlug(slug: string): Promise<CourseRow[]> {
    return this.database.query<CourseRow>(
      'select * from courses where slug = $1 and is_published = true',
      [slug],
    );
  }
  courseById(id: string): Promise<CourseRow[]> {
    return this.database.query<CourseRow>('select * from courses where id = $1', [id]);
  }
  episodesForCourse(courseId: string, publishedOnly = false): Promise<EpisodeRow[]> {
    return this.database.query<EpisodeRow>(
      `select * from episodes where course_id = $1${publishedOnly ? ' and is_published = true' : ''} order by sort_order`,
      [courseId],
    );
  }
  episodeById(
    id: string,
  ): Promise<(EpisodeRow & { course_is_published: boolean; course_is_premium: boolean })[]> {
    return this.database.query(
      `select e.*, c.is_published as course_is_published, c.is_premium as course_is_premium
       from episodes e join courses c on c.id=e.course_id where e.id=$1`,
      [id],
    );
  }

  createCourse(body: CourseCreate, userId: string): Promise<CourseRow> {
    return this.database.transaction(async (tx) => {
      const rows = await tx.query<CourseRow>(
        `insert into courses (id,slug,title,description,level,category,is_premium,is_published,total_episodes,total_duration_seconds,created_by_user_id)
         values (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,0,0,$8) returning *`,
        [
          body.slug,
          body.title,
          body.description ?? null,
          body.level,
          body.category,
          body.is_premium,
          body.is_published,
          userId,
        ],
      );
      return rows[0]!;
    });
  }

  updateCourse(id: string, body: CourseUpdate): Promise<CourseRow | undefined> {
    return this.database.transaction(async (tx) => {
      const entries = Object.entries(body).filter(([, value]) => value !== undefined);
      if (!entries.length)
        return (await tx.query<CourseRow>('select * from courses where id=$1', [id]))[0];
      const sets = entries.map(([key], index) => `${key}=$${index + 2}`);
      const rows = await tx.query<CourseRow>(
        `update courses set ${sets.join(',')}, updated_at=now() where id=$1 returning *`,
        [id, ...entries.map(([, value]) => value)],
      );
      return rows[0];
    });
  }

  softDeleteCourse(id: string): Promise<CourseRow | undefined> {
    return this.database.transaction(
      async (tx) =>
        (
          await tx.query<CourseRow>(
            'update courses set is_published=false, updated_at=now() where id=$1 returning *',
            [id],
          )
        )[0],
    );
  }

  createEpisode(courseId: string, body: EpisodeCreate): Promise<EpisodeRow | undefined> {
    return this.database.transaction(async (tx) => {
      const exists = await tx.query<{ id: string }>(
        'select id from courses where id=$1 for update',
        [courseId],
      );
      if (!exists.length) return undefined;
      const order =
        body.sort_order ??
        Number(
          (
            await tx.query<{ n: number }>(
              'select coalesce(max(sort_order),0)+1 as n from episodes where course_id=$1',
              [courseId],
            )
          )[0]?.n ?? 1,
        );
      const rows = await tx.query<EpisodeRow>(
        `insert into episodes (id,course_id,title,description,content_type,markdown_body,sort_order,is_published)
         values (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7) returning *`,
        [
          courseId,
          body.title,
          body.description ?? null,
          body.content_type,
          body.markdown_body ?? null,
          order,
          body.content_type === 'text',
        ],
      );
      await this.refreshDenorms(tx, courseId);
      return rows[0];
    });
  }

  updateEpisode(id: string, body: EpisodeUpdate): Promise<EpisodeRow | undefined> {
    return this.database.transaction(async (tx) => {
      const existing = (
        await tx.query<EpisodeRow>('select * from episodes where id=$1 for update', [id])
      )[0];
      if (!existing) return undefined;
      const entries = Object.entries(body).filter(([, value]) => value !== undefined);
      if (body.is_published === true && existing.content_type !== 'text' && !existing.file_url)
        throw new Error('EPISODE_FILE_REQUIRED');
      if (!entries.length) return existing;
      const sets = entries.map(([key], index) => `${key}=$${index + 2}`);
      return (
        await tx.query<EpisodeRow>(
          `update episodes set ${sets.join(',')},updated_at=now() where id=$1 returning *`,
          [id, ...entries.map(([, value]) => value)],
        )
      )[0];
    });
  }

  async deleteEpisode(id: string): Promise<EpisodeRow | undefined> {
    return this.database.transaction(async (tx) => {
      const row = (
        await tx.query<EpisodeRow>('delete from episodes where id=$1 returning *', [id])
      )[0];
      if (row) await this.refreshDenorms(tx, row.course_id);
      return row;
    });
  }

  reorder(courseId: string, body: ReorderInput): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const all = await tx.query<{ id: string }>(
        'select id from episodes where course_id=$1 for update',
        [courseId],
      );
      if (!all.length && !(await tx.query('select id from courses where id=$1', [courseId])).length)
        return false;
      const owned = new Set(all.map((row) => row.id));
      if (body.items.some((item) => !owned.has(item.episode_id)))
        throw new Error('EPISODE_COURSE_MISMATCH');
      await tx.query(
        'update episodes set sort_order=-sort_order where course_id=$1 and id=any($2::uuid[])',
        [courseId, body.items.map((item) => item.episode_id)],
      );
      for (const item of body.items)
        await tx.query('update episodes set sort_order=$2,updated_at=now() where id=$1', [
          item.episode_id,
          item.sort_order,
        ]);
      return true;
    });
  }

  saveEpisodeFile(id: string, storageUrl: string, size: number): Promise<EpisodeRow | undefined> {
    return this.database.transaction(async (tx) => {
      const row = (
        await tx.query<EpisodeRow>(
          'update episodes set file_url=$2,file_size_bytes=$3,updated_at=now() where id=$1 returning *',
          [id, storageUrl, size],
        )
      )[0];
      if (row) await this.refreshDenorms(tx, row.course_id);
      return row;
    });
  }

  saveThumbnail(id: string, storageUrl: string): Promise<CourseRow | undefined> {
    return this.database.transaction(
      async (tx) =>
        (
          await tx.query<CourseRow>(
            'update courses set thumbnail_url=$2,updated_at=now() where id=$1 returning *',
            [id, storageUrl],
          )
        )[0],
    );
  }

  progress(userId: string, courseId: string): Promise<ProgressRow[]> {
    return this.database.query<ProgressRow>(
      'select episode_id,course_id,completed_at,last_position_seconds,created_at,updated_at from episode_progress where user_id=$1 and course_id=$2 order by created_at',
      [userId, courseId],
    );
  }

  upsertProgress(
    userId: string,
    episodeId: string,
    courseId: string,
    body: ProgressUpdate,
  ): Promise<ProgressRow> {
    return this.database.transaction(async (tx) => {
      const rows = await tx.query<ProgressRow>(
        `insert into episode_progress (user_id,episode_id,course_id,completed_at,last_position_seconds)
         values ($1,$2,$3,case when $4 then now() else null end,$5)
         on conflict (user_id,episode_id) do update set
           completed_at=case when $4 then coalesce(episode_progress.completed_at,now()) when $4=false then null else episode_progress.completed_at end,
           last_position_seconds=coalesce($5,episode_progress.last_position_seconds),updated_at=now()
         returning episode_id,course_id,completed_at,last_position_seconds,created_at,updated_at`,
        [userId, episodeId, courseId, body.completed ?? null, body.last_position_seconds ?? null],
      );
      return rows[0]!;
    });
  }

  entitled(userId: string): Promise<{ entitled: boolean }[]> {
    return this.database.query(
      `select exists(
         select 1 from billing_entitlement_grants
          where user_id = $1 and status = 'active'
            and starts_at <= now() and now() < ends_at
       ) as entitled`,
      [userId],
    );
  }

  private async refreshDenorms(tx: SqlClient, courseId: string): Promise<void> {
    await tx.query(
      `update courses set total_episodes=s.cnt,total_duration_seconds=s.duration,updated_at=now()
      from (select count(*)::int cnt,coalesce(sum(duration_seconds),0)::int duration from episodes where course_id=$1) s where id=$1`,
      [courseId],
    );
  }
}
