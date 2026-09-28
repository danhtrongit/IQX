import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, realpath, rename, stat, unlink } from 'node:fs/promises';
import { extname, isAbsolute, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { fileTypeFromBuffer } from 'file-type';

export type UploadKind = 'thumbnail' | 'pdf' | 'video';
type TokenPayload = { path: string; exp: number; purpose: 'lesson' | 'thumbnail' };

export type StoredMedia = { storageUrl: string; size: number; mime: string };

@Injectable()
export class MediaStorageService {
  constructor(private readonly config: ConfigService<Record<string, unknown>, false>) {}

  async store(
    stream: AsyncIterable<Buffer | Uint8Array>,
    input: { courseId: string; kind: UploadKind; declaredMime?: string },
  ): Promise<StoredMedia> {
    const root = this.root();
    const courseId = this.safeSegment(input.courseId);
    const id = randomUUID();
    await mkdir(root, { recursive: true, mode: 0o700 });
    const canonicalRoot = await realpath(root);
    const temporaryDirectory = resolve(canonicalRoot, '.tmp');
    await mkdir(temporaryDirectory, { recursive: true, mode: 0o700 });
    const canonicalTemporaryDirectory = await realpath(temporaryDirectory);
    this.assertWithin(canonicalRoot, canonicalTemporaryDirectory);
    const temporary = resolve(canonicalTemporaryDirectory, id);
    const handle = await open(temporary, 'wx', 0o600);
    let size = 0;
    let header = Buffer.alloc(0);
    const max = this.limit(input.kind);
    try {
      for await (const incoming of stream) {
        const chunk = Buffer.from(incoming);
        size += chunk.length;
        if (size > max)
          throw new PayloadTooLargeException({
            code: 'MEDIA_TOO_LARGE',
            message: `File vượt quá giới hạn ${Math.floor(max / 1024 / 1024)}MB`,
          });
        if (header.length < 16)
          header = Buffer.concat([header, chunk.subarray(0, 16 - header.length)]);
        let offset = 0;
        while (offset < chunk.length) {
          const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
          if (bytesWritten <= 0) throw new Error('Unable to write uploaded media');
          offset += bytesWritten;
        }
      }
      if (!size) throw new BadRequestException({ code: 'EMPTY_FILE', message: 'File rỗng' });
      const detected = await detectMime(header);
      this.validateMime(input.kind, input.declaredMime, detected);
      const extension = extensionFor(detected);
      const relative = `courses/${courseId}/${id}.${extension}`;
      const coursesDirectory = resolve(canonicalRoot, 'courses');
      await mkdir(coursesDirectory, { recursive: true, mode: 0o700 });
      const canonicalCoursesDirectory = await realpath(coursesDirectory);
      this.assertWithin(canonicalRoot, canonicalCoursesDirectory);
      const courseDirectory = resolve(canonicalCoursesDirectory, courseId);
      await mkdir(courseDirectory, { recursive: true, mode: 0o700 });
      const canonicalCourseDirectory = await realpath(courseDirectory);
      this.assertWithin(canonicalRoot, canonicalCourseDirectory);
      const destination = resolve(canonicalCourseDirectory, `${id}.${extension}`);
      await handle.close();
      await rename(temporary, destination);
      return { storageUrl: `media://${relative}`, size, mime: detected };
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  sign(storageUrl: string, purpose: TokenPayload['purpose'], ttlSeconds?: number): string {
    this.root();
    const path = this.relativeFromUrl(storageUrl);
    const ttl = ttlSeconds ?? Number(this.config.get('MEDIA_URL_TTL_SECONDS') ?? 300);
    const payload: TokenPayload = {
      path,
      purpose,
      exp: Math.floor(Date.now() / 1000) + Math.max(1, Math.min(ttl, 3600)),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.secret()).update(encoded).digest('base64url');
    return `/api/v2/media/${encoded}.${signature}`;
  }

  verify(token: string): TokenPayload {
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra) throw this.invalidToken();
    const expected = createHmac('sha256', this.secret()).update(encoded).digest();
    let supplied: Buffer;
    try {
      supplied = Buffer.from(signature, 'base64url');
    } catch {
      throw this.invalidToken();
    }
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      throw this.invalidToken();
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      throw this.invalidToken();
    }
    if (!isTokenPayload(payload) || payload.exp < Math.floor(Date.now() / 1000))
      throw this.invalidToken();
    this.resolveStoragePath(payload.path);
    return payload;
  }

  async file(storagePath: string): Promise<{ path: string; size: number; mime: string }> {
    const lexicalPath = this.resolveStoragePath(storagePath);
    let path: string;
    let size: number;
    try {
      const canonicalRoot = await realpath(this.root());
      path = await realpath(lexicalPath);
      this.assertWithin(canonicalRoot, path);
      const info = await stat(path);
      if (!info.isFile()) throw new Error('not a file');
      size = info.size;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException({
        code: 'MEDIA_UNAVAILABLE',
        message: 'Không thể tải nội dung media',
      });
    }
    return { path, size, mime: mimeForExtension(extname(path)) };
  }

  read(path: string, start?: number, end?: number): Readable {
    return createReadStream(path, start === undefined ? undefined : { start, end });
  }

  async remove(storageUrl: string | null): Promise<void> {
    if (!storageUrl?.startsWith('media://')) return;
    try {
      const root = await realpath(this.root());
      const target = await realpath(this.resolveStoragePath(this.relativeFromUrl(storageUrl)));
      this.assertWithin(root, target);
      await unlink(target);
    } catch {
      // Best-effort cleanup. Missing, invalid and out-of-root paths are never
      // followed or deleted.
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
  private secret(): string {
    const value = this.config.get<string>('MEDIA_SIGNING_SECRET');
    if (!value || value.length < 32)
      throw new ServiceUnavailableException({
        code: 'MEDIA_NOT_CONFIGURED',
        message: 'Khóa ký media chưa được cấu hình',
      });
    return value;
  }
  private limit(kind: UploadKind): number {
    const fallback = kind === 'thumbnail' ? 5 : kind === 'pdf' ? 100 : 500;
    return Number(this.config.get(`MEDIA_MAX_${kind.toUpperCase()}_MB`) ?? fallback) * 1024 * 1024;
  }
  private relativeFromUrl(url: string): string {
    if (!url.startsWith('media://'))
      throw new BadRequestException({
        code: 'INVALID_MEDIA_URL',
        message: 'Đường dẫn media không hợp lệ',
      });
    return url.slice('media://'.length);
  }
  private resolveStoragePath(relative: string): string {
    if (!relative || relative.includes('\0') || isAbsolute(relative))
      throw new BadRequestException({
        code: 'INVALID_MEDIA_PATH',
        message: 'Đường dẫn media không hợp lệ',
      });
    const root = this.root();
    const target = resolve(root, relative);
    if (!target.startsWith(`${root}${sep}`))
      throw new BadRequestException({
        code: 'INVALID_MEDIA_PATH',
        message: 'Đường dẫn media không hợp lệ',
      });
    return target;
  }
  private safeSegment(value: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(value))
      throw new BadRequestException({
        code: 'INVALID_MEDIA_PATH',
        message: 'Định danh không hợp lệ',
      });
    return value;
  }
  private assertWithin(root: string, target: string): void {
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      throw new BadRequestException({
        code: 'INVALID_MEDIA_PATH',
        message: 'Đường dẫn media không hợp lệ',
      });
    }
  }
  private validateMime(kind: UploadKind, declared: string | undefined, detected: string): void {
    const allowed =
      kind === 'thumbnail'
        ? ['image/jpeg', 'image/png', 'image/webp']
        : kind === 'pdf'
          ? ['application/pdf']
          : ['video/mp4', 'video/webm'];
    const normalized = declared?.split(';')[0]?.trim().toLowerCase();
    if (
      !allowed.includes(detected) ||
      (normalized && !allowed.includes(normalized)) ||
      (normalized && normalized !== detected)
    ) {
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: `Định dạng file không hợp lệ cho ${kind}`,
      });
    }
  }
  private invalidToken(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_MEDIA_TOKEN',
      message: 'Liên kết media không hợp lệ hoặc đã hết hạn',
    });
  }
}

async function detectMime(header: Buffer): Promise<string> {
  try {
    const detected = await fileTypeFromBuffer(header);
    if (detected?.mime) return detected.mime;
  } catch {
    // Fall back to the strict magic headers below; malformed files are still
    // rejected by validateMime when they do not match a supported type.
  }
  if (header.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (header.length >= 12 && header.subarray(4, 8).toString() === 'ftyp') return 'video/mp4';
  if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video/webm';
  if (header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (header.subarray(0, 4).toString() === 'RIFF' && header.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  return 'application/octet-stream';
}
function extensionFor(mime: string): string {
  return (
    (
      {
        'application/pdf': 'pdf',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      } as Record<string, string>
    )[mime] ?? 'bin'
  );
}
function mimeForExtension(ext: string): string {
  return (
    (
      {
        '.pdf': 'application/pdf',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
      } as Record<string, string>
    )[ext.toLowerCase()] ?? 'application/octet-stream'
  );
}
function isTokenPayload(value: unknown): value is TokenPayload {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.path === 'string' &&
    typeof item.exp === 'number' &&
    (item.purpose === 'lesson' || item.purpose === 'thumbnail')
  );
}
