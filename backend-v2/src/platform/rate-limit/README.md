# Public API rate limiting

The global Nest throttler uses Fastify's `request.ip`. The application keeps
Fastify `trustProxy` disabled, so untrusted `X-Forwarded-For` headers cannot
select another rate-limit identity.

Enabling `trustProxy` is a separate deployment/security decision. It requires
an explicit allowlist of trusted proxy addresses; do not enable it globally
just because a reverse proxy is present.
