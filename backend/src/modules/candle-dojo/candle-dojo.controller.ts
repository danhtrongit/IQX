import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { CandleDojoService } from './candle-dojo.service.js';
import {
  attemptIdParamSchema,
  cardIdParamSchema,
  cardPurchaseBodySchema,
  cardPurchaseResultSchema,
  cardsSchema,
  drillCompleteBodySchema,
  drillResultSchema,
  examAnswerBodySchema,
  examAnswerResultSchema,
  examStartBodySchema,
  examStartResultSchema,
  introResultSchema,
  lessonCompleteBodySchema,
  lessonResultSchema,
  stateSchema,
  type CardPurchaseBody,
  type DrillCompleteBody,
  type ExamAnswerBody,
  type ExamStartBody,
  type LessonCompleteBody,
} from './candle-dojo.schemas.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/**
 * Candle Dojo (spec v1.2): tiến độ học, bài thi đai, luyện công và thẻ nến. Dành cho mọi tài khoản đã đăng
 * nhập (miễn phí, không cần Premium). Chủ sở hữu luôn lấy từ phiên đăng nhập; máy khách không bao giờ gửi
 * số dư, sao, đai hay thưởng: server chấm lại và quyết định.
 */
@ApiTags('Candle Dojo')
@Controller('api/v2/candle-dojo')
export class CandleDojoController {
  constructor(private readonly dojo: CandleDojoService) {}

  @Get('state')
  @ApiOperation({
    operationId: 'getCandleDojoState',
    summary: 'Đai, bài đã học, kho thẻ và chuỗi luyện công của tôi (chỉ đọc)',
  })
  @ApiOkResponse({ schema: openApi(stateSchema) })
  state(@CurrentUser() user: AuthenticatedUser) {
    return this.dojo.getState(user.id);
  }

  @Post('intro/complete')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'completeCandleDojoIntro',
    summary: 'Xong Nhập môn: đai trắng, mở Dojo 1, +100 xu lần đầu (idempotent)',
  })
  @ApiOkResponse({ schema: openApi(introResultSchema) })
  completeIntro(@CurrentUser() user: AuthenticatedUser) {
    return this.dojo.completeIntro(user.id);
  }

  @Post('lessons/:lessonId/complete')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'completeCandleDojoLesson',
    summary:
      'Xong một bài: server chấm Săn nến và Song sinh, lưu sao cao nhất, +100 xu lần đầu (idempotent)',
  })
  @ApiOkResponse({ schema: openApi(lessonResultSchema) })
  @ApiConflictResponse({ description: 'LESSON_LOCKED: bài chưa mở' })
  completeLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Body({ schema: lessonCompleteBodySchema }) body: LessonCompleteBody,
  ) {
    return this.dojo.completeLesson(user.id, lessonId, body);
  }

  @Post('drill/complete')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'completeCandleDojoDrill',
    summary: 'Luyện công mỗi ngày: +20 xu một lần mỗi ngày (giờ Việt Nam), giữ chuỗi ngày',
  })
  @ApiOkResponse({ schema: openApi(drillResultSchema) })
  @ApiConflictResponse({ description: 'DRILL_LOCKED (chưa có đai vàng) hoặc LESSON_LOCKED' })
  completeDrill(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: drillCompleteBodySchema }) body: DrillCompleteBody,
  ) {
    return this.dojo.completeDrill(user.id, body);
  }

  @Post('exams')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'startCandleDojoExam',
    summary: 'Mở lượt thi đai của một Dojo: 8 câu do server ra đề, không kèm đáp án',
  })
  @ApiOkResponse({ schema: openApi(examStartResultSchema) })
  @ApiConflictResponse({ description: 'EXAM_LOCKED: chưa học xong mọi bài của Dojo' })
  startExam(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: examStartBodySchema }) body: ExamStartBody,
  ) {
    return this.dojo.startExam(user.id, body.dojo);
  }

  @Post('exams/:attemptId/answers')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'answerCandleDojoExam',
    summary:
      'Trả lời một câu thi đai: server báo đúng/sai kèm đáp án; câu cuối chốt điểm, lên đai và +300 xu lần đầu',
  })
  @ApiOkResponse({ schema: openApi(examAnswerResultSchema) })
  @ApiConflictResponse({ description: 'EXAM_CLOSED hoặc EXAM_ALREADY_ANSWERED' })
  answerExam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId', { schema: attemptIdParamSchema }) attemptId: string,
    @Body({ schema: examAnswerBodySchema }) body: ExamAnswerBody,
  ) {
    return this.dojo.answerExam(user.id, attemptId, body);
  }

  @Get('cards')
  @ApiOperation({
    operationId: 'listCandleDojoCards',
    summary: 'Bộ 47 thẻ nến kèm giá, trạng thái sở hữu và mở khoá của tôi (mục Thẻ nến trong Shop)',
  })
  @ApiOkResponse({ schema: openApi(cardsSchema) })
  cards(@CurrentUser() user: AuthenticatedUser) {
    return this.dojo.getCards(user.id);
  }

  @Post('cards/:cardId/purchase')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'purchaseCandleDojoCard',
    summary:
      'Mua một thẻ nến bằng xu: đã học xong bài của thẻ, chưa có thẻ, đủ xu (khoá duy nhất theo thẻ)',
  })
  @ApiOkResponse({ schema: openApi(cardPurchaseResultSchema) })
  @ApiConflictResponse({
    description:
      'CARD_OWNED, CARD_LOCKED, PRICE_CHANGED, CATALOG_CHANGED, INSUFFICIENT_XU (details[0] có balance_xu/price_xu/shortfall_xu)',
  })
  purchaseCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cardId', { schema: cardIdParamSchema }) cardId: string,
    @Body({ schema: cardPurchaseBodySchema }) body: CardPurchaseBody,
  ) {
    return this.dojo.purchaseCard(user.id, cardId, body);
  }
}
