import { Controller, Get, Injectable, Module, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags, type SchemaObject } from '@nestjs/swagger';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { CURRENT_POLICY_ORDER, type TeamLeadOfferType } from '../team-leads/team-lead-policy.js';

/**
 * The caller's own referral code (settings "Mã giới thiệu" card). Admin spec v1.1 §3.1: only
 * an active team lead has a code, and it is their username; everyone else gets an empty
 * profile. The v1.0 Lead sale / CTV fields are gone (§3.6): converted partners are team leads
 * now, and their old LS_/CTV_ code is only honoured at registration during the
 * LEGACY_REFERRAL_CODE_UNTIL window. Old ledger rows and `referral.enroll` audit rows stay.
 */
type ReferralProfile = {
  is_team_lead: boolean;
  referral_code: string | null;
  referral_url: string | null;
  commission_pct: number | null;
  offer_type: TeamLeadOfferType | null;
  offer_days: number | null;
};

const PROFILE_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: [
    'is_team_lead',
    'referral_code',
    'referral_url',
    'commission_pct',
    'offer_type',
    'offer_days',
  ],
  properties: {
    is_team_lead: { type: 'boolean' },
    referral_code: { type: 'string', nullable: true },
    referral_url: { type: 'string', nullable: true },
    commission_pct: { type: 'integer', minimum: 0, maximum: 100, nullable: true },
    // null listed in the enum so the generated client keeps the type nullable.
    offer_type: { type: 'string', enum: ['none', 'days', 'lifetime', null], nullable: true },
    offer_days: { type: 'integer', nullable: true },
  },
};

@Injectable()
export class ReferralsService {
  constructor(private readonly database: DatabaseService) {}

  async mine(userId: string): Promise<ReferralProfile> {
    const [row] = await this.database.query<{
      username: string;
      lead_active: boolean;
      commission_pct: number | null;
      offer_type: TeamLeadOfferType | null;
      offer_days: number | null;
    }>(
      `select u.username,
              (u.role = 'team_lead' and p.status = 'active') is true as lead_active,
              pol.commission_pct, pol.offer_type, pol.offer_days
         from users u
         left join team_lead_profiles p on p.user_id = u.id
         left join lateral (
           select commission_pct, offer_type, offer_days from team_lead_policies
            where lead_user_id = u.id
            order by ${CURRENT_POLICY_ORDER} limit 1
         ) pol on true
        where u.id = $1 and u.deleted_at is null`,
      [userId],
    );
    if (!row)
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng' });
    if (!row.lead_active || row.offer_type === null) {
      return {
        is_team_lead: false,
        referral_code: null,
        referral_url: null,
        commission_pct: null,
        offer_type: null,
        offer_days: null,
      };
    }
    return {
      is_team_lead: true,
      referral_code: row.username,
      referral_url: `/?ref=${encodeURIComponent(row.username)}`,
      commission_pct: row.commission_pct,
      offer_type: row.offer_type,
      offer_days: row.offer_type === 'days' ? row.offer_days : null,
    };
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
