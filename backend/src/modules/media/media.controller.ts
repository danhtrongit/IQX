import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../auth/index.js';
import { MediaStorageService } from './media-storage.service.js';

@Controller('api/v2/media')
export class MediaController {
  constructor(private readonly media: MediaStorageService) {}

  @Public()
  @Get(':token')
  async download(
    @Param('token') token: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const payload = this.media.verify(token);
    const file = await this.media.file(payload.path);
    const range = parseRange(request.headers.range, file.size);
    if (request.headers.range && range === null) {
      reply.header('Content-Range', `bytes */${file.size}`).status(416).send();
      return;
    }
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', file.mime);
    reply.header('Cache-Control', 'private, max-age=60');
    reply.header('X-Content-Type-Options', 'nosniff');
    if (range) {
      reply
        .status(206)
        .header('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`)
        .header('Content-Length', String(range.end - range.start + 1));
      await reply.send(this.media.read(file.path, range.start, range.end));
      return;
    }
    reply.header('Content-Length', String(file.size));
    await reply.send(this.media.read(file.path));
  }
}

function parseRange(
  value: string | undefined,
  size: number,
): { start: number; end: number } | null | undefined {
  if (!value) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match) return null;
  const startText = match[1] ?? '';
  const endText = match[2] ?? '';
  let start: number;
  let end: number;
  if (!startText) {
    const suffix = Number(endText);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : size - 1;
  }
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    return null;
  return { start, end: Math.min(end, size - 1) };
}
