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
      lastError = err;
      if (attempt <= options.retries) {
        logger.warn(`${options.label ?? '操作'}失敗，準備重試`, {
          attempt,
          maxRetries: options.retries,
        });
        await delay(options.delayMs);
      }
    }
  }

  throw lastError;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
