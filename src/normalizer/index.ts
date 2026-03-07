import { createHash } from 'crypto';
import type { RawNewsItem, NewsItem, TimeWindow } from '../types';
import { logger } from '../utils/logger';

// ─── 輔助函式 ─────────────────────────────────────────────────────────────────

/**
 * 使用 SHA-256 對 URL 雜湊，取前 16 個 hex 字元作為 ID
 */
function generateId(url: string): string {
  return createHash('sha256').update(url, 'utf8').digest('hex').slice(0, 16);
}

/**
 * 嘗試將字串解析為有效的 UTC Date
 * 優先處理 ISO 8601 格式；失敗時回傳 null
 */
function parsePublishedAt(dateStr: string): Date | null {
  if (!dateStr) return null;

  // 嘗試直接解析（ISO 8601 / RFC 2822 / 其他標準格式）
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

/**
 * 檢查字串是否為有效 URL
 */
function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 標準化 tags：小寫、去空白、過濾空字串
 */
function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  return tags
    .map((tag) => tag.toLowerCase().trim())
    .filter((tag) => tag.length > 0);
}

/**
 * 合併 content：有全文使用全文，否則組合 title + summary
 */
function buildContent(item: RawNewsItem): string {
  if (item.content && item.content.trim()) {
    return item.content.trim();
  }
  const parts: string[] = [item.title];
  if (item.summary && item.summary.trim()) {
    parts.push(item.summary.trim());
  }
  return parts.join(' ');
}

// ─── 主要標準化函式 ────────────────────────────────────────────────────────────

/**
 * 將原始新聞項目標準化為統一格式
 * - 解析並驗證發布時間（UTC）
 * - 過濾不在時間窗內的項目
 * - 過濾標題/URL 為空或 URL 無效的項目
 * - 生成 SHA-256(url) 前 16 hex 字元作為 ID
 * - 合併 content（無全文時：title + summary）
 * - 統一 tags（小寫、去空白）
 *
 * @param items 原始收集項目陣列
 * @param timeWindow 目標時間窗（UTC）
 * @returns 標準化後的 NewsItem 陣列
 */
export function normalize(items: RawNewsItem[], timeWindow: TimeWindow): NewsItem[] {
  logger.info('開始標準化新聞資料', {
    inputCount: items.length,
    from: timeWindow.from.toISOString(),
    to: timeWindow.to.toISOString(),
  });

  const results: NewsItem[] = [];
  let skippedNoTitle = 0;
  let skippedInvalidUrl = 0;
  let skippedInvalidDate = 0;
  let skippedOutOfWindow = 0;

  for (const item of items) {
    // 過濾：title 為空
    if (!item.title || !item.title.trim()) {
      skippedNoTitle++;
      continue;
    }

    // 過濾：url 為空或非有效 URL
    if (!item.url || !isValidUrl(item.url)) {
      skippedInvalidUrl++;
      logger.warn('跳過無效 URL 的新聞項目', {
        source: item.source,
        rawId: item.rawId,
        url: item.url,
      });
      continue;
    }

    // 解析 publishedAt
    const publishedAt = parsePublishedAt(item.publishedAt);
    if (publishedAt === null) {
      skippedInvalidDate++;
      logger.warn('跳過無法解析發布時間的新聞項目', {
        source: item.source,
        rawId: item.rawId,
        publishedAt: item.publishedAt,
      });
      continue;
    }

    // 過濾：不在時間窗內
    if (publishedAt < timeWindow.from || publishedAt > timeWindow.to) {
      skippedOutOfWindow++;
      continue;
    }

    const newsItem: NewsItem = {
      id: generateId(item.url),
      url: item.url,
      title: item.title.trim(),
      content: buildContent(item),
      publishedAt,
      sourceName: item.sourceName,
      sourceType: item.source,
      ...(item.author ? { author: item.author } : {}),
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
      tags: normalizeTags(item.tags),
    };

    results.push(newsItem);
  }

  logger.info('標準化完成', {
    inputCount: items.length,
    outputCount: results.length,
    skippedNoTitle,
    skippedInvalidUrl,
    skippedInvalidDate,
    skippedOutOfWindow,
  });

  return results;
}
