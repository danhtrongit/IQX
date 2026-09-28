import { createHash, randomUUID } from 'node:crypto';

import { ConflictException, Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../../platform/database/index.js';

export type RecordJourneyEventInput = {
  userId: string;
  name: string;
  fields?: Record<string, string | number | boolean | null>;
  eventId?: string;
  dedupKey?: string;
  source?: 'client' | 'server';
};

type JourneyEventRow = {
  id: string;
  user_id: string;
  name: string;
  source: string;
  occurred_at: Date | string;
  fields: Record<string, unknown>;
};

@Injectable()
export class JourneyEventService {
  constructor(private readonly database: DatabaseService) {}

  async record(input: RecordJourneyEventInput): Promise<JourneyEventRow> {
    return this.database.transaction((tx) => this.recordInTransaction(tx, input));
  }

  async recordInTransaction(
    tx: SqlClient,
    input: RecordJourneyEventInput,
  ): Promise<JourneyEventRow> {
    const id = input.eventId ?? (input.dedupKey ? deterministicEventId(input) : randomUUID());
    const source = input.source ?? 'server';
    const fields = input.fields ?? {};
    const rows = await tx.query<JourneyEventRow>(
      `insert into journey_events (id, user_id, name, source, occurred_at, fields)
       values ($1, $2, $3, $4, now(), $5::json)
       on conflict (id) do nothing
       returning id, user_id, name, source, occurred_at, fields`,
      [id, input.userId, input.name, source, JSON.stringify(fields)],
    );
    const row =
      rows[0] ??
      (
        await tx.query<JourneyEventRow>(
          `select id, user_id, name, source, occurred_at, fields
       from journey_events where id = $1 limit 1`,
          [id],
        )
      )[0];
    if (
      !row ||
      row.user_id !== input.userId ||
      row.name !== input.name ||
      row.source !== source ||
      (source === 'client' && stableJson(row.fields) !== stableJson(fields))
    ) {
      throw new ConflictException({
        code: 'JOURNEY_EVENT_ID_CONFLICT',
        message: 'Mã sự kiện đã được sử dụng',
      });
    }
    return row;
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function deterministicEventId(input: RecordJourneyEventInput): string {
  // PostgreSQL computes the UUIDv5 in v1. V2 intentionally avoids an extension
  // dependency here: a stable SHA-1 UUID is produced locally from public text.
  const digest = createHash('sha1')
    .update(`iqx:${input.userId}:${input.name}:${input.dedupKey}`)
    .digest();
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
