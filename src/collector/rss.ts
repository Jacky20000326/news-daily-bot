import Parser from 'rss-parser';
import type { RawNewsItem, TimeWindow } from '../types';
import { logger } from '../utils/logger';

// ─── RSS Feed 定義 ────────────────────────────────────────────────────────────

interface FeedDefinition {
  name: string;
  url: string;
}

const DEFAULT_FEEDS: FeedDefinition[] = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'The Block', url: 'https://www.theblock.co/rss.xml' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed' },
  { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/.rss/full/' },
];

const FEED_TIMEOUT_MS = 15_000;

// ─── RSS Parser 型別擴充 ───────────────────────────────────────────────────────

// rss-parser 自訂欄位
interface CustomItem {
  'content:encoded'?: string;
  'media:content'?: { $?: { url?: string } };
  enclosure?: { url?: string };
  creator?: string;
  category?: string | string[];
}

type RSSItem = Parser.Item & CustomItem;

// ─── 單一 Feed 擷取 ───────────────────────────────────────────────────────────

/**
 * 擷取單一 RSS Feed，回傳符合時間窗的原始新聞項目
 */
async function fetchSingleFeed(
  feed: FeedDefinition,
  timeWindow: TimeWindow,
): Promise<RawNewsItem[]> {
  const parser = new Parser<Record<string, unknown>, CustomItem>({
    timeout: FEED_TIMEOUT_MS,
    customFields: {
      item: [
        ['content:encoded', 'content:encoded'],
        ['media:content', 'media:content'],
        ['dc:creator', 'creator'],
        ['category', 'category'],
      ],
    },
  });

  const feedData = await parser.parseURL(feed.url);
  const results: RawNewsItem[] = [];

  for (const rawItem of (feedData.items as RSSItem[])) {
    // 解析發布時間（優先 isoDate，其次 pubDate）
    const dateStr = rawItem.isoDate ?? rawItem.pubDate ?? '';
    if (!dateStr) {
      continue;
    }

    const publishedDate = new Date(dateStr);
    if (isNaN(publishedDate.getTime())) {
      logger.warn('RSS 無法解析發布時間', { feed: feed.name, dateStr });
      continue;
    }

    // 過濾時間窗
    if (publishedDate < timeWindow.from || publishedDate > timeWindow.to) {
      continue;
    }

    const url = rawItem.link ?? '';
    const title = rawItem.title ?? '';

    if (!url || !title) {
      continue;
    }

    // 提取圖片 URL
    const mediaContent = rawItem['media:content'];
    const imageUrl =
      rawItem.enclosure?.url ??
      (mediaContent?.$?.url) ??
      undefined;

    // 提取分類 tags
    const rawCategory = rawItem.category;
    let tags: string[] = [];
    if (Array.isArray(rawCategory)) {
      tags = rawCategory.map((c) => String(c).toLowerCase().trim());
    } else if (typeof rawCategory === 'string' && rawCategory) {
      tags = [rawCategory.toLowerCase().trim()];
    }

    // 全文優先使用 content:encoded，其次是 content
    const fullContent = rawItem['content:encoded'] ?? rawItem.content ?? undefined;
    const summary = rawItem.contentSnippet ?? rawItem.summary ?? undefined;

    const item: RawNewsItem = {
      source: 'rss',
      rawId: url,
      url,
      title,
      publishedAt: publishedDate.toISOString(),
      sourceName: feed.name,
      ...(fullContent ? { content: fullContent } : {}),
      ...(summary ? { summary } : {}),
      ...(rawItem.creator ? { author: rawItem.creator } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    };

    results.push(item);
  }

  return results;
}

// ─── 主要收集函式 ─────────────────────────────────────────────────────────────

/**
 * 並行抓取所有 RSS Feeds，單一 feed 失敗不中斷整體流程
 * @param timeWindow 目標時間窗（UTC）
 * @returns 標準化前的原始新聞項目陣列
 */
export async function fetchRSSFeeds(timeWindow: TimeWindow): Promise<RawNewsItem[]> {
  logger.info('開始從 RSS Feeds 收集新聞', {
    feedCount: DEFAULT_FEEDS.length,
    from: timeWindow.from.toISOString(),
    to: timeWindow.to.toISOString(),
  });

  // 並行抓取所有 feeds
  const settledResults = await Promise.allSettled(
    DEFAULT_FEEDS.map((feed) => fetchSingleFeed(feed, timeWindow)),
  );

  const allItems: RawNewsItem[] = [];

  for (let i = 0; i < settledResults.length; i++) {
    const result = settledResults[i];
    const feed = DEFAULT_FEEDS[i];

    if (result.status === 'fulfilled') {
      logger.debug('RSS Feed 收集完成', {
        feed: feed.name,
        itemCount: result.value.length,
      });
      allItems.push(...result.value);
    } else {
      logger.warn('RSS Feed 收集失敗', {
        feed: feed.name,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  logger.info('RSS Feeds 收集完成', { totalItems: allItems.length });

  return allItems;
}
