/**
 * Hồ sơ trên sàn và `GET /me`: nhân vật đang mặc (`tf_profiles`), tên gợi ý lấy từ tài khoản IQX và
 * quyền SACO của chính người gọi (cả khi đã bị gỡ, `active: false`). Khách chưa đăng nhập có hồ sơ
 * riêng trong `tf_guests` (tạo bằng `createGuest`, không có quyền SACO và không có tên gợi ý).
 */

import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import { hashGuestToken, newGuestToken, splitOwner, type FloorActor } from './floor-actor.js';
import {
  GuestCreateLimiter,
  avatarAllowedFor,
  cleanName,
  suggestName,
} from './floor-profile.logic.js';
import { FLOOR_PROFILE_REPOSITORY, type FloorProfileRepository } from './floor-profile.repository.js';
import { FloorPresence } from './floor-presence.js';
import {
  FLOOR_SACO_REPOSITORY,
  toSacoSelf,
  type FloorSacoRepository,
} from './floor-saco.repository.js';
import type { FloorAvatarId, FloorOutfitColorId, FloorProfile, SacoSelf } from './floor-types.js';

export interface FloorMe {
  profile: FloorProfile | null;
  suggestedName: string;
  saco: SacoSelf | null;
  /** Đang vào bằng nhân vật khách (chưa đăng nhập). */
  guest: boolean;
}

export interface FloorGuestCreated {
  /** Token ngẫu nhiên, chỉ trả đúng một lần; trình duyệt giữ và gửi lại qua `x-floor-guest`. */
  token: string;
  guestId: string;
  profile: FloorProfile;
}

const invalidName = () =>
  new UnprocessableEntityException({
    code: 'INVALID_NAME',
    message: 'Tên hiển thị cần từ 2 đến 20 ký tự',
  });

@Injectable()
export class FloorProfileService {
  private readonly guestLimiter = new GuestCreateLimiter();

  constructor(
    private readonly database: DatabaseService,
    @Inject(FLOOR_PROFILE_REPOSITORY) private readonly profiles: FloorProfileRepository,
    @Inject(FLOOR_SACO_REPOSITORY) private readonly sacos: FloorSacoRepository,
    private readonly presence: FloorPresence,
  ) {}

  async me(actor: FloorActor): Promise<FloorMe> {
    if (actor.kind === 'guest') {
      const profile = await this.profiles.findGuest(this.database, actor.id);
      if (!profile) throw guestInvalid();
      return { profile, suggestedName: '', saco: null, guest: true };
    }
    const userId = actor.id;
    const [profile, basics, saco] = await Promise.all([
      this.profiles.find(this.database, userId),
      this.profiles.userBasics(this.database, userId),
      this.sacos.findByUser(this.database, userId),
    ]);
    return {
      profile,
      suggestedName: suggestName(basics?.fullName, basics?.username),
      saco: saco ? toSacoSelf(saco) : null,
      guest: false,
    };
  }

  /**
   * Tên hiển thị của một chủ cuộc chat (`ownerId`): với tài khoản là hồ sơ trên sàn, nếu chưa có thì họ
   * tên; với khách (`g:<uuid>`) là tên khách.
   */
  async displayName(ownerId: string): Promise<string> {
    const { userId, guestId } = splitOwner(ownerId);
    if (guestId) return (await this.profiles.findGuest(this.database, guestId))?.name ?? 'Khách';
    const profile = await this.profiles.find(this.database, userId!);
    if (profile) return profile.name;
    const basics = await this.profiles.userBasics(this.database, userId!);
    return basics ? suggestName(basics.fullName, basics.username) : 'Khách';
  }

  /** Tạo hoặc đổi nhân vật của tài khoản đăng nhập, hoặc của khách (đổi tên và dáng, không tạo mới). */
  async save(
    actor: FloorActor,
    input: { name: string; avatar: FloorAvatarId; color: FloorOutfitColorId },
    now = new Date(),
  ): Promise<FloorProfile> {
    const name = cleanName(input.name);
    if (!name) throw invalidName();
    const profile: FloorProfile = { name, avatar: input.avatar, color: input.color };
    if (actor.kind === 'guest') {
      if (!avatarAllowedFor(input.avatar, null)) throw avatarReserved();
      if (!(await this.profiles.updateGuest(this.database, actor.id, profile, now))) {
        throw guestInvalid();
      }
      this.presence.profileChanged(actor.key, profile);
      return profile;
    }
    const basics = await this.profiles.userBasics(this.database, actor.id);
    if (!basics) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Không tìm thấy tài khoản' });
    }
    if (!avatarAllowedFor(input.avatar, basics.username)) throw avatarReserved();
    await this.profiles.upsert(this.database, actor.id, profile, now);
    this.presence.profileChanged(actor.id, profile);
    return profile;
  }

  /**
   * Khách tạo nhân vật chỉ bằng tên và dáng: sinh token ngẫu nhiên, lưu băm. Mỗi IP tối đa
   * `FLOOR_GUEST_CREATE_MAX` lần mỗi giờ (429 `GUEST_RATE_LIMIT`).
   */
  async createGuest(
    ip: string | null | undefined,
    input: { name: string; avatar: FloorAvatarId; color: FloorOutfitColorId },
    nowMs = Date.now(),
  ): Promise<FloorGuestCreated> {
    const name = cleanName(input.name);
    if (!name) throw invalidName();
    if (!avatarAllowedFor(input.avatar, null)) throw avatarReserved();
    if (!this.guestLimiter.take(ip || 'unknown', nowMs)) {
      throw new HttpException(
        {
          code: 'GUEST_RATE_LIMIT',
          message: 'Bạn tạo nhân vật quá nhiều lần, hãy thử lại sau ít phút hoặc đăng nhập',
        },
        429,
      );
    }
    const profile: FloorProfile = { name, avatar: input.avatar, color: input.color };
    const token = newGuestToken();
    const guestId = await this.profiles.createGuest(this.database, {
      tokenHash: hashGuestToken(token),
      profile,
      ip: ip ? ip.slice(0, 45) : null,
    });
    return { token, guestId, profile };
  }
}

const guestInvalid = () =>
  new UnauthorizedException({
    code: 'GUEST_INVALID',
    message: 'Phiên khách không hợp lệ, hãy tạo lại nhân vật',
  });

const avatarReserved = () =>
  new ForbiddenException({
    code: 'AVATAR_RESERVED',
    message: 'Nhân vật này là nhân vật riêng, bạn không dùng được',
  });
