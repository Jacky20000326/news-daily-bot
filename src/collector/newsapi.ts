import type { RawNewsItem, TimeWindow } from '../types';
import { httpClient } from '../utils/retry';
import { logger } from '../utils/logger';
import { config } from '../config';

// ─── NewsAPI 回應型別 ──────────────────────────────────────────────────────────

interface NewsAPIArticleSource {
  id: string | null;
  name: string;
}

interface NewsAPIArticle {
  source: NewsAPIArticleSource;
  author: string | null;
  title: string | null;
  description: string | null;
  url: string | null;
  urlToImage: string | null;
  publishedAt: string | null;
  content: string | null;
}

interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsAPIArticle[];
}

// ─── 常數設定 ─────────────────────────────────────────────────────────────────

const NEWSAPI_ENDPOINT = 'https://newsapi.org/v2/everything';
const QUERY_KEYWORDS =
  'bitcoin OR ethereum OR crypto OR cryptocurrency OR blockchain OR DeFi OR NFT';
const PAGE_SIZE = 100;
const TIMEOUT_MS = 30_000;

// ─── 主要收集函式 ─────────────────────────────────────────────────────────────

/**
 * 從 NewsAPI.org 收集指定時間窗內的加密貨幣新聞
 * @param timeWindow 目標時間窗（UTC）
 * @returns 標準化前的原始新聞項目陣列
 */
export async function fetchNewsAPI(timeWindow: TimeWindow): Promise<RawNewsItem[]> {
  const results: RawNewsItem[] = [];
  let page = 1;
  let hasMore = true;

  logger.info('開始從 NewsAPI 收集新聞', {
    from: timeWindow.from.toISOString(),
    to: timeWindow.to.toISOString(),
  });

  while (hasMore) {
    const response = await httpClient.get<NewsAPIResponse>(NEWSAPI_ENDPOINT, {
      timeout: TIMEOUT_MS,
      headers: {
        'X-Api-Key': config.sources.newsApiKey,
      },
      params: {
        q: QUERY_KEYWORDS,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: PAGE_SIZE,
        page,
        from: timeWindow.from.toISOString(),
        to: timeWindow.to.toISOString(),
      },
    });

    const { status, articles, totalResults } = response.data;

    if (status !== 'ok') {
      logger.warn('NewsAPI 回傳非 ok 狀態', { status, page });
      break;
    }

    if (!articles || articles.length === 0) {
      logger.debug('NewsAPI 本頁無資料，停止分頁', { page });
      break;
    }

    // 轉換每篇文章為 RawNewsItem
    for (const article of articles) {
      // 跳過缺少必要欄位的文章
      if (!article.url || !article.title || !article.publishedAt) {
        continue;
      }

      // 檢查發布時間是否在時間窗內
      const publishedDate = new Date(article.publishedAt);
      if (publishedDate < timeWindow.from || publishedDate > timeWindow.to) {
        // 已超出時間窗下界，後續資料更舊，停止分頁
        if (publishedDate < timeWindow.from) {
          hasMore = false;
        }
        continue;
      }

      const item: RawNewsItem = {
        source: 'newsapi',
        rawId: article.url,
        url: article.url,
        title: article.title,
        publishedAt: article.publishedAt,
        sourceName: article.source.name || 'Unknown',
        ...(article.content ? { content: article.content } : {}),
        ...(article.description ? { summary: article.description } : {}),
        ...(article.author ? { author: article.author } : {}),
        ...(article.urlToImage ? { imageUrl: article.urlToImage } : {}),
      };

      results.push(item);
    }

    logger.debug('NewsAPI 頁面收集完成', {
      page,
      pageCount: articles.length,
      totalResults,
      accumulated: results.length,
    });

    // 判斷是否需要繼續分頁
    const fetchedCount = page * PAGE_SIZE;
    if (fetchedCount >= totalResults || articles.length < PAGE_SIZE || !hasMore) {
      hasMore = false;
    } else {
      page++;
    }
  }

  logger.info('NewsAPI 收集完成', { totalItems: results.length, pagesProcessed: page });

  return results;
}
