import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../platform/config/environment.js';

type ChatMessage = { role: 'system' | 'user'; content: string };
type CompletionResponse = {
  model?: unknown;
  choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
};

export interface AiCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  signal?: AbortSignal;
}

export interface AiCompletion {
  content: string;
  model: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
}

const CONFIG_ERROR = {
  code: 'AI_NOT_CONFIGURED',
  message: 'Dịch vụ AI chưa được cấu hình',
} as const;

function optionalInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Bounded OpenAI-compatible transport. It never logs secrets, prompts, or provider bodies. */
@Injectable()
export class AiProviderService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  async complete(
    systemPrompt: string,
    userContent: string,
    options: AiCompletionOptions = {},
  ): Promise<AiCompletion> {
    const baseUrl = this.config.get('AI_PROXY_BASE_URL', { infer: true })?.trim();
    const apiKey = this.config.get('AI_PROXY_API_KEY', { infer: true })?.trim();
    const model = this.model();
    if (!baseUrl || !apiKey) throw new ServiceUnavailableException(CONFIG_ERROR);

    const endpoint = this.endpoint(baseUrl);
    const timeoutMs = this.config.get('AI_PROXY_TIMEOUT_MS', { infer: true });
    const retries = Math.min(this.config.get('AI_PROXY_RETRIES', { infer: true }), 3);
    const maxTokens = Math.min(Math.max(options.maxTokens ?? 4_000, 128), 8_000);
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ] satisfies ChatMessage[],
      temperature: Math.min(Math.max(options.temperature ?? 0.2, 0), 1),
      max_tokens: maxTokens,
    };
    if (options.json) body.response_format = { type: 'json_object' };
    // DeepSeek enables thinking by default; its reasoning shares max_tokens
    // with the final answer. Opt out explicitly for bounded JSON workloads.
    const thinking = this.config.get('AI_PROXY_THINKING', { infer: true });
    if (thinking) body.thinking = { type: thinking };

    const deadline = Date.now() + timeoutMs;
    let lastStatus: number | undefined;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const timeoutSignal = AbortSignal.timeout(remaining);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(body),
          redirect: 'error',
          signal: AbortSignal.any([timeoutSignal, ...(options.signal ? [options.signal] : [])]),
        });
        lastStatus = response.status;
        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < retries) {
            await this.pause(this.retryDelay(response, attempt), deadline);
            continue;
          }
          if (response.status === 429 || response.status >= 500) {
            throw new ServiceUnavailableException({
              code: response.status === 429 ? 'AI_RATE_LIMITED' : 'AI_UPSTREAM_UNAVAILABLE',
              message: 'Dịch vụ AI tạm thời không khả dụng',
            });
          }
          throw new BadGatewayException({
            code: 'AI_UPSTREAM_REJECTED',
            message: `Dịch vụ AI từ chối yêu cầu (${response.status})`,
          });
        }
        return this.parse(await this.safeJson(response), model);
      } catch (error) {
        if (error instanceof BadGatewayException || error instanceof ServiceUnavailableException) {
          throw error;
        }
        if (options.signal?.aborted) throw error;
        if (attempt < retries) {
          await this.pause(Math.min(150 * 2 ** attempt, 800), deadline);
          continue;
        }
      }
    }
    throw new ServiceUnavailableException({
      code: lastStatus === 429 ? 'AI_RATE_LIMITED' : 'AI_UPSTREAM_TIMEOUT',
      message: 'Dịch vụ AI không phản hồi trong thời gian cho phép',
    });
  }

  model(): string {
    return this.config.get('AI_PROXY_MODEL', { infer: true })?.trim() || 'deepseek-flash';
  }

  private endpoint(baseUrl: string): URL {
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new ServiceUnavailableException(CONFIG_ERROR);
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new ServiceUnavailableException(CONFIG_ERROR);
    }
    url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`;
    url.search = '';
    url.hash = '';
    return url;
  }

  private async safeJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new BadGatewayException({
        code: 'AI_INVALID_RESPONSE',
        message: 'Dịch vụ AI trả về dữ liệu không hợp lệ',
      });
    }
  }

  private parse(value: unknown, fallbackModel: string): AiCompletion {
    const data = value as CompletionResponse;
    const finishReason = data?.choices?.[0]?.finish_reason;
    if (finishReason && finishReason !== 'stop') {
      throw new BadGatewayException({
        code: finishReason === 'length' ? 'AI_OUTPUT_TRUNCATED' : 'AI_INCOMPLETE_RESPONSE',
        message: 'Dịch vụ AI chưa trả về câu trả lời hoàn chỉnh',
      });
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new BadGatewayException({
        code: 'AI_INVALID_RESPONSE',
        message: 'Dịch vụ AI trả về dữ liệu không hợp lệ',
      });
    }
    return {
      content: content.trim(),
      model: typeof data.model === 'string' ? data.model : fallbackModel,
      usage: {
        promptTokens: optionalInteger(data.usage?.prompt_tokens),
        completionTokens: optionalInteger(data.usage?.completion_tokens),
        totalTokens: optionalInteger(data.usage?.total_tokens),
      },
    };
  }

  private retryDelay(response: Response, attempt: number): number {
    const retryAfter = Number(response.headers.get('retry-after'));
    return Number.isFinite(retryAfter)
      ? Math.min(Math.max(retryAfter * 1_000, 0), 2_000)
      : Math.min(150 * 2 ** attempt, 800);
  }

  private async pause(milliseconds: number, deadline: number): Promise<void> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, Math.min(milliseconds, remaining)));
  }
}
