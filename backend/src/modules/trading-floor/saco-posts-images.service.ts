/**
 * Ảnh trong bài SACO nhận định: nhận tối đa 5 MB (giới hạn đo ngay khi đang nhận), nhận dạng bằng
 * byte đầu, nén lại bằng sharp (xoay theo EXIF, rộng tối đa 1600 px, WebP, bỏ metadata) rồi lưu ở
 * `<MEDIA_ROOT>/trading-floor/posts/<postId>/<imageId>.webp`. Ảnh được phát công khai theo uuid
 * khó đoán, không phụ thuộc trạng thái bài, vì bản xem trước của trình soạn cần cả ảnh của nháp.
 */

import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

import {
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

import { DatabaseService } from '../../platform/database/database.service.js';
import { POST_IMAGE_URL_PREFIX } from './post-html.js';
import { SACO_POSTS_REPOSITORY, SacoPostsRepository } from './saco-posts.repository.js';

export const POST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const POST_IMAGE_MAX_WIDTH = 1600;
export const POST_IMAGES_PER_POST = 100;
const WEBP_QUALITY = 82;
const MAX_INPUT_PIXELS = 50_000_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const POSTS_DIR = join('trading-floor', 'posts');

export type StoredPostImage = { id: string; url: string; width: number; height: number };
export type OpenedPostImage = { path: string; size: number; mime: string };

@Injectable()
export class SacoPostsImagesService {
  constructor(
    private readonly config: ConfigService<Record<string, unknown>, false>,
    private readonly database: DatabaseService,
    @Inject(SACO_POSTS_REPOSITORY) private readonly repository: SacoPostsRepository,
  ) {}

  /** Nhận, nén và lưu một ảnh của nháp `postId`; quyền sửa nháp do service gọi kiểm tra trước. */
  async store(
    postId: string,
    stream: AsyncIterable<Buffer | Uint8Array>,
  ): Promise<StoredPostImage> {
    const root = this.root();
    const input = await readLimited(stream);
    const detected = await fileTypeFromBuffer(input).catch(() => undefined);
    if (!detected || !ALLOWED_MIME.has(detected.mime))
      throw new UnsupportedMediaTypeException({
        code: 'IMAGE_UNSUPPORTED',
        message: 'Chỉ nhận ảnh JPG, PNG hoặc WebP',
      });

    let output: { data: Buffer; width: number; height: number };
    try {
      const source = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
      const meta = await source.metadata();
      if ((meta.pages ?? 1) > 1)
        throw new UnprocessableEntityException({
          code: 'IMAGE_ANIMATED',
          message: 'Không nhận ảnh động',
        });
      const result = await source
        .rotate()
        .resize({ width: POST_IMAGE_MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });
      output = { data: result.data, width: result.info.width, height: result.info.height };
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      throw new UnprocessableEntityException({
        code: 'IMAGE_INVALID',
        message: 'Không đọc được ảnh này',
      });
    }

    const id = randomUUID();
    const relative = join(POSTS_DIR, postId, `${id}.webp`);
    const destination = this.within(root, relative);
    await mkdir(resolve(destination, '..'), { recursive: true, mode: 0o700 });
    const temporary = `${destination}.tmp`;
    await writeFile(temporary, output.data, { mode: 0o600 });
    try {
      await rename(temporary, destination);
      await this.repository.insertImage(this.database, {
        id,
        postId,
        path: relative,
        mime: 'image/webp',
        bytes: output.data.length,
        width: output.width,
        height: output.height,
      });
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      await unlink(destination).catch(() => undefined);
      throw error;
    }
    return { id, url: `${POST_IMAGE_URL_PREFIX}${id}`, width: output.width, height: output.height };
  }

  /** Tệp của một ảnh để phát công khai; 404 khi không có ảnh hoặc tệp đã mất. */
  async open(imageId: string): Promise<OpenedPostImage> {
    const row = await this.repository.image(this.database, imageId);
    if (!row) throw imageNotFound();
    const root = this.root();
    try {
      const canonicalRoot = await realpath(root);
      const path = await realpath(this.within(root, row.path));
      if (!path.startsWith(`${canonicalRoot}${sep}`)) throw new Error('outside root');
      const info = await stat(path);
      if (!info.isFile()) throw new Error('not a file');
      return { path, size: info.size, mime: row.mime };
    } catch {
      throw imageNotFound();
    }
  }

  read(path: string): Readable {
    return createReadStream(path);
  }

  /** Xoá thư mục ảnh của một bài (nháp bị xoá). Dọn dẹp tốt nhất có thể, không bao giờ làm hỏng nghiệp vụ. */
  async removePostFiles(postId: string): Promise<void> {
    try {
      const root = this.root();
      await rm(this.within(root, join(POSTS_DIR, postId)), { recursive: true, force: true });
    } catch {
      // Tệp còn sót không ảnh hưởng người dùng.
    }
  }

  private root(): string {
    const configured = this.config.get<string>('MEDIA_ROOT');
    if (!configured || !isAbsolute(configured))
      throw new ServiceUnavailableException({
        code: 'MEDIA_NOT_CONFIGURED',
        message: 'Kho lưu trữ media chưa được cấu hình',
      });
    return resolve(configured);
  }

  private within(root: string, relative: string): string {
    const target = resolve(root, relative);
    if (relative.includes('\0') || !target.startsWith(`${root}${sep}`))
      throw new NotFoundException({ code: 'IMAGE_NOT_FOUND', message: 'Không tìm thấy ảnh' });
    return target;
  }
}

const imageNotFound = () =>
  new NotFoundException({ code: 'IMAGE_NOT_FOUND', message: 'Không tìm thấy ảnh' });

/** Đọc cả luồng vào bộ nhớ nhưng từ chối ngay khi vượt 5 MB, không đợi nhận hết. */
async function readLimited(stream: AsyncIterable<Buffer | Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const incoming of stream) {
    const chunk = Buffer.from(incoming);
    size += chunk.length;
    if (size > POST_IMAGE_MAX_BYTES)
      throw new PayloadTooLargeException({
        code: 'IMAGE_TOO_LARGE',
        message: 'Ảnh tối đa 5 MB',
      });
    chunks.push(chunk);
  }
  if (size === 0)
    throw new UnprocessableEntityException({ code: 'IMAGE_INVALID', message: 'File rỗng' });
  return Buffer.concat(chunks, size);
}
