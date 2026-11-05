# Flashback: máy chủ thời gian thực (ảnh chat, cuộc gọi, tín hiệu WebRTC)

WebSocket `/api/v2/flashback/ws` (JSON, thư viện `ws` qua `@nestjs/platform-ws`, nginx đã proxy upgrade cho
`/api/v2/`). Mã: `src/modules/flashback/flashback-media.hub.ts` (quy tắc), `flashback-media.logic.ts` (kiểm
ảnh, giới hạn, kho ảnh), `flashback-ws.gateway.ts` (lớp ws mỏng), `flashback-room-events.ts` (sự kiện phòng).
Kiểu phía trình duyệt: `frontend/src/pages/demo-trading/flashback/room-socket-protocol.ts`.

## Ảnh KHÔNG được lưu

Ảnh chỉ nằm trong bộ nhớ của tiến trình API, theo phòng. Không có bảng, không ghi đĩa, không qua
`shared/media`.

- Mỗi phòng giữ tối đa 50 ảnh gần nhất và 30 MB; cả tiến trình tối đa 200 MB. Vượt thì bỏ ảnh cũ nhất.
- Xoá ngay khi phòng giải tán hoặc kết thúc (`room:closed`), và khi tiến trình API khởi động lại thì mất
  hết. Triển khai bản mới (restart API) làm mọi ảnh đang có trong phòng biến mất; trình duyệt cũng chỉ giữ
  ảnh trong bộ nhớ và `revokeObjectURL` khi rời phòng.
- Chạy nhiều tiến trình API thì mỗi tiến trình có kho riêng (ảnh sẽ không chia sẻ giữa chúng). Hiện API chạy
  một tiến trình nên đủ.

## Giao thức

Kết nối xong client gửi `{type:"auth", token}` (access token như HTTP, kiểm bằng `AuthService.authenticate`,
không đặt token trong URL). Server trả `{type:"ready", userId}` hoặc đóng với mã 4401 (kể cả khi im lặng quá
10 giây). Sau đó `{type:"room:join", roomId}` (mã phòng 6 chữ số) chỉ khi là thành viên; server trả
`room:state` `{roomId, images, call, iceServers}`. Một socket một phòng.

| Client gửi | Server phát |
| --- | --- |
| `image:send` `{roomId, clientId, mime, data, width, height}` | `image` `{id, clientId, roomId, userId, name, mime, data, width, height, sentAt}`; lỗi: `error` `{clientId, code, message}`. Người gửi nhận bản có `clientId`, người khác nhận `clientId: null`. |
| `call:join` / `call:media` `{roomId, media}`, `call:leave` `{roomId}` | `call:joined` (riêng người vào: danh sách người đang gọi), `call:peer-joined`, `call:media`, `call:peer-left` tới những người khác trong cuộc gọi |
| `rtc:signal` `{roomId, to, data}` | `rtc:signal` `{from, data}` chỉ khi cả hai đang trong cuộc gọi của cùng phòng; server không đọc `data` |
| `ping` | `pong` |

Đóng socket: 4401 xác thực sai, 4403 rời phòng hoặc bị mời ra, 4410 phòng giải tán hoặc kết thúc (kèm
`room:closed`), 1008 quá 1200 thông điệp mỗi phút, 1009 thông điệp quá lớn. Ping ws mỗi 25 giây; kết nối
không trả pong bị cắt và coi như rời cuộc gọi.

## Quy tắc ảnh

- Chỉ `image/webp`, `image/jpeg`, `image/png`. Dữ liệu sau giải mã tối đa 1,5 MB; byte đầu phải đúng định
  dạng khai báo; kích thước khung đọc từ chính tệp (không tin `width`, `height` client gửi), tối đa 4096 px.
- Mỗi người 1 ảnh mỗi 2 giây và 20 ảnh mỗi phút (`IMAGE_TOO_FAST`, `IMAGE_RATE_LIMIT`).
- Áp `chat_enabled` của phòng (`CHAT_DISABLED`), tắt tiếng (người đã tắt tiếng ai thì không nhận ảnh người
  đó) và quy tắc `phien` của chat chữ (v2.4 §3.4): ảnh gửi ở phiên P chỉ giao cho người đã tới phiên P, ảnh
  chưa tới lượt giữ chờ trong bộ nhớ. Server biết phiên của từng người bằng chính truy vấn của chat chữ
  (`FlashbackChatService.mediaContext`), được gọi lại khi người đó sang phiên mới (`FlashbackRoomsService.next`
  phát `positionChanged`), khi ván chốt, và mỗi 3 giây cho ảnh còn chờ (ván có thể chốt ở tiến trình worker).
- Tắt tiếng áp lúc giao: bỏ tắt tiếng sau đó không giao lại ảnh cũ trong lần kết nối hiện tại; vào lại phòng
  thì tính lại từ đầu.

## Dọn khi phòng đổi trạng thái

`FlashbackRoomsService` phát sự kiện trong tiến trình sau khi transaction commit: `memberLeft` (rời, bị mời,
bị đưa ra vì thiếu xu), `roomClosed` (người cuối rời, `sweep` đóng phòng), `positionChanged`. Hub đóng socket
tương ứng, phát `call:peer-left` và xoá ảnh, trạng thái cuộc gọi. Tác vụ quét phòng chạy ở tiến trình worker
nên sự kiện của nó không tới được API: hub tự đối chiếu với cơ sở dữ liệu mỗi 15 giây và dọn phòng đã đóng.

## Cấu hình

`FLASHBACK_ICE_SERVERS` (tuỳ chọn, JSON mảng `{urls, username?, credential?}`; mặc định
`[{"urls":"stun:stun.l.google.com:19302"}]`) được kiểm trong `parseEnvironment`, JSON hỏng làm API không
khởi động. Thêm TURN ở đây khi người dùng nằm sau NAT đối xứng; thông tin đăng nhập TURN nằm trong
`room:state` gửi cho thành viên, nên dùng thông tin có hạn dùng ngắn.

## Kiểm thử

- Unit: `test/unit/flashback-media.test.ts` (kiểm ảnh, giới hạn, kho ảnh, hub với cổng giả và với dịch vụ
  phòng thật trong bộ nhớ), `test/unit/flashback-ws.gateway.test.ts` (ws thật qua Nest, kích thước tối đa,
  khung nhị phân).
- Hệ thống (Postgres, Redis thật): `test/system/flashback-media.system.spec.ts`.
