/**
 * Hồ sơ trên sàn và `GET /me`: nhân vật đang mặc (`tf_profiles`), tên gợi ý lấy từ tài khoản IQX và
 * quyền SACO của chính người gọi (cả khi đã bị gỡ, `active: false`).
 */

import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import { cleanName, suggestName } from './floor-profile.logic.js';
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
}

@Injectable()
export class FloorProfileService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(FLOOR_PROFILE_REPOSITORY) private readonly profiles: FloorProfileRepository,
    @Inject(FLOOR_SACO_REPOSITORY) private readonly sacos: FloorSacoRepository,
    private readonly presence: FloorPresence,
  ) {}

  async me(userId: string): Promise<FloorMe> {
    const [profile, basics, saco] = await Promise.all([
      this.profiles.find(this.database, userId),
      this.profiles.userBasics(this.database, userId),
      this.sacos.findByUser(this.database, userId),
    ]);
    return {
      profile,
      suggestedName: suggestName(basics?.fullName, basics?.username),
      saco: saco ? toSacoSelf(saco) : null,
    };
  }

  /** Tên và nhân vật hiển thị của một tài khoản: hồ sơ trên sàn, nếu chưa có thì họ tên. */
  async displayName(userId: string): Promise<string> {
    const profile = await this.profiles.find(this.database, userId);
    if (profile) return profile.name;
    const basics = await this.profiles.userBasics(this.database, userId);
    return basics ? suggestName(basics.fullName, basics.username) : 'Khách';
  }

  async save(
    userId: string,
    input: { name: string; avatar: FloorAvatarId; color: FloorOutfitColorId },
    now = new Date(),
  ): Promise<FloorProfile> {
    const name = cleanName(input.name);
    if (!name) {
      throw new UnprocessableEntityException({
        code: 'INVALID_NAME',
        message: 'Tên hiển thị cần từ 2 đến 20 ký tự',
      });
    }
    const basics = await this.profiles.userBasics(this.database, userId);
    if (!basics) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Không tìm thấy tài khoản' });
    }
    const profile: FloorProfile = { name, avatar: input.avatar, color: input.color };
    await this.profiles.upsert(this.database, userId, profile, now);
    this.presence.profileChanged(userId, profile);
    return profile;
  }
}
