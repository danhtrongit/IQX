import { Controller, Get, Injectable, Module, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags, type SchemaObject } from '@nestjs/swagger';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/index.js';

/**
 * Legacy LS_/CTV_ referral profile (admin spec v1.0). Admin spec v1.1 §3.6 drops the partner
 * kinds and the admin enrollment endpoints; codes are now team-lead usernames
 * (modules/team-leads). Only the user's own read remains for existing partners, and old
 * ledger rows and `referral.enroll` audit rows are kept as history.
 */
type PartnerKind = 'lead_sale' | 'ctv';
type ReferralProfile = {
  referral_code: string | null;
  referral_partner_kind: PartnerKind | null;
  referred_by_user_id: string | null;
  referral_lead_user_id: string | null;
  referral_url: string | null;
};

const PROFILE_COLUMNS = `referral_code, referral_partner_kind, referred_by_user_id,
  referral_lead_user_id,
  case when referral_code is null then null else concat('/?ref=', referral_code) end as referral_url`;
const PROFILE_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: [
    'referral_code',
    'referral_partner_kind',
    'referred_by_user_id',
    'referral_lead_user_id',
    'referral_url',
  ],
  properties: {
    referral_code: { type: 'string', nullable: true },
    referral_partner_kind: { type: 'string', enum: ['lead_sale', 'ctv'], nullable: true },
    referred_by_user_id: { type: 'string', format: 'uuid', nullable: true },
    referral_lead_user_id: { type: 'string', format: 'uuid', nullable: true },
    referral_url: { type: 'string', nullable: true },
  },
};

@Injectable()
export class ReferralsService {
  constructor(private readonly database: DatabaseService) {}

  async mine(userId: string): Promise<ReferralProfile> {
    const [row] = await this.database.query<ReferralProfile>(
      `select ${PROFILE_COLUMNS} from users where id = $1`,
      [userId],
    );
    if (!row)
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng' });
    return row;
  }
}

@Controller(['api/v1/referrals', 'api/v2/referrals'])
@ApiTags('Referrals')
@ApiBearerAuth()
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}
  @Get('me')
  @ApiOkResponse({ schema: PROFILE_SCHEMA })
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.referrals.mine(user.id);
  }
}

@Module({
  imports: [DatabaseModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
