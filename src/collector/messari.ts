import type { RawNewsItem, TimeWindow } from "../types";
import { httpClient } from "../utils/retry";
import { logger } from "../utils/logger";
import { config } from "../config";

// ─── Messari API 回應型別 ──────────────────────────────────────────────────────

interface MessariNewsArticle {
  id: string;
  title: string;
  content: string;
  url: string;
  author: {
    name: string;
  } | null;
  published_at: string; // ISO 8601
  tags: string[];
  references: {
    name: string;
    url: string;
  }[];
}

interface MessariNewsResponse {
  data: MessariNewsArticle[];
}

// ─── 常數設定 ─────────────────────────────────────────────────────────────────

const MESSARI_ENDPOINT = "https://api.messari.io/v1/news";
const PAGE_SIZE = 50;
const MAX_PAGES = 5;
const TIMEOUT_MS = 30_000;

// ─── 主要收集函式 ─────────────────────────────────────────────────────────────

/**
 * 從 Messari News API 收集指定時間窗內的加密貨幣新聞
 * @param timeWindow 目標時間窗（UTC）
 * @returns 標準化前的原始新聞項目陣列
 */
export async function fetchMessari(
  timeWindow: TimeWindow,
): Promise<RawNewsItem[]> {
  const results: RawNewsItem[] = [];
  let page = 1;
  let hasMore = true;

  logger.info("開始從 Messari API 收集新聞", {
    from: timeWindow.from.toISOString(),
    to: timeWindow.to.toISOString(),
  });

  while (hasMore && page <= MAX_PAGES) {
    const response = await httpClient.get<MessariNewsResponse>(
      MESSARI_ENDPOINT,
      {
        timeout: TIMEOUT_MS,
        headers: {
          "x-messari-api-key": config.sources.messariApiKey,
        },
        params: {
          page,
          per_page: PAGE_SIZE,
        },
      },
    );

    const articles = response.data?.data;

    if (!articles || articles.length === 0) {
      logger.debug("Messari 本頁無資料，停止分頁", { page });
      break;
    }

    for (const article of articles) {
      // 跳過缺少必要欄位的文章
      if (!article.url || !article.title || !article.published_at) {
        continue;
      }

      const publishedDate = new Date(article.published_at);

      // 超出時間窗下界，後續資料更舊，停止
      if (publishedDate < timeWindow.from) {
        hasMore = false;
        break;
      }

      // 跳過時間窗上界以外的文章
      if (publishedDate > timeWindow.to) {
        continue;
      }

      const item: RawNewsItem = {
        source: "messari",
        rawId: article.id,
        url: article.url,
        title: article.title,
        publishedAt: article.published_at,
        sourceName: "Messari",
        ...(article.content ? { content: article.content } : {}),
        ...(article.author?.name ? { author: article.author.name } : {}),
        ...(article.tags?.length ? { tags: article.tags } : {}),
      };

      results.push(item);
    }

    logger.debug("Messari 頁面收集完成", {
      page,
      pageCount: articles.length,
      accumulated: results.length,
    });

    if (articles.length < PAGE_SIZE || !hasMore) {
      hasMore = false;
    } else {
      page++;
    }
  }

  logger.info("Messari 收集完成", {
    totalItems: results.length,
    pagesProcessed: page,
  });

  return results;
}
