/**
 * Ảnh trong Nhắn tin với SACO: cùng giới hạn với ảnh bài SACO (5 MB, đo ngay khi đang nhận; JPG, PNG,
 * WebP nhận dạng bằng byte đầu), nén lại bằng sharp (xoay theo EXIF, cạnh dài tối đa 1600 px, WebP, bỏ
 * metadata) rồi lưu ở `<MEDIA_ROOT>/floor-chat/<convId>/<imageId>.webp`. Ảnh được phát theo uuid khó đoán;
 * thu hồi tin thì tệp bị xoá. Quyền trong cuộc chat do `FloorChatService` kiểm tra trước.
 */

import { createReadStream } from 'node:fs';
import { mkdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

import {
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

import { POST_IMAGE_MAX_BYTES } from './saco-posts-images.service.js';

export const CHAT_IMAGE_MAX_BYTES = POST_IMAGE_MAX_BYTES;
/** Cạnh dài tối đa sau khi nén. */
export const CHAT_IMAGE_MAX_EDGE = 1600;
const WEBP_QUALITY = 80;
const MAX_INPUT_PIXELS = 50_000_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CHAT_DIR = 'floor-chat';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CompressedChatImage = { data: Buffer; width: number; height: number };

const imageNotFound = () =>
  new NotFoundException({ code: 'IMAGE_NOT_FOUND', message: 'Không tìm thấy ảnh' });

@Injectable()
export class FloorChatImagesService {
  constructor(private readonly config: ConfigService<Record<string, unknown>, false>) {}

  /** Nhận cả luồng (từ chối ngay khi quá 5 MB), kiểm tra định dạng và nén lại thành WebP. */
  async compress(stream: AsyncIterable<Buffer | Uint8Array>): Promise<CompressedChatImage> {
    // Kho chưa cấu hình thì báo trước khi nhận cả tệp.
    this.root();
    const input = await readLimited(stream);
    const detected = await fileTypeFromBuffer(input).catch(() => undefined);
    if (!detected || !ALLOWED_MIME.has(detected.mime))
      throw new UnsupportedMediaTypeException({
        code: 'IMAGE_UNSUPPORTED',
        message: 'Chỉ nhận ảnh JPG, PNG hoặc WebP',
      });
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
        .resize({
          width: CHAT_IMAGE_MAX_EDGE,
          height: CHAT_IMAGE_MAX_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });
      return { data: result.data, width: result.info.width, height: result.info.height };
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      throw new UnprocessableEntityException({
        code: 'IMAGE_INVALID',
        message: 'Không đọc được ảnh này',
      });
    }
  }

  /** Ghi tệp đã nén (ghi tạm rồi đổi tên để không ai đọc được tệp dở). */
  async save(convId: string, imageId: string, data: Buffer): Promise<void> {
    const destination = this.fileOf(convId, imageId);
    await mkdir(resolve(destination, '..'), { recursive: true, mode: 0o700 });
    const temporary = `${destination}.tmp`;
    await writeFile(temporary, data, { mode: 0o600 });
    try {
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  /** Tệp của một ảnh để phát; 404 khi tệp đã mất. */
  async open(convId: string, imageId: string): Promise<{ path: string; size: number }> {
    try {
      const canonicalRoot = await realpath(this.root());
      const path = await realpath(this.fileOf(convId, imageId));
      if (!path.startsWith(`${canonicalRoot}${sep}`)) throw new Error('outside root');
      const info = await stat(path);
      if (!info.isFile()) throw new Error('not a file');
      return { path, size: info.size };
    } catch {
      throw imageNotFound();
    }
  }

  read(path: string): Readable {
    return createReadStream(path);
  }

  /** Xoá tệp của một ảnh (tin bị thu hồi, hoặc ghi tin thất bại). Không bao giờ làm hỏng nghiệp vụ. */
  async remove(convId: string, imageId: string): Promise<void> {
    try {
      await unlink(this.fileOf(convId, imageId));
    } catch {
      // Tệp đã mất hoặc kho chưa cấu hình: không còn gì để xoá.
    }
  }

  private fileOf(convId: string, imageId: string): string {
    if (!UUID.test(convId) || !UUID.test(imageId)) throw imageNotFound();
    const root = this.root();
    const target = resolve(root, join(CHAT_DIR, convId, `${imageId}.webp`));
    if (!target.startsWith(`${root}${sep}`)) throw imageNotFound();
    return target;
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
}

/** Đọc cả luồng vào bộ nhớ nhưng từ chối ngay khi vượt 5 MB, không đợi nhận hết. */
async function readLimited(stream: AsyncIterable<Buffer | Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const incoming of stream) {
    const chunk = Buffer.from(incoming);
    size += chunk.length;
    if (size > CHAT_IMAGE_MAX_BYTES)
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
