import type { RawNewsItem, TimeWindow, SourceType } from '../types';
import { AllSourcesFailedError } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';
import { fetchNewsAPI } from './newsapi';
import { fetchCryptoPanic } from './cryptopanic';
import { fetchRSSFeeds } from './rss';
import { fetchCoinGeckoEvents } from './coingecko';

// ─── 來源定義型別 ─────────────────────────────────────────────────────────────

interface SourceDefinition {
  name: SourceType;
  enabled: boolean;
  fetch: (timeWindow: TimeWindow) => Promise<RawNewsItem[]>;
}

// ─── 並行收集協調器 ────────────────────────────────────────────────────────────

/**
 * 並行收集所有已啟用來源的加密貨幣新聞
 * - 使用 Promise.allSettled 確保單一來源失敗不中斷整體
 * - 若所有來源均失敗，拋出 AllSourcesFailedError
 * @param timeWindow 目標時間窗（UTC）
 * @returns 所有來源收集到的原始新聞項目合併陣列
 */
export async function collect(timeWindow: TimeWindow): Promise<RawNewsItem[]> {
  const sources: SourceDefinition[] = [
    {
      name: 'newsapi',
      enabled: true,
      fetch: fetchNewsAPI,
    },
    {
      name: 'cryptopanic',
      enabled: true,
      fetch: fetchCryptoPanic,
    },
    {
      name: 'rss',
      enabled: config.sources.enableRss,
      fetch: fetchRSSFeeds,
    },
    {
      name: 'coingecko',
      enabled: config.sources.enableCoinGecko,
      fetch: fetchCoinGeckoEvents,
    },
  ];

  const enabledSources = sources.filter((s) => s.enabled);

  logger.info('開始並行收集所有新聞來源', {
    enabledSources: enabledSources.map((s) => s.name),
    from: timeWindow.from.toISOString(),
    to: timeWindow.to.toISOString(),
  });

  // 記錄每個來源的開始時間
  const startTimes: Record<string, number> = {};
  for (const source of enabledSources) {
    startTimes[source.name] = Date.now();
  }

  const globalStart = Date.now();

  // 並行發起所有來源的請求
  const settledResults = await Promise.allSettled(
    enabledSources.map((source) => source.fetch(timeWindow)),
  );

  const allItems: RawNewsItem[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < settledResults.length; i++) {
    const result = settledResults[i];
    const source = enabledSources[i];
    const durationMs = Date.now() - startTimes[source.name];

    if (result.status === 'fulfilled') {
      successCount++;
      const itemCount = result.value.length;

      logger.info('來源收集成功', {
        source: source.name,
        itemCount,
        durationMs,
      });

      allItems.push(...result.value);
    } else {
      failureCount++;
      const errorMessage =
        result.reason instanceof Error ? result.reason.message : String(result.reason);

      logger.warn('來源收集失敗', {
        source: source.name,
        error: errorMessage,
        durationMs,
      });
    }
  }

  const totalDurationMs = Date.now() - globalStart;

  logger.info('所有來源收集完成', {
    totalItems: allItems.length,
    successSources: successCount,
    failedSources: failureCount,
    totalDurationMs,
  });

  // 若所有來源均失敗，拋出錯誤
  if (successCount === 0 && failureCount > 0) {
    throw new AllSourcesFailedError(
      `所有 ${failureCount} 個新聞來源均收集失敗`,
    );
  }

  return allItems;
}
