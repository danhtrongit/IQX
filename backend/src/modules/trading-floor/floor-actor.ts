/**
 * Danh tính trên Khu giao dịch: một tài khoản IQX đã đăng nhập hoặc một khách (`tf_guests`, chỉ có tên và
 * nhân vật). `key` là khoá dùng chung cho mọi bảng/bộ nhớ không gắn khoá ngoại tới `users`:
 * `u:<uuid tài khoản>` hoặc `g:<uuid khách>`.
 *
 * REST: endpoint đánh dấu `@Public()` rồi gọi `FloorActors.fromRequest(req)` (đọc `Authorization: Bearer`
 * nếu có, ngược lại header `x-floor-guest`). WebSocket: thông điệp `auth` mang `token` hoặc `guest`.
 */

import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import { AuthService } from '../auth/auth.service.js';

export type FloorActorKind = 'user' | 'guest';

export interface FloorActor {
  /** `u:<uuid>` hoặc `g:<uuid>`. */
  readonly key: string;
  readonly kind: FloorActorKind;
  /** uuid của tài khoản (kind user) hoặc của khách (kind guest). */
  readonly id: string;
  /** uuid tài khoản khi đã đăng nhập, null với khách. */
  readonly userId: string | null;
}

export const FLOOR_GUEST_HEADER = 'x-floor-guest';

export const userActor = (userId: string): FloorActor => ({
  key: `u:${userId}`,
  kind: 'user',
  id: userId,
  userId,
});

export const guestActor = (guestId: string): FloorActor => ({
  key: `g:${guestId}`,
  kind: 'guest',
  id: guestId,
  userId: null,
});

export const isGuestKey = (key: string): boolean => key.startsWith('g:');

/**
 * Chủ của một cuộc chat với SACO: uuid thô của tài khoản, hoặc `g:<uuid khách>`. Cùng quy ước với
 * `conn.userId` của `FloorHub`, nên `FloorEvents.toUser(ownerId)` tới đúng socket cả với khách.
 */
export const ownerIdOf = (actor: FloorActor): string => actor.userId ?? actor.key;

/** Tách chủ cuộc chat thành cột `user_id` (tài khoản) hoặc `guest_id` (khách); đúng một trong hai có giá trị. */
export const splitOwner = (
  ownerId: string,
): { userId: string | null; guestId: string | null } =>
  isGuestKey(ownerId)
    ? { userId: null, guestId: ownerId.slice(2) }
    : { userId: ownerId, guestId: null };

export const hashGuestToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const newGuestToken = (): string => randomBytes(32).toString('base64url');

const GUEST_TOKEN_RE = /^[A-Za-z0-9_-]{40,60}$/;

type HeaderBag = Record<string, string | string[] | undefined>;

const headerOf = (headers: HeaderBag, name: string): string => {
  const value = headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
};

@Injectable()
export class FloorActors {
  constructor(
    private readonly database: DatabaseService,
    @Inject(AuthService) private readonly auth: Pick<AuthService, 'authenticate'>,
  ) {}

  /** Danh tính từ access token hoặc token khách; null khi không có cả hai. Token sai thì 401. */
  async resolve(input: { accessToken?: string; guestToken?: string }): Promise<FloorActor | null> {
    const access = input.accessToken?.trim();
    if (access) return userActor((await this.auth.authenticate(access)).id);
    const guest = input.guestToken?.trim();
    if (!guest) return null;
    const guestId = await this.guestIdOf(guest);
    if (!guestId) {
      throw new UnauthorizedException({
        code: 'GUEST_INVALID',
        message: 'Phiên khách không hợp lệ, hãy tạo lại nhân vật',
      });
    }
    return guestActor(guestId);
  }

  async fromRequest(req: { headers: HeaderBag }): Promise<FloorActor | null> {
    const authorization = headerOf(req.headers, 'authorization');
    const accessToken = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
    return this.resolve({ accessToken, guestToken: headerOf(req.headers, FLOOR_GUEST_HEADER) });
  }

  /** Như `fromRequest` nhưng bắt buộc có danh tính. */
  async require(req: { headers: HeaderBag }): Promise<FloorActor> {
    const actor = await this.fromRequest(req);
    if (!actor) {
      throw new UnauthorizedException({
        code: 'FLOOR_IDENTITY_REQUIRED',
        message: 'Hãy nhập tên và tạo nhân vật để vào Khu giao dịch',
      });
    }
    return actor;
  }

  private async guestIdOf(token: string): Promise<string | null> {
    if (!GUEST_TOKEN_RE.test(token)) return null;
    const rows = await this.database.query<{ id: string }>(
      `update tf_guests set last_seen_at = now()
        where token_hash = $1
        returning id`,
      [hashGuestToken(token)],
    );
    return rows[0] ? String(rows[0].id) : null;
  }
}
