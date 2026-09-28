import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { CurrentUser, Roles, type AuthenticatedUser } from '../auth/index.js';

type PartnerKind = 'lead_sale' | 'ctv';
type ReferralProfile = {
  referral_code: string | null;
  referral_partner_kind: PartnerKind | null;
  referred_by_user_id: string | null;
  referral_lead_user_id: string | null;
  referral_url: string | null;
};
type EnrollmentAudit = {
  adminId: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
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
const enrollmentSchema = z
  .object({
    kind: z.enum(['lead_sale', 'ctv']),
    lead_user_id: z.string().uuid().optional(),
  })
  .strict();

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

  async enroll(
    userId: string,
    kind: PartnerKind,
    leadUserId?: string | null,
    audit?: EnrollmentAudit,
  ): Promise<ReferralProfile> {
    if (kind === 'ctv' && !leadUserId)
      throw new BadRequestException({
        code: 'LEAD_REQUIRED',
        message: 'CTV phải thuộc một Lead Sale',
      });
    if (leadUserId === userId || (kind === 'lead_sale' && leadUserId))
      throw new BadRequestException({ code: 'LEAD_INVALID', message: 'Lead Sale không hợp lệ' });

    return this.database.transaction(async (tx) => {
      const [user] = await tx.query<ReferralProfile>(
        `select ${PROFILE_COLUMNS} from users
         where id = $1 and status = 'active' and deleted_at is null for update`,
        [userId],
      );
      if (!user)
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: 'Không tìm thấy người dùng hoạt động',
        });
      if (user.referral_partner_kind) {
        if (
          user.referral_partner_kind !== kind ||
          user.referral_lead_user_id !== (leadUserId ?? null)
        )
          throw new BadRequestException({
            code: 'REFERRAL_ENROLLMENT_IMMUTABLE',
            message: 'Không thể thay đổi vai trò hoặc Lead Sale đã gán',
          });
        return user;
      }
      if (kind === 'ctv') {
        const [lead] = await tx.query<{ id: string }>(
          `select id from users where id = $1 and status = 'active' and deleted_at is null
           and referral_partner_kind = 'lead_sale' for share`,
          [leadUserId],
        );
        if (!lead)
          throw new BadRequestException({
            code: 'LEAD_INVALID',
            message: 'Lead Sale không hợp lệ',
          });
      }

      let updated: ReferralProfile | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = `${kind === 'ctv' ? 'CTV' : 'LS'}_${randomBytes(5).toString('hex').toUpperCase()}`;
        await tx.query('savepoint referral_code_attempt');
        try {
          [updated] = await tx.query<ReferralProfile>(
            `update users set referral_partner_kind = $2::referral_partner_kind,
                 referral_code = $3, referral_lead_user_id = $4, updated_at = now()
             where id = $1 returning ${PROFILE_COLUMNS}`,
            [userId, kind, code, leadUserId ?? null],
          );
          await tx.query('release savepoint referral_code_attempt');
          break;
        } catch (error) {
          if (!isCodeCollision(error)) throw error;
          await tx.query('rollback to savepoint referral_code_attempt');
          await tx.query('release savepoint referral_code_attempt');
        }
      }
      if (!updated)
        throw new ServiceUnavailableException({
          code: 'REFERRAL_CODE_UNAVAILABLE',
          message: 'Chưa thể sinh mã giới thiệu. Vui lòng thử lại.',
        });
      if (audit) {
        await tx.query(
          `insert into admin_audit_log
             (admin_user_id, action, target_entity, target_id, payload_after, ip, user_agent, request_id)
           values ($1, 'referral.enroll', 'user', $2, $3::jsonb, $4, $5, $6)`,
          [
            audit.adminId,
            userId,
            JSON.stringify(updated),
            audit.ip ?? null,
            audit.userAgent ?? null,
            audit.requestId ?? null,
          ],
        );
      }
      return updated;
    });
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

@Controller(['api/v1/admin/referrals', 'api/v2/admin/referrals'])
@Roles('admin')
@ApiTags('Admin - Referrals')
@ApiBearerAuth()
export class AdminReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get(':userId')
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiOkResponse({ schema: PROFILE_SCHEMA })
  status(@Param('userId') userId: string) {
    validateUuid(userId);
    return this.referrals.mine(userId);
  }

  @Post(':userId/enroll')
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['kind'],
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['lead_sale', 'ctv'] },
        lead_user_id: {
          type: 'string',
          format: 'uuid',
          description: 'Required for CTV; omitted for Lead Sale.',
        },
      },
    },
  })
  @ApiCreatedResponse({ schema: PROFILE_SCHEMA })
  enroll(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    validateUuid(userId);
    const parsed = enrollmentSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'REFERRAL_INPUT_INVALID',
        message: 'Dữ liệu cộng tác viên không hợp lệ',
      });
    return this.referrals.enroll(userId, parsed.data.kind, parsed.data.lead_user_id, {
      adminId: admin.id,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
    });
  }
}

function isCodeCollision(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; constraint?: string; cause?: unknown };
  return (
    (candidate.code === '23505' && candidate.constraint === 'ix_users_referral_code') ||
    (candidate.cause !== undefined && isCodeCollision(candidate.cause))
  );
}

function validateUuid(value: string): void {
  if (!z.string().uuid().safeParse(value).success)
    throw new BadRequestException({ code: 'UUID_INVALID', message: 'ID không hợp lệ' });
}

@Module({
  imports: [DatabaseModule],
  controllers: [ReferralsController, AdminReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
