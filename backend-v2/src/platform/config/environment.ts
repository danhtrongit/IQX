import { z } from 'zod';
import { isIP } from 'node:net';

const booleanSetting = (fallback: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') return fallback;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return value;
  }, z.boolean());

const optionalUrl = (protocols: string[]) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .url()
      .refine((value) => {
        try {
          return protocols.includes(new URL(value).protocol);
        } catch {
          return false;
        }
      }, 'Unsupported URL protocol')
      .optional(),
  );

const productionProviderUrls = [
  'AI_PROXY_BASE_URL',
  'EMAIL_PROVIDER_URL',
  'DNSE_AUTH_URL',
  'DNSE_ME_URL',
  'DNSE_OPENAPI_WS_URL',
  'DNSE_MQTT_URL',
  'REALTIME_DNSE_MQTT_URL',
] as const;

const isSecureOrLoopbackUrl = (value: string) => {
  const url = new URL(value);
  return (
    ['https:', 'wss:', 'mqtts:'].includes(url.protocol) ||
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  );
};

export const environmentSchema = z
  .object({
    APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    TRUST_PROXY_CIDRS: z.preprocess(
      (value) =>
        typeof value === 'string'
          ? value
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : value,
      z
        .array(
          z.string().refine((value) => {
            const [address, bits, extra] = value.split('/');
            const family = isIP(address ?? '');
            if (!family || extra !== undefined) return false;
            if (bits === undefined) return true;
            return (
              /^\d+$/.test(bits) && Number(bits) > 0 && Number(bits) <= (family === 4 ? 32 : 128)
            );
          }, 'Expected an explicit proxy IP or non-global CIDR'),
        )
        .default([]),
    ),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: optionalUrl(['postgres:', 'postgresql:']),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
    DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(3_000),
    DB_READ_ONLY: booleanSetting(false),
    REDIS_ENABLED: booleanSetting(false),
    REDIS_URL: optionalUrl(['redis:', 'rediss:']),
    REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
    QUEUE_ENABLED: booleanSetting(false),
    MARKET_INGEST_ENABLED: booleanSetting(false),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100_000).default(60),
    RATE_LIMIT_TTL_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
    CORS_ORIGINS: z.preprocess(
      (value) =>
        typeof value === 'string'
          ? value
              .split(',')
              .map((origin) => origin.trim())
              .filter(Boolean)
          : value,
      z
        .array(
          z
            .string()
            .url()
            .refine((value) => {
              try {
                const url = new URL(value);
                return (
                  ['http:', 'https:'].includes(url.protocol) &&
                  !url.username &&
                  !url.password &&
                  url.origin === value
                );
              } catch {
                return false;
              }
            }, 'CORS entries must be exact HTTP(S) origins'),
        )
        .default([]),
    ),
    API_DOCS_ENABLED: booleanSetting(false),
    SEPAY_MERCHANT_ID: z.string().trim().optional(),
    SEPAY_SECRET_KEY: z.string().trim().optional(),
    SEPAY_CHECKOUT_URL: optionalUrl(['http:', 'https:']),
    APP_PUBLIC_URL: optionalUrl(['http:', 'https:']),
    API_PUBLIC_URL: optionalUrl(['http:', 'https:']),
    JWT_SECRET_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(32).optional(),
    ),
    JWT_REFRESH_SECRET_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(32).optional(),
    ),
    ACCESS_TOKEN_EXPIRE_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
    REFRESH_TOKEN_EXPIRE_DAYS: z.coerce.number().int().min(1).max(365).default(7),
    EMAIL_ENABLED: booleanSetting(false),
    EMAIL_PROVIDER_URL: optionalUrl(['http:', 'https:']),
    EMAIL_API_KEY: z.string().optional(),
    EMAIL_SENDER: z.string().email().optional(),
    AI_PROXY_BASE_URL: optionalUrl(['http:', 'https:']),
    AI_PROXY_API_KEY: z.string().optional(),
    AI_PROXY_MODEL: z.string().optional(),
    AI_PROXY_THINKING: z.enum(['enabled', 'disabled']).optional(),
    AI_PROXY_TIMEOUT_MS: z.coerce.number().int().min(100).max(180_000).default(120_000),
    AI_PROXY_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    CAP_MAX_ENABLED: z.coerce.number().int().min(0).max(8).default(6),
    JOURNEY_QA_GRANTS_ENABLED: booleanSetting(false),
    REALTIME_ENABLED: booleanSetting(false),
    DNSE_TRANSPORT: z.enum(['auto', 'openapi', 'mqtt']).default('auto'),
    DNSE_OPENAPI_WS_URL: optionalUrl(['wss:', 'ws:']),
    DNSE_API_KEY: z.string().optional(),
    DNSE_API_SECRET: z.string().optional(),
    DNSE_MQTT_URL: optionalUrl(['wss:', 'ws:', 'mqtt:', 'mqtts:']),
    DNSE_MQTT_HOST: z.string().optional(),
    DNSE_MQTT_PORT: z.string().optional(),
    DNSE_MQTT_WS_PATH: z.string().default('/mqtt'),
    DNSE_AUTH_URL: optionalUrl(['http:', 'https:']),
    DNSE_ME_URL: optionalUrl(['http:', 'https:']),
    DNSE_USERNAME: z.string().optional(),
    DNSE_PASSWORD: z.string().optional(),
    GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional(),
    GOOGLE_SHEETS_API_KEY: z.string().optional(),
    REALTIME_DNSE_MQTT_URL: optionalUrl(['mqtt:', 'mqtts:', 'ws:', 'wss:']),
    REALTIME_DNSE_USERNAME: z.string().optional(),
    REALTIME_DNSE_PASSWORD: z.string().optional(),
    REALTIME_MAX_SYMBOLS: z.coerce.number().int().min(1).max(500).default(90),
    REALTIME_LEASE_TTL_SECONDS: z.coerce.number().int().min(5).max(300).default(30),
    REALTIME_LEASE_RENEW_SECONDS: z.coerce.number().int().min(1).max(100).default(10),
    COMPATIBILITY_V1_ENABLED: booleanSetting(true),
    TELEGRAM_BOT_TOKEN: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).max(256).optional(),
    ),
    TELEGRAM_BOT_USERNAME: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^[A-Za-z][A-Za-z0-9_]{4,31}$/)
        .optional(),
    ),
    TELEGRAM_WEBHOOK_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(16).max(256).optional(),
    ),
    TELEGRAM_LINK_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(600),
    ALERT_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(86_400).default(900),
    ALERT_SCAN_ENABLED: booleanSetting(false),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),
    MEDIA_ROOT: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    MEDIA_SIGNING_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(32).optional(),
    ),
    MEDIA_URL_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(300),
    MEDIA_MAX_THUMBNAIL_MB: z.coerce.number().int().min(1).max(20).default(5),
    MEDIA_MAX_PDF_MB: z.coerce.number().int().min(1).max(500).default(100),
    MEDIA_MAX_VIDEO_MB: z.coerce.number().int().min(1).max(500).default(500),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === 'production' && !env.DATABASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Required in production' });
    }
    if (env.APP_ENV === 'production') {
      for (const key of ['SEPAY_CHECKOUT_URL', 'APP_PUBLIC_URL', 'API_PUBLIC_URL'] as const) {
        const value = env[key];
        if (value && !value.startsWith('https://'))
          ctx.addIssue({ code: 'custom', path: [key], message: 'Production URL must use HTTPS' });
      }
      for (const key of productionProviderUrls) {
        const value = env[key];
        if (value && !isSecureOrLoopbackUrl(value)) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Production provider URL requires a secure protocol or loopback host',
          });
        }
      }
    }
    if (env.APP_ENV === 'production' && (!env.JWT_SECRET_KEY || !env.JWT_REFRESH_SECRET_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET_KEY'],
        message: 'JWT secrets are required in production',
      });
    }
    if (
      env.APP_ENV === 'production' &&
      env.EMAIL_ENABLED &&
      (!env.EMAIL_PROVIDER_URL || !env.EMAIL_API_KEY || !env.EMAIL_SENDER || !env.API_PUBLIC_URL)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_ENABLED'],
        message: 'Email provider and public URL are required when email is enabled',
      });
    }
    if (env.REALTIME_ENABLED && !env.REDIS_ENABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['REALTIME_ENABLED'],
        message: 'Realtime Redis and DNSE settings are required when realtime is enabled',
      });
    }
    if (env.REALTIME_LEASE_RENEW_SECONDS * 2 >= env.REALTIME_LEASE_TTL_SECONDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['REALTIME_LEASE_RENEW_SECONDS'],
        message: 'Realtime renew interval must be less than half the lease TTL',
      });
    }
    if (env.REDIS_ENABLED && !env.REDIS_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message: 'Required when Redis is enabled',
      });
    }
    if (env.APP_ENV === 'production' && !env.REDIS_ENABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_ENABLED'],
        message: 'Required in production for distributed API throttling',
      });
    }
    if ((env.QUEUE_ENABLED || env.MARKET_INGEST_ENABLED) && !env.REDIS_ENABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_ENABLED'],
        message: 'Required for queue or market ingestion',
      });
    }
    if (
      env.APP_ENV === 'production' &&
      env.CORS_ORIGINS.some((origin) => !origin.startsWith('https://'))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Production browser origins must use HTTPS',
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    // Never stringify the input or ZodError: connection URLs can contain credentials.
    throw new Error(
      `Invalid configuration: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  }
  return result.data;
}
