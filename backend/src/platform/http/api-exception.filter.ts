import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

function defaultCode(status: number): string {
  return (
    (
      {
        400: 'BAD_REQUEST',
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        405: 'METHOD_NOT_ALLOWED',
        409: 'CONFLICT',
        413: 'PAYLOAD_TOO_LARGE',
        422: 'VALIDATION_ERROR',
        429: 'RATE_LIMITED',
        503: 'SERVICE_UNAVAILABLE',
      } as Record<number, string>
    )[status] ?? 'INTERNAL_ERROR'
  );
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const nativeError =
      exception && typeof exception === 'object' ? (exception as Record<string, unknown>) : {};
    const isParserError =
      typeof nativeError.code === 'string' &&
      nativeError.code.startsWith('FST_ERR_') &&
      [400, 413, 431].includes(Number(nativeError.statusCode));
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : isParserError
          ? Number(nativeError.statusCode)
          : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : undefined;
    const body =
      typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
    const code = typeof body.code === 'string' ? body.code : defaultCode(status);
    const rawMessage = typeof payload === 'string' ? payload : body.message;
    const message =
      status >= 500
        ? status === 503
          ? 'Dịch vụ tạm thời không khả dụng'
          : 'Đã xảy ra lỗi hệ thống'
        : typeof rawMessage === 'string'
          ? rawMessage
          : 'Dữ liệu yêu cầu không hợp lệ';
    if (status >= 500)
      this.logger.error({ request_id: request.id, status, code }, 'Request failed');
    reply.header('X-Request-ID', request.id);
    reply.type('application/json; charset=utf-8');
    if (request.url.split('?')[0] === '/health/ready' && code === 'NOT_READY') {
      void reply.status(503).send({ status: 'not_ready', dependencies: body.dependencies });
      return;
    }
    if (status === 401) reply.header('WWW-Authenticate', 'Bearer');
    if (request.url.startsWith('/api/v1/')) {
      if (typeof body.detail === 'string' || Array.isArray(body.detail)) {
        void reply.status(status).send({ detail: body.detail });
        return;
      }
      void reply.status(status).send({ detail: message, code });
      return;
    }
    void reply.status(status).send({
      error: { code, message, ...(Array.isArray(body.details) ? { details: body.details } : {}) },
      request_id: request.id,
    });
  }
}
