import axios from 'axios';
import axiosRetry from 'axios-retry';
import { logger } from './logger';

// 預設 HTTP 客戶端（帶 retry interceptor）
export const httpClient = axios.create({
  timeout: 30000,
});

axiosRetry(httpClient, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,  // 1s, 2s, 4s
  retryCondition: (error) =>
    axiosRetry.isNetworkOrIdempotentRequestError(error) ||
    error.response?.status === 429,
  onRetry: (retryCount, error) => {
    logger.warn('HTTP 請求重試', {
      retryCount,
      url: error.config?.url,
      status: error.response?.status,
    });
  },
});

/**
 * 不可重試的錯誤（如 AI 安全篩選器攔截），拋出此類型後 withRetry 直接放棄
 */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Too Many Requests');
}

// 通用重試函式（非 HTTP 用途）
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    retries: number;
    delayMs: number;
    label?: string;
  }
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.retries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // 安全篩選器攔截等不可重試錯誤，直接拋出
      if (err instanceof NonRetryableError) {
        throw err;
      }

      lastError = err;
      if (attempt <= options.retries) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // 速率限制錯誤使用更長的等待時間
        const waitMs = isRateLimitError(err) ? options.delayMs * 15 : options.delayMs;

        logger.warn(`${options.label ?? '操作'}失敗，準備重試`, {
          attempt,
          maxRetries: options.retries,
          error: errMsg,
          waitMs,
        });
        await delay(waitMs);
      }
    }
  }

  throw lastError;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
