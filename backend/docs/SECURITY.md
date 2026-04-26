# Security Posture Documentation

## Request Body Size Limits

Request body size limits are managed at the **reverse proxy layer** (nginx/Caddy/ALB).

Recommended configuration:
- **nginx**: `client_max_body_size 1m;`
- **Caddy**: `request_body { max_size 1MB }`
- **AWS ALB**: Default 1 MB, configurable up to 100 MB.

FastAPI does not enforce body size limits natively. Ensure your proxy is configured.

## Security Headers

Security headers are applied by the **reverse proxy** in production:

```nginx
# nginx example
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header X-XSS-Protection "0" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'none'; frame-ancestors 'none'" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
```

If deploying without a reverse proxy (e.g., direct Uvicorn), consider adding
[`starlette-security-headers`](https://github.com/AaronFilson/starlette-security-headers)
or a custom middleware.

## CSRF Protection

This API uses **Bearer token authentication** (JWT in `Authorization` header).

Bearer tokens are **not automatically attached** by browsers (unlike cookies),
making traditional CSRF attacks inapplicable. No additional CSRF middleware is needed.

If cookie-based sessions are ever added, CSRF middleware must be introduced.

## Rate Limiting

- **Global default**: `60/minute` per IP (via SlowAPIMiddleware)
- **Auth endpoints**: `10/minute` per IP (explicit `@limiter.limit()`)
- **Market data**: `120/minute` per IP (global default applies)
- Rate limiting is **disabled** in `APP_ENV=testing`.

## TLS

TLS termination is handled at the reverse proxy / load balancer level.
The application listens on plain HTTP behind the proxy.
