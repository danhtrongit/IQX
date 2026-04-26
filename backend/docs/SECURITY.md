# Tài liệu bảo mật

## Giới hạn kích thước request body

Giới hạn kích thước request body được quản lý ở **lớp reverse proxy** (nginx/Caddy/ALB).

Khuyến nghị cấu hình:
- **nginx**: `client_max_body_size 1m;`
- **Caddy**: `request_body { max_size 1MB }`
- **AWS ALB**: Mặc định 1 MB, có thể cấu hình lên đến 100 MB.

FastAPI không tự áp dụng giới hạn body. Hãy đảm bảo reverse proxy được cấu hình đúng.

## Security Headers

Các security header được áp dụng ở **reverse proxy** trong môi trường production:

```nginx
# Ví dụ nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header X-XSS-Protection "0" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'none'; frame-ancestors 'none'" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
```

Nếu triển khai không có reverse proxy (ví dụ chạy Uvicorn trực tiếp), hãy cân nhắc thêm
[`starlette-security-headers`](https://github.com/AaronFilson/starlette-security-headers)
hoặc một middleware tự viết.

## Bảo vệ CSRF

API này dùng **xác thực Bearer token** (JWT trong header `Authorization`).

Bearer token **không được trình duyệt tự động đính kèm** (khác với cookie),
nên tấn công CSRF truyền thống không áp dụng được. Không cần CSRF middleware bổ sung.

Nếu sau này có thêm phiên dựa trên cookie, cần đưa CSRF middleware vào ngay.

## Giới hạn tần suất (Rate Limiting)

- **Mặc định toàn cục**: `60/minute` mỗi IP (qua SlowAPIMiddleware)
- **Endpoint xác thực**: `10/minute` mỗi IP (đặt rõ qua `@limiter.limit()`)
- **Dữ liệu thị trường**: `120/minute` mỗi IP (áp dụng giới hạn toàn cục)
- Rate limiting **bị vô hiệu hóa** khi `APP_ENV=testing`.

## TLS

TLS được terminate ở reverse proxy / load balancer.
Ứng dụng lắng nghe HTTP thuần phía sau proxy.
