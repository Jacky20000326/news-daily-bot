import type { RawNewsItem, TimeWindow } from '../types';
import { httpClient } from '../utils/retry';
import { logger } from '../utils/logger';
import { config } from '../config';

// ─── CoinGecko 回應型別 ────────────────────────────────────────────────────────

interface CoinGeckoEvent {
  type: string;
  type_code: string;
  title: string;
  description: string;
  organizer: string;
  start_date: string;
  end_date: string;
  country_code: string;
  city: string;
  url: string;
  screenshot: string;
}

interface CoinGeckoEventsResponse {
  data: CoinGeckoEvent[];
  count: number;
  page: number;
  total_pages: number;
}

// ─── 常數設定 ─────────────────────────────────────────────────────────────────

const COINGECKO_ENDPOINT = 'https://api.coingecko.com/api/v3/events';
const TIMEOUT_MS = 20_000;

// ─── 主要收集函式 ─────────────────────────────────────────────────────────────

/**
 * 從 CoinGecko 收集指定時間窗內的加密貨幣事件
 * @param timeWindow 目標時間窗（UTC）
 * @returns 標準化前的原始新聞項目陣列（sourceType 標記為 'coingecko'）
 */
export async function fetchCoinGeckoEvents(timeWindow: TimeWindow): Promise<RawNewsItem[]> {
  const apiKey = config.sources.coinGeckoApiKey;

  // 依據是否有 API key 決定 header
  const headers: Record<string, string> = apiKey
    ? { 'x-cg-pro-api-key': apiKey }
    : {};

  logger.info('開始從 CoinGecko 收集事件', {
    from: timeWindow.from.toISOString(),
    to: timeWindow.to.toISOString(),
    hasPROKey: Boolean(apiKey),
  });

  const response = await httpClient.get<CoinGeckoEventsResponse>(COINGECKO_ENDPOINT, {
    timeout: TIMEOUT_MS,
    headers,
    params: {
      upcoming_events_exclude_ended: false,
    },
  });

  const events = response.data?.data ?? [];

  if (!Array.isArray(events) || events.length === 0) {
    logger.info('CoinGecko 無事件資料');
    return [];
  }

  const results: RawNewsItem[] = [];

  for (const event of events) {
    // 事件必須有標題與 URL
    if (!event.title || !event.url) {
      continue;
    }

    // 使用 start_date 作為發布時間（為 ISO 日期字串）
    const dateStr = event.start_date;
    if (!dateStr) {
      continue;
    }

    const eventDate = new Date(dateStr);
    if (isNaN(eventDate.getTime())) {
      logger.warn('CoinGecko 無法解析事件時間', { title: event.title, dateStr });
      continue;
    }

    // 過濾不在時間窗內的事件
    if (eventDate < timeWindow.from || eventDate > timeWindow.to) {
      continue;
    }

    // 組合描述資訊
    const locationParts = [event.city, event.country_code].filter(Boolean);
    const locationStr = locationParts.length > 0 ? locationParts.join(', ') : '';
    const summaryParts: string[] = [];
    if (event.description) summaryParts.push(event.description);
    if (locationStr) summaryParts.push(`地點：${locationStr}`);
    if (event.organizer) summaryParts.push(`主辦：${event.organizer}`);

    const tags: string[] = [event.type_code?.toLowerCase(), event.type?.toLowerCase()].filter(
      (t): t is string => typeof t === 'string' && t.length > 0,
    );

    const item: RawNewsItem = {
      source: 'coingecko',
      rawId: event.url,
      url: event.url,
      title: event.title,
      publishedAt: eventDate.toISOString(),
      sourceName: 'CoinGecko',
      ...(summaryParts.length > 0 ? { summary: summaryParts.join(' | ') } : {}),
      ...(event.screenshot ? { imageUrl: event.screenshot } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    };

    results.push(item);
  }

  logger.info('CoinGecko 收集完成', { totalItems: results.length });

  return results;
}
