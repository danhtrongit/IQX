/**
 * API của Flashback v2 · Phòng chơi (spec v2 §10.2), dưới `api/v2/flashback`.
 *
 * `:code` là ID phòng 6 chữ số; `:id` của ván là UUID. Mọi đường dẫn yêu cầu đăng nhập (guard
 * toàn cục). Cập nhật bằng polling: sảnh `GET rooms` mỗi 3 giây, phòng chờ `GET rooms/:code` mỗi
 * 2 giây, màn chơi `GET matches/:id/state` mỗi 2 giây.
 */

import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { FlashbackRoomsService } from './flashback-rooms.service.js';

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
  })
  .default({});
export type FbCreateRoomBody = z.infer<typeof fbCreateRoomBodySchema>;

/** Thân vào phòng: mật khẩu nếu phòng có khoá. */
export const fbJoinRoomBodySchema = z
  .strictObject({ password: z.string().max(64).nullable().optional() })
  .default({});
export type FbJoinRoomBody = z.infer<typeof fbJoinRoomBodySchema>;

/** Thân đặt lệnh (như v1.1). */
export const fbOrderBodySchema = z.strictObject({
  side: z.enum(['buy', 'sell']),
  qty: z.number().int().min(1).max(1_000_000_000),
  idempotency_key: z.string().min(1).max(128).optional(),
});
export type FbOrderBody = z.infer<typeof fbOrderBodySchema>;

/** ID phòng nhận chuỗi bất kỳ để service báo đúng "ID phòng gồm 6 chữ số". */
export const fbRoomCodeParamSchema = z.string().min(1).max(32);
export const fbMatchIdParamSchema = z.uuid();

// ------------------------------------------------------------------ schema phản hồi (OpenAPI)

const playerRefShape = {
  user_id: z.string(),
  name: z.string(),
  avatar_url: z.string().nullable(),
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
  owner: z.object({ name: z.string(), avatar_url: z.string().nullable() }),
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
      pnl_pct: z.number(),
      pnl_percent: z.number(),
    }),
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
    }),
  ),
  symbol: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  played_bars: z.array(barSchema),
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
    schema: openapi(z.object({ room: roomSchema.nullable(), notice: z.string().nullable() })),
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
}
