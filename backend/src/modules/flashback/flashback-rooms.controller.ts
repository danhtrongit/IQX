/**
 * API của Flashback v2 · Phòng chơi (spec v2 §10.2), dưới `api/v2/flashback`.
 *
 * `:code` là ID phòng 6 chữ số; `:id` của ván là UUID. Mọi đường dẫn yêu cầu đăng nhập (guard
 * toàn cục). Cập nhật bằng polling: sảnh `GET rooms` mỗi 3 giây, phòng chờ `GET rooms/:code` mỗi
 * 2 giây, màn chơi `GET matches/:id/state` mỗi 2 giây (biểu cảm cũng đi theo luồng này).
 *
 * v2.1: `me/level`, `leaderboard`, `leaderboard/top3`, `me/history`, `me/history/summary` và
 * `matches/:id/reactions` (spec IQX-Flashback-SPEC-BoSung §10.2).
 */

import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { FB_REACTION_EMOJIS } from './flashback-rooms.reactions.js';
import {
  FB_LEADERBOARD_DEFAULT_LIMIT,
  FB_LEADERBOARD_MAX_LIMIT,
  FlashbackRoomsService,
} from './flashback-rooms.service.js';

const openapi = (schema: z.ZodType): SchemaObject =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/** Truy vấn danh sách phòng của sảnh. */
export const fbRoomsQuerySchema = z.object({
  status: z.enum(['all', 'waiting', 'playing']).default('all'),
});

/**
 * Thân tạo phòng. Kiểu dữ liệu lỏng có chủ ý: miền giá trị được kiểm tra ở service để báo đúng
 * một dòng lỗi tiếng Việt của spec §3. Trường thiếu dùng giá trị mặc định của hộp tạo phòng.
 */
export const fbCreateRoomBodySchema = z
  .strictObject({
    view_bars: z.number().optional(),
    play_bars: z.number().optional(),
    minutes: z.number().optional(),
    max_players: z.number().optional(),
    stake_xu: z.number().nullable().optional(),
    password: z.string().max(64).nullable().optional(),
    chat_enabled: z.boolean().nullable().optional(),
  })
  .default({});
export type FbCreateRoomBody = z.infer<typeof fbCreateRoomBodySchema>;

/** Thân vào phòng: mật khẩu nếu phòng có khoá. */
export const fbJoinRoomBodySchema = z
  .strictObject({ password: z.string().max(64).nullable().optional() })
  .default({});
export type FbJoinRoomBody = z.infer<typeof fbJoinRoomBodySchema>;

/** Thân Sẵn sàng / Huỷ sẵn sàng của phòng chờ. */
export const fbReadyBodySchema = z.strictObject({ ready: z.boolean() });
export type FbReadyBody = z.infer<typeof fbReadyBodySchema>;

/** Thân đuổi một thành viên khỏi phòng chờ (chỉ chủ phòng). */
export const fbKickBodySchema = z.strictObject({ user_id: z.uuid() });
export type FbKickBody = z.infer<typeof fbKickBodySchema>;

/** Thân đặt lệnh (như v1.1). */
export const fbOrderBodySchema = z.strictObject({
  side: z.enum(['buy', 'sell']),
  qty: z.number().int().min(1).max(1_000_000_000),
  idempotency_key: z.string().min(1).max(128).optional(),
});
export type FbOrderBody = z.infer<typeof fbOrderBodySchema>;

/** Truy vấn bảng xếp hạng (v2.1 §10.2): `limit` mặc định 50. */
export const fbLeaderboardQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(FB_LEADERBOARD_MAX_LIMIT)
    .default(FB_LEADERBOARD_DEFAULT_LIMIT),
});
export type FbLeaderboardQuery = z.infer<typeof fbLeaderboardQuerySchema>;

/** Truy vấn lịch sử đấu (v2.1 §5.3, §10.2): lọc kết quả, khoảng thời gian, trang (20 ván mỗi trang). */
export const fbHistoryQuerySchema = z.object({
  result: z.enum(['all', 'win', 'lose', 'solo']).default('all'),
  days: z.enum(['7', '30', 'all']).default('all'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type FbHistoryQueryInput = z.infer<typeof fbHistoryQuerySchema>;

/** Truy vấn tổng kết lịch sử đấu (v2.1 §5.1). */
export const fbHistorySummaryQuerySchema = z.object({
  days: z.enum(['7', '30', 'all']).default('all'),
});
export type FbHistorySummaryQuery = z.infer<typeof fbHistorySummaryQuerySchema>;

/**
 * Thân gửi biểu cảm (v2.1 §6.4). Kiểu chuỗi lỏng có chủ ý: service kiểm tra emoji nằm trong danh
 * sách 12 cái và trả đúng mã lỗi `REACTION_INVALID`.
 */
export const fbReactionBodySchema = z.strictObject({ emoji: z.string().min(1).max(16) });
export type FbReactionBody = z.infer<typeof fbReactionBodySchema>;

/** ID phòng nhận chuỗi bất kỳ để service báo đúng "ID phòng gồm 6 chữ số". */
export const fbRoomCodeParamSchema = z.string().min(1).max(32);
export const fbMatchIdParamSchema = z.uuid();

// ------------------------------------------------------------------ schema phản hồi (OpenAPI)

/** Cấp và vương miện (v2.1 §3.3, §4.3): 1 vàng, 2 bạc, 3 đồng, null khi không có. */
const badgeShape = {
  level: z.number(),
  crown: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
};

const playerRefShape = {
  user_id: z.string(),
  name: z.string(),
  avatar_url: z.string().nullable(),
  ...badgeShape,
};

const barSchema = z.object({
  session: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

const roomListItemSchema = z.object({
  id: z.string(),
  locked: z.boolean(),
  owner: z.object({ name: z.string(), avatar_url: z.string().nullable(), ...badgeShape }),
  view_bars: z.number(),
  play_bars: z.number(),
  minutes: z.number(),
  member_count: z.number(),
  max_players: z.number(),
  stake_xu: z.number(),
  status: z.enum(['waiting', 'playing']),
  full: z.boolean(),
  created_at: z.string(),
});

const roomSchema = z.object({
  id: z.string(),
  locked: z.boolean(),
  chat_enabled: z.boolean(),
  owner_id: z.string(),
  is_owner: z.boolean(),
  view_bars: z.number(),
  play_bars: z.number(),
  minutes: z.number(),
  max_players: z.number(),
  stake_xu: z.number(),
  status: z.enum(['waiting', 'playing']),
  members: z.array(
    z.object({
      ...playerRefShape,
      is_owner: z.boolean(),
      is_me: z.boolean(),
      joined_at: z.string(),
      ready: z.boolean(),
    }),
  ),
  match: z
    .object({
      id: z.string(),
      status: z.enum(['playing', 'ended']),
      started_at: z.string(),
      ends_at: z.string(),
      joined: z.boolean(),
    })
    .nullable(),
  created_at: z.string(),
  auto_close_at: z.string().nullable(),
  server_now: z.string(),
});

const positionSchema = z.object({
  qty: z.number(),
  price: z.string(),
  step: z.number(),
  sellable_step: z.number(),
  status: z.enum(['settled', 'pending']),
  sessions_left: z.number(),
  pnl_pct: z.number(),
  value: z.string(),
});

const orderSchema = z.object({
  id: z.string(),
  side: z.enum(['buy', 'sell']),
  qty: z.number(),
  price: z.string(),
  step: z.number(),
  amount: z.string(),
  fee: z.string(),
  tax: z.string(),
  created_at: z.string(),
});

const entrySchema = z.object({
  step: z.number(),
  play_bars: z.number(),
  cash: z.string(),
  holdings: z.number(),
  sellable: z.number(),
  price: z.string(),
  total_assets: z.string(),
  pnl_pct: z.number(),
  pnl_percent: z.number(),
  max_buy_qty: z.number(),
  finished: z.boolean(),
  auto_finished: z.boolean(),
  positions: z.array(positionSchema),
  orders: z.array(orderSchema),
});

const stateShape = {
  match_id: z.string(),
  room_id: z.string(),
  status: z.enum(['playing', 'ended']),
  started_at: z.string(),
  ends_at: z.string(),
  server_now: z.string(),
  remaining_ms: z.number(),
  my_step: z.number(),
  my_finished: z.boolean(),
  playing_count: z.number(),
  players: z.array(
    z.object({
      ...playerRefShape,
      is_me: z.boolean(),
      finished: z.boolean(),
      step: z.number(),
      // null trong lúc chơi (v2.1 §6.2); chỉ có % cuối sau khi ván kết thúc.
      pnl_pct: z.number().nullable(),
      pnl_percent: z.number().nullable(),
    }),
  ),
  // Biểu cảm vài giây gần đây (v2.1 §6.4); trống khi ván đã kết thúc.
  reactions: z.array(
    z.object({ id: z.string(), user_id: z.string(), emoji: z.string(), age_ms: z.number() }),
  ),
};
const stateSchema = z.object(stateShape);

const snapshotSchema = z.object({
  ...stateShape,
  view_bars: z.number(),
  play_bars: z.number(),
  minutes: z.number(),
  stake_xu: z.number(),
  pot_xu: z.number(),
  initial_cash: z.string(),
  warmup_bars: z.array(barSchema),
  history_bars: z.array(barSchema),
  played_bars: z.array(barSchema),
  me: entrySchema,
});

const resultSchema = z.object({
  match_id: z.string(),
  room_id: z.string(),
  title: z.string(),
  solo: z.boolean(),
  stake_xu: z.number(),
  pot_xu: z.number(),
  refund: z.boolean(),
  end_reason: z.enum(['all_finished', 'timeout']).nullable(),
  rows: z.array(
    z.object({
      ...playerRefShape,
      rank: z.number(),
      is_me: z.boolean(),
      is_winner: z.boolean(),
      pnl_pct: z.number(),
      pnl_percent: z.number(),
      final_nav: z.string(),
      win_xu: z.number(),
      refund_xu: z.number(),
      xu_label: z.string().nullable(),
      points: z.number(),
    }),
  ),
  progress: z.object({
    points: z.number(),
    total_points: z.number(),
    level: z.number(),
    previous_level: z.number(),
    leveled_up: z.boolean(),
    level_base: z.number(),
    next_level_points: z.number(),
    remaining_points: z.number(),
  }),
  symbol: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  played_bars: z.array(barSchema),
});

const myLevelSchema = z.object({
  points: z.number(),
  level: z.number(),
  level_base: z.number(),
  next_level_points: z.number(),
  remaining_points: z.number(),
  rank: z.number().nullable(),
  games: z.number(),
  wins: z.number(),
});

const leaderboardItemSchema = z.object({
  ...playerRefShape,
  rank: z.number(),
  points: z.number(),
  wins: z.number(),
  games: z.number(),
  is_me: z.boolean(),
});

const leaderboardSchema = z.object({
  rows: z.array(leaderboardItemSchema),
  // Dòng của tôi khi nằm ngoài top; null khi đã có trong `rows` hoặc chưa chơi ván nào từ 2 người.
  me: leaderboardItemSchema.nullable(),
});

const top3Schema = z.object({
  users: z.array(
    z.object({
      rank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      user_id: z.string(),
      name: z.string(),
      avatar_url: z.string().nullable(),
      level: z.number(),
      points: z.number(),
    }),
  ),
});

const historyItemSchema = z.object({
  match_id: z.string(),
  room_id: z.string(),
  ended_at: z.string(),
  player_count: z.number(),
  view_bars: z.number(),
  play_bars: z.number(),
  minutes: z.number(),
  stake_xu: z.number(),
  symbol: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  result: z.enum(['win', 'tie', 'lose', 'solo']),
  rank: z.number(),
  pnl_pct: z.number(),
  pnl_percent: z.number(),
  xu: z.number(),
  points: z.number(),
  cash_percent: z.number(),
  players: z.array(
    z.object({
      ...playerRefShape,
      rank: z.number(),
      is_me: z.boolean(),
      pnl_pct: z.number(),
      pnl_percent: z.number(),
      xu: z.number(),
      points: z.number(),
    }),
  ),
  // Chỉ lệnh của chính người xem.
  orders: z.array(
    z.object({
      id: z.string(),
      step: z.number(),
      side: z.enum(['buy', 'sell']),
      qty: z.number(),
      price: z.string(),
      fee: z.string(),
      tax: z.string(),
      amount: z.string(),
    }),
  ),
});

const historySchema = z.object({
  items: z.array(historyItemSchema),
  page: z.number(),
  page_size: z.number(),
  total: z.number(),
  pages: z.number(),
});

const historySummarySchema = z.object({
  games: z.number(),
  solo_games: z.number(),
  multi_games: z.number(),
  wins: z.number(),
  win_rate: z.number(),
  xu_net: z.number(),
  points: z.number(),
  avg_pnl_pct: z.number(),
  avg_pnl_percent: z.number(),
  best_pnl_pct: z.number().nullable(),
  best_pnl_percent: z.number().nullable(),
  best_symbol: z.string().nullable(),
});

@ApiTags('Flashback Rooms')
@Controller('api/v2/flashback')
export class FlashbackRoomsController {
  constructor(private readonly rooms: FlashbackRoomsService) {}

  @Get('rooms')
  @ApiOperation({ operationId: 'flashbackRoomsList', summary: 'Danh sách phòng của sảnh' })
  @ApiOkResponse({ schema: openapi(z.object({ rooms: z.array(roomListItemSchema) })) })
  async list(@Query({ schema: fbRoomsQuerySchema }) query: z.infer<typeof fbRoomsQuerySchema>) {
    return this.rooms.listRooms(query.status ?? 'all');
  }

  @Get('rooms/me')
  @ApiOperation({
    operationId: 'flashbackRoomsMine',
    summary: 'Phòng hiện tại của tôi (vào lại) và thông báo một lần',
  })
  @ApiOkResponse({
    schema: openapi(
      z.object({
        room: roomSchema.nullable(),
        notice: z.string().nullable(),
        kicked: z.boolean(),
      }),
    ),
  })
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return this.rooms.myRoom(user.id);
  }

  @Post('rooms')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackRoomsCreate', summary: 'Tạo phòng' })
  @ApiOkResponse({ schema: openapi(roomSchema) })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: fbCreateRoomBodySchema }) body: FbCreateRoomBody,
  ) {
    return this.rooms.createRoom(user.id, body ?? {});
  }

  @Post('rooms/random-join')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackRoomsRandomJoin', summary: 'Chơi phòng bất kỳ' })
  @ApiOkResponse({ schema: openapi(roomSchema) })
  async randomJoin(@CurrentUser() user: AuthenticatedUser) {
    return this.rooms.randomJoin(user.id);
  }

  @Get('rooms/:code')
  @ApiOperation({ operationId: 'flashbackRoomsGet', summary: 'Phòng chờ (chỉ thành viên)' })
  @ApiOkResponse({ schema: openapi(roomSchema) })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code', { schema: fbRoomCodeParamSchema }) code: string,
  ) {
    return this.rooms.getRoom(user.id, code);
  }

  @Post('rooms/:code/join')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackRoomsJoin', summary: 'Vào phòng bằng ID' })
  @ApiOkResponse({ schema: openapi(roomSchema) })
  async join(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code', { schema: fbRoomCodeParamSchema }) code: string,
    @Body({ schema: fbJoinRoomBodySchema }) body: FbJoinRoomBody,
  ) {
    return this.rooms.joinRoom(user.id, code, body?.password ?? null);
  }

  @Post('rooms/:code/leave')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackRoomsLeave', summary: 'Rời phòng' })
  @ApiOkResponse({ schema: openapi(z.object({ left: z.literal(true) })) })
  async leave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code', { schema: fbRoomCodeParamSchema }) code: string,
  ) {
    return this.rooms.leaveRoom(user.id, code);
  }

  @Post('rooms/:code/ready')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'flashbackRoomsReady',
    summary: 'Sẵn sàng hoặc huỷ sẵn sàng ở phòng chờ',
  })
  @ApiOkResponse({ schema: openapi(roomSchema) })
  async ready(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code', { schema: fbRoomCodeParamSchema }) code: string,
    @Body({ schema: fbReadyBodySchema }) body: FbReadyBody,
  ) {
    return this.rooms.setReady(user.id, code, body.ready);
  }

  @Post('rooms/:code/kick')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'flashbackRoomsKick',
    summary: 'Đuổi một người khỏi phòng chờ (chỉ chủ phòng)',
  })
  @ApiOkResponse({ schema: openapi(roomSchema) })
  async kick(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code', { schema: fbRoomCodeParamSchema }) code: string,
    @Body({ schema: fbKickBodySchema }) body: FbKickBody,
  ) {
    return this.rooms.kickMember(user.id, code, body.user_id);
  }

  @Post('rooms/:code/start')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackRoomsStart', summary: 'Bắt đầu ván (chỉ chủ phòng)' })
  @ApiOkResponse({
    schema: openapi(
      z.object({
        match: snapshotSchema,
        room: roomSchema,
        removed: z.array(z.object({ user_id: z.string(), name: z.string(), message: z.string() })),
      }),
    ),
  })
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code', { schema: fbRoomCodeParamSchema }) code: string,
  ) {
    return this.rooms.startRoom(user.id, code);
  }

  @Post('rooms/:code/replay')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'flashbackRoomsReplay',
    summary: 'Chơi lại: đưa phòng về phòng chờ',
  })
  @ApiOkResponse({ schema: openapi(roomSchema) })
  async replay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code', { schema: fbRoomCodeParamSchema }) code: string,
  ) {
    return this.rooms.replayRoom(user.id, code);
  }

  @Get('matches/:id')
  @ApiOperation({
    operationId: 'flashbackMatchGet',
    summary: 'Dữ liệu ván của tôi (vào lại giữa ván)',
  })
  @ApiOkResponse({ schema: openapi(snapshotSchema) })
  async match(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: fbMatchIdParamSchema }) id: string,
  ) {
    return this.rooms.matchSnapshot(user.id, id);
  }

  @Post('matches/:id/next')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackMatchNext', summary: 'Phiên tiếp' })
  @ApiOkResponse({ schema: openapi(z.object({ bar: barSchema, me: entrySchema })) })
  async next(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: fbMatchIdParamSchema }) id: string,
  ) {
    return this.rooms.next(user.id, id);
  }

  @Post('matches/:id/orders')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackMatchOrder', summary: 'Đặt lệnh mua hoặc bán' })
  @ApiOkResponse({ schema: openapi(z.object({ order: orderSchema, me: entrySchema })) })
  async order(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: fbMatchIdParamSchema }) id: string,
    @Body({ schema: fbOrderBodySchema }) body: FbOrderBody,
  ) {
    return this.rooms.placeOrder(user.id, id, {
      side: body.side,
      qty: body.qty,
      idempotencyKey: body.idempotency_key ?? null,
    });
  }

  @Post('matches/:id/finish')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackMatchFinish', summary: 'Hoàn thành (ở phiên cuối)' })
  @ApiOkResponse({
    schema: openapi(z.object({ me: entrySchema, ended: z.boolean(), playing_count: z.number() })),
  })
  async finish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: fbMatchIdParamSchema }) id: string,
  ) {
    return this.rooms.finish(user.id, id);
  }

  @Get('matches/:id/state')
  @ApiOperation({ operationId: 'flashbackMatchState', summary: 'Đồng hồ và % từng người' })
  @ApiOkResponse({ schema: openapi(stateSchema) })
  async state(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: fbMatchIdParamSchema }) id: string,
  ) {
    return this.rooms.state(user.id, id);
  }

  @Get('matches/:id/result')
  @ApiOperation({ operationId: 'flashbackMatchResult', summary: 'Kết quả ván (sau khi kết thúc)' })
  @ApiOkResponse({ schema: openapi(resultSchema) })
  async result(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: fbMatchIdParamSchema }) id: string,
  ) {
    return this.rooms.result(user.id, id);
  }

  @Post('matches/:id/reactions')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'flashbackMatchReaction',
    summary: `Gửi biểu cảm trong ván đang chơi (${FB_REACTION_EMOJIS.join(' ')}); 1 biểu cảm mỗi 1,5 giây`,
  })
  @ApiOkResponse({
    schema: openapi(z.object({ id: z.string(), user_id: z.string(), emoji: z.string() })),
  })
  async reaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: fbMatchIdParamSchema }) id: string,
    @Body({ schema: fbReactionBodySchema }) body: FbReactionBody,
  ) {
    return this.rooms.sendReaction(user.id, id, body.emoji);
  }

  // ---------------------------------------------------------------- cấp, hạng, lịch sử (v2.1 §10.2)

  @Get('me/level')
  @ApiOperation({
    operationId: 'flashbackMyLevel',
    summary: 'Thẻ cấp của tôi: điểm, cấp, mốc điểm và hạng toàn hệ thống',
  })
  @ApiOkResponse({ schema: openapi(myLevelSchema) })
  async myLevel(@CurrentUser() user: AuthenticatedUser) {
    return this.rooms.myLevel(user.id);
  }

  @Get('me/history')
  @ApiOperation({
    operationId: 'flashbackMyHistory',
    summary: 'Lịch sử đấu của tôi (200 ván gần nhất, 20 ván mỗi trang)',
  })
  @ApiOkResponse({ schema: openapi(historySchema) })
  async myHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: fbHistoryQuerySchema }) query: FbHistoryQueryInput,
  ) {
    return this.rooms.history(user.id, {
      result: query.result ?? 'all',
      days: query.days ?? 'all',
      page: query.page ?? 1,
    });
  }

  @Get('me/history/summary')
  @ApiOperation({
    operationId: 'flashbackMyHistorySummary',
    summary: 'Sáu số tổng kết lịch sử đấu trong khoảng thời gian',
  })
  @ApiOkResponse({ schema: openapi(historySummarySchema) })
  async myHistorySummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: fbHistorySummaryQuerySchema }) query: FbHistorySummaryQuery,
  ) {
    return this.rooms.historySummary(user.id, query.days ?? 'all');
  }

  @Get('leaderboard')
  @ApiOperation({
    operationId: 'flashbackRoomsLeaderboard',
    summary: 'Bảng xếp hạng toàn hệ thống (kèm dòng của tôi nếu ngoài top)',
  })
  @ApiOkResponse({ schema: openapi(leaderboardSchema) })
  async leaderboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: fbLeaderboardQuerySchema }) query: FbLeaderboardQuery,
  ) {
    return this.rooms.leaderboard(user.id, query.limit ?? FB_LEADERBOARD_DEFAULT_LIMIT);
  }

  @Get('leaderboard/top3')
  @ApiOperation({
    operationId: 'flashbackRoomsLeaderboardTop3',
    summary: 'Người đang hạng 1, 2, 3 (để vẽ vương miện)',
  })
  @ApiOkResponse({ schema: openapi(top3Schema) })
  async top3() {
    return this.rooms.top3();
  }
}
