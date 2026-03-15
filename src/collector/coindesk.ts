import type { RawNewsItem, TimeWindow } from '../types';
import { httpClient } from '../utils/retry';
import { logger } from '../utils/logger';

// ─── CoinDesk API 回應型別 ──────────────────────────────────────────────────────

interface CoinDeskCategory {
  NAME: string;
  CATEGORY: string;
}

interface CoinDeskSourceData {
  NAME: string;
}

interface CoinDeskArticle {
  ID: number;
  GUID: string;
  PUBLISHED_ON: number;          // Unix timestamp（秒）
  IMAGE_URL: string | null;
  TITLE: string;
  AUTHORS: string;
  URL: string;
  BODY: string;
  KEYWORDS: string | null;       // pipe-separated（e.g., "BTC|ETH"）
  LANG: string;
  SOURCE_DATA: CoinDeskSourceData;
  CATEGORY_DATA: CoinDeskCategory[];
}

interface CoinDeskResponse {
  Data: CoinDeskArticle[];
  Err: Record<string, unknown>;
}

// ─── 常數設定 ─────────────────────────────────────────────────────────────────

const COINDESK_ENDPOINT = 'https://data-api.coindesk.com/news/v1/article/list';
const PAGE_SIZE = 50;
const TIMEOUT_MS = 30_000;

// ─── 主要收集函式 ─────────────────────────────────────────────────────────────

/**
 * 從 CoinDesk Data API 收集指定時間窗內的加密貨幣新聞
 * @param timeWindow 目標時間窗（UTC）
 * @returns 標準化前的原始新聞項目陣列
 */
export async function fetchCoinDesk(timeWindow: TimeWindow): Promise<RawNewsItem[]> {
  const results: RawNewsItem[] = [];

  // 將時間窗轉為 Unix timestamp（秒）
  const fromTs = Math.floor(timeWindow.from.getTime() / 1000);
  const toTs = Math.floor(timeWindow.to.getTime() / 1000);

  logger.info('開始從 CoinDesk API 收集新聞', {
    from: timeWindow.from.toISOString(),
    to: timeWindow.to.toISOString(),
  });

  let currentToTs = toTs;
  let hasMore = true;

  while (hasMore) {
    const response = await httpClient.get<CoinDeskResponse>(COINDESK_ENDPOINT, {
      timeout: TIMEOUT_MS,
      params: {
        lang: 'EN',
        limit: PAGE_SIZE,
        to_ts: currentToTs,
      },
    });

    const articles = response.data?.Data;

    if (!articles || articles.length === 0) {
      logger.debug('CoinDesk 本頁無資料，停止分頁');
      break;
    }

    for (const article of articles) {
      // 跳過缺少必要欄位的文章
      if (!article.URL || !article.TITLE || !article.PUBLISHED_ON) {
        continue;
      }

      const publishedTs = article.PUBLISHED_ON;

      // 超出時間窗下界，後續資料更舊，停止
      if (publishedTs < fromTs) {
        hasMore = false;
        break;
      }

      // 跳過時間窗上界以外的文章
      if (publishedTs > toTs) {
        continue;
      }

      // 從 KEYWORDS 和 CATEGORY_DATA 提取 tags
      const tags: string[] = [];
      if (article.KEYWORDS) {
        tags.push(...article.KEYWORDS.split('|').map((k) => k.trim()).filter(Boolean));
      }
      if (article.CATEGORY_DATA) {
        for (const cat of article.CATEGORY_DATA) {
          if (cat.CATEGORY && !tags.includes(cat.CATEGORY)) {
            tags.push(cat.CATEGORY);
          }
        }
      }

      const item: RawNewsItem = {
        source: 'coindesk',
        rawId: String(article.ID),
        url: article.URL,
        title: article.TITLE,
        publishedAt: new Date(publishedTs * 1000).toISOString(),
        sourceName: article.SOURCE_DATA?.NAME || 'CoinDesk',
        ...(article.BODY ? { content: article.BODY } : {}),
        ...(article.AUTHORS ? { author: article.AUTHORS } : {}),
        ...(article.IMAGE_URL ? { imageUrl: article.IMAGE_URL } : {}),
        ...(tags.length > 0 ? { tags } : {}),
      };

      results.push(item);
    }

    // 取最後一篇文章的時間作為下一頁的 to_ts
    const lastArticle = articles[articles.length - 1];
    if (lastArticle && lastArticle.PUBLISHED_ON < currentToTs) {
      currentToTs = lastArticle.PUBLISHED_ON - 1;
    } else {
      hasMore = false;
    }

    logger.debug('CoinDesk 頁面收集完成', {
      pageCount: articles.length,
      accumulated: results.length,
    });
  }

  logger.info('CoinDesk 收集完成', { totalItems: results.length });

  return results;
}
