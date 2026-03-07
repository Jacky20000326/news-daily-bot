import type { AxiosResponse } from 'axios';
import type { RawNewsItem, TimeWindow } from '../types';
import { httpClient } from '../utils/retry';
import { logger } from '../utils/logger';
import { config } from '../config';

// ─── CryptoPanic 回應型別 ──────────────────────────────────────────────────────

interface CryptoPanicSource {
  title: string;
  region: string;
  domain: string;
  path: string | null;
}

interface CryptoPanicCurrency {
  code: string;
  title: string;
  slug: string;
  url: string;
}

interface CryptoPanicPost {
  kind: string;
  domain: string;
  source: CryptoPanicSource;
  title: string;
  published_at: string;
  slug: string;
  currencies: CryptoPanicCurrency[] | null;
  id: number;
  url: string;
  created_at: string;
}

interface CryptoPanicResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CryptoPanicPost[];
}

// ─── 常數設定 ─────────────────────────────────────────────────────────────────

const CRYPTOPANIC_ENDPOINT = 'https://cryptopanic.com/api/v1/posts/';
const PAGE_SIZE = 50;
const TIMEOUT_MS = 30_000;

// ─── 主要收集函式 ─────────────────────────────────────────────────────────────

/**
 * 從 CryptoPanic 收集指定時間窗內的重要加密貨幣新聞
 * 若未設定 CRYPTOPANIC_TOKEN，直接回傳空陣列
 * @param timeWindow 目標時間窗（UTC）
 * @returns 標準化前的原始新聞項目陣列
 */
export async function fetchCryptoPanic(timeWindow: TimeWindow): Promise<RawNewsItem[]> {
  const token = config.sources.cryptoPanicToken;

  // 未設定 token 時直接跳過
  if (!token) {
    logger.info('CRYPTOPANIC_TOKEN 未設定，跳過 CryptoPanic 收集');
    return [];
  }

  const results: RawNewsItem[] = [];
  let nextUrl: string | null = CRYPTOPANIC_ENDPOINT;
  let pageIndex = 0;
  let reachedOlderBound = false;

  logger.info('開始從 CryptoPanic 收集新聞', {
    from: timeWindow.from.toISOString(),
    to: timeWindow.to.toISOString(),
  });

  while (nextUrl !== null && !reachedOlderBound) {
    pageIndex++;

    // 第一頁使用基本參數，後續頁使用 next URL（已包含參數）
    let response: AxiosResponse<CryptoPanicResponse>;
    if (pageIndex === 1) {
      response = await httpClient.get<CryptoPanicResponse>(CRYPTOPANIC_ENDPOINT, {
        timeout: TIMEOUT_MS,
        params: {
          auth_token: token,
          kind: 'news',
          filter: 'important',
          public: 'true',
          page_size: PAGE_SIZE,
        },
      });
    } else {
      response = await httpClient.get<CryptoPanicResponse>(nextUrl, {
        timeout: TIMEOUT_MS,
      });
    }

    const { results: posts, next } = response.data;

    if (!posts || posts.length === 0) {
      logger.debug('CryptoPanic 本頁無資料，停止分頁', { page: pageIndex });
      break;
    }

    for (const post of posts) {
      if (!post.url || !post.published_at) {
        continue;
      }

      const publishedDate = new Date(post.published_at);

      // 超出時間窗上界（太新）：跳過
      if (publishedDate > timeWindow.to) {
        continue;
      }

      // 超出時間窗下界（太舊）：停止分頁
      if (publishedDate < timeWindow.from) {
        reachedOlderBound = true;
        break;
      }

      // 從 currencies 提取 tags
      const tags: string[] =
        post.currencies?.map((c: CryptoPanicCurrency) => c.code.toLowerCase()) ?? [];

      const item: RawNewsItem = {
        source: 'cryptopanic',
        rawId: String(post.id),
        url: post.url,
        title: post.title,
        publishedAt: post.published_at,
        sourceName: post.source.title || post.source.domain || 'CryptoPanic',
        ...(tags.length > 0 ? { tags } : {}),
      };

      results.push(item);
    }

    logger.debug('CryptoPanic 頁面收集完成', {
      page: pageIndex,
      pageCount: posts.length,
      accumulated: results.length,
    });

    nextUrl = reachedOlderBound ? null : (next ?? null);
  }

  logger.info('CryptoPanic 收集完成', {
    totalItems: results.length,
    pagesProcessed: pageIndex,
  });

  return results;
}
