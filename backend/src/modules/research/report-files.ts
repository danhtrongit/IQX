import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

export interface StoredReportFile {
  /** Media-root-relative path, e.g. "research/2026/10/<sha256>.pdf". */
  filePath: string;
  fileHash: string;
  fileBytes: number;
  /** False when a file with the same hash already existed at that path (nothing written). */
  written: boolean;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Reads MEDIA_ROOT from a ConfigService-like object; it must be an absolute path. */
export function resolveMediaRoot(config: { get(key: string): unknown }): string {
  const root = config.get('MEDIA_ROOT');
  if (typeof root !== 'string' || !isAbsolute(root))
    throw new Error('MEDIA_ROOT is not configured (absolute path required)');
  return resolve(root);
}

/** Stores the bytes at `<root>/research/YYYY/MM/<sha256>.pdf` (month taken from `reportDate`). */
export async function saveReportFile(
  mediaRoot: string,
  bytes: Uint8Array,
  reportDate: string,
): Promise<StoredReportFile> {
  const fileHash = sha256Hex(bytes);
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(reportDate);
  const [year, month] = match
    ? [match[1], match[2]]
    : [String(new Date().getUTCFullYear()), String(new Date().getUTCMonth() + 1).padStart(2, '0')];
  const filePath = `research/${year}/${month}/${fileHash}.pdf`;
  const absolute = resolveWithin(mediaRoot, filePath);
  const exists = await access(absolute).then(
    () => true,
    () => false,
  );
  if (!exists) {
    await mkdir(dirname(absolute), { recursive: true });
    const tmp = `${absolute}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, absolute);
  }
  return { filePath, fileHash, fileBytes: bytes.byteLength, written: !exists };
}

export async function readReportFile(mediaRoot: string, filePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolveWithin(mediaRoot, filePath)));
}

function resolveWithin(mediaRoot: string, relative: string): string {
  const root = resolve(mediaRoot);
  const target = resolve(join(root, relative));
  if (!target.startsWith(root + sep)) throw new Error('Report file path escapes the media root');
  return target;
}

/** Nest wrapper around the helpers above, bound to the configured MEDIA_ROOT. */
@Injectable()
export class ReportFiles {
  constructor(private readonly config: ConfigService) {}

  save(bytes: Uint8Array, reportDate: string): Promise<StoredReportFile> {
    return saveReportFile(resolveMediaRoot(this.config), bytes, reportDate);
  }

  read(filePath: string): Promise<Uint8Array> {
    return readReportFile(resolveMediaRoot(this.config), filePath);
  }
}
