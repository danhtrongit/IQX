import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { MediaStorageService } from '../../src/modules/media/media-storage.service.js';

const secret = 'test-media-signing-secret-01234567890123456789';
const roots: string[] = [];
function service(root?: string): MediaStorageService {
  return new MediaStorageService(
    new ConfigService({
      MEDIA_ROOT: root,
      MEDIA_SIGNING_SECRET: secret,
      MEDIA_URL_TTL_SECONDS: 300,
    }),
  );
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('MediaStorageService', () => {
  it('streams a bounded PDF to a private UUID path and signs it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'iqx-media-'));
    roots.push(root);
    const storage = service(root);
    const stored = await storage.store(
      (async function* () {
        yield Buffer.from('%PDF-1.7\nbody');
      })(),
      {
        courseId: '123e4567-e89b-12d3-a456-426614174000',
        kind: 'pdf',
        declaredMime: 'application/pdf',
      },
    );
    expect(stored.storageUrl).toMatch(
      /^media:\/\/courses\/123e4567-e89b-12d3-a456-426614174000\/[0-9a-f-]+\.pdf$/,
    );
    const token = storage.sign(stored.storageUrl, 'lesson').split('/').pop()!;
    expect(storage.verify(token).path).toBe(stored.storageUrl.slice('media://'.length));
    const file = await storage.file(stored.storageUrl.slice('media://'.length));
    expect(await readFile(file.path)).toEqual(Buffer.from('%PDF-1.7\nbody'));
  });
  it('rejects mismatched or spoofed MIME and traversal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'iqx-media-'));
    roots.push(root);
    const storage = service(root);
    await expect(
      storage.store(
        (async function* () {
          yield Buffer.from('%PDF-1.7');
        })(),
        {
          courseId: '123e4567-e89b-12d3-a456-426614174000',
          kind: 'pdf',
          declaredMime: 'video/mp4',
        },
      ),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    expect(() =>
      storage.verify(
        'eyJwYXRoIjoiLi4vLi4vZXZjIiwicHVycG9zZSI6Imxlc3NvbiIsImV4cCI6OTk5OTk5OTk5OX0.invalid',
      ),
    ).toThrow(BadRequestException);
    await expect(storage.file('../outside')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('fails closed when storage is not configured', async () => {
    const storage = service(undefined);
    expect(() => storage.sign('media://courses/x/a.pdf', 'lesson')).toThrow(
      ServiceUnavailableException,
    );
  });
  it('does not follow a storage subdirectory symlink outside MEDIA_ROOT', async () => {
    const root = await mkdtemp(join(tmpdir(), 'iqx-media-'));
    roots.push(root);
    const outside = await mkdtemp(join(tmpdir(), 'iqx-media-outside-'));
    roots.push(outside);
    await mkdir(join(root, 'courses'));
    await symlink(outside, join(root, 'courses', '123e4567-e89b-12d3-a456-426614174000'));
    await writeFile(join(outside, 'outside.pdf'), '%PDF-1.7');
    const storage = service(root);
    await expect(
      storage.file('courses/123e4567-e89b-12d3-a456-426614174000/outside.pdf'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      storage.store(
        (async function* () {
          yield Buffer.from('%PDF-1.7');
        })(),
        {
          courseId: '123e4567-e89b-12d3-a456-426614174000',
          kind: 'pdf',
          declaredMime: 'application/pdf',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
