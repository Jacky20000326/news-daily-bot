import Anthropic from '@anthropic-ai/sdk';
import { NewsItem, AnalyzedNewsItem } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { buildSummaryPrompt, buildExecutiveSummaryPrompt } from './prompts/summary';

// ─── 常數 ─────────────────────────────────────────────────────────────────────

const CONCURRENCY_LIMIT = 5;
const RETRY_COUNT = 2;
const RETRY_DELAY_MS = 2000;

// ─── Promise Pool（並行數量控制）─────────────────────────────────────────────

/**
 * 以最多 limit 個並行任務執行 tasks 陣列中的所有非同步函式
 * 保留執行順序（回傳陣列索引對應輸入索引）
 */
async function promisePool<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let currentIndex = 0;

  async function runNext(): Promise<void> {
    while (currentIndex < tasks.length) {
      const taskIndex = currentIndex;
      currentIndex++;
      results[taskIndex] = await tasks[taskIndex]();
    }
  }

  // 啟動最多 limit 個 worker
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
  await Promise.all(workers);

  return results;
}

// ─── AI 客戶端工廠 ────────────────────────────────────────────────────────────

function createClient(): Anthropic {
  return new Anthropic({ apiKey: config.ai.apiKey });
}

// ─── 單則新聞摘要 ─────────────────────────────────────────────────────────────

/**
 * 為單則新聞生成繁體中文 AI 摘要（100-150 字）
 * 失敗時回傳空字串
 */
export async function summarizeItem(item: NewsItem): Promise<string> {
  const client = createClient();

  try {
    const summary = await withRetry(
      async () => {
        const prompt = buildSummaryPrompt(item);

        const response = await client.messages.create({
          model: config.ai.model,
          max_tokens: 512,
          temperature: config.ai.temperature,
          messages: [{ role: 'user', content: prompt }],
        });

        const textBlock = response.content.find((block) => block.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          throw new Error('AI 回應中沒有文字內容');
        }

        const text = textBlock.text.trim();
        if (!text) {
          throw new Error('AI 回傳空白摘要');
        }

        return text;
      },
      {
        retries: RETRY_COUNT,
        delayMs: RETRY_DELAY_MS,
        label: `新聞摘要生成（${item.id}）`,
      }
    );

    return summary;
  } catch (err) {
    logger.warn('新聞摘要生成失敗，回傳空字串', {
      itemId: item.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
}

// ─── 批次並行摘要 ─────────────────────────────────────────────────────────────

/**
 * 對多則新聞並行生成摘要（最多 5 個同時進行）
 */
export async function summarizeItems(items: NewsItem[]): Promise<string[]> {
  logger.info('開始並行生成新聞摘要', {
    count: items.length,
    concurrency: CONCURRENCY_LIMIT,
  });

  const tasks = items.map((item) => () => summarizeItem(item));
  const summaries = await promisePool(tasks, CONCURRENCY_LIMIT);

  const successCount = summaries.filter((s) => s.length > 0).length;
  logger.info('並行摘要生成完成', {
    total: items.length,
    success: successCount,
    failed: items.length - successCount,
  });

  return summaries;
}

// ─── 今日市場總覽 ─────────────────────────────────────────────────────────────

/**
 * 依據前幾名重要新聞生成整體「今日市場總覽」（250-300 字）
 * 失敗時回傳空字串
 */
export async function generateExecutiveSummary(topItems: AnalyzedNewsItem[]): Promise<string> {
  const client = createClient();

  try {
    const executiveSummary = await withRetry(
      async () => {
        const prompt = buildExecutiveSummaryPrompt(topItems);

        const response = await client.messages.create({
          model: config.ai.model,
          max_tokens: 1024,
          temperature: config.ai.temperature,
          messages: [{ role: 'user', content: prompt }],
        });

        const textBlock = response.content.find((block) => block.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          throw new Error('AI 回應中沒有文字內容');
        }

        const text = textBlock.text.trim();
        if (!text) {
          throw new Error('AI 回傳空白總覽');
        }

        return text;
      },
      {
        retries: RETRY_COUNT,
        delayMs: RETRY_DELAY_MS,
        label: '今日市場總覽生成',
      }
    );

    return executiveSummary;
  } catch (err) {
    logger.warn('今日市場總覽生成失敗，回傳空字串', {
      topItemCount: topItems.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
}
