import { GoogleGenerativeAI, GenerateContentResult } from '@google/generative-ai';
import { AnalyzedNewsItem } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { withRetry, NonRetryableError } from '../utils/retry';
import { tokenTracker } from '../utils/token-tracker';
import { fetchArticleContent } from './article-fetcher';
import { buildDeepAnalysisPrompt } from './prompts/deep-analysis';

// ─── 常數 ─────────────────────────────────────────────────────────────────────

/** 深度分析的並行數（配合 Gemini 免費層 RPM 限制） */
const CONCURRENCY_LIMIT = 2;
const RETRY_COUNT = 2;
const RETRY_DELAY_MS = 3000;

// ─── Promise Pool ────────────────────────────────────────────────────────────

async function promisePool<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
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

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    runNext(),
  );
  await Promise.all(workers);

  return results;
}

// ─── AI 客戶端 ───────────────────────────────────────────────────────────────

function createModel() {
  const genAI = new GoogleGenerativeAI(config.ai.apiKey);
  return genAI.getGenerativeModel({
    model: config.ai.model,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2048,
    },
  });
}

function safeGetText(result: GenerateContentResult): string {
  const candidate = result.response.candidates?.[0];

  if (!candidate) {
    const blockReason = result.response.promptFeedback?.blockReason;
    throw new NonRetryableError(
      `Gemini 安全篩選器阻擋請求（blockReason: ${blockReason ?? '未知'}）`,
    );
  }

  const finishReason = candidate.finishReason as string | undefined;
  if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
    throw new NonRetryableError(
      `Gemini 拒絕生成內容（finishReason: ${finishReason}）`,
    );
  }

  return result.response.text().trim();
}

// ─── 單則深度分析 ────────────────────────────────────────────────────────────

/**
 * 對單則新聞進行深度分析：
 * 1. 抓取原始文章全文
 * 2. 交由 AI 生成深度分析報告
 * 失敗時回傳空字串
 */
async function deepAnalyzeItem(item: AnalyzedNewsItem): Promise<string> {
  // 步驟 1：抓取文章內容
  const articleContent = await fetchArticleContent(item.url);

  if (!articleContent || articleContent.length < 100) {
    logger.warn('文章內容不足，跳過深度分析', {
      itemId: item.id,
      url: item.url,
      contentLength: articleContent.length,
    });
    // 即使抓取失敗，仍可基於已有資訊嘗試分析
    // 但內容太少則直接跳過
    return '';
  }

  // 步驟 2：AI 深度分析
  const model = createModel();

  try {
    const analysis = await withRetry(
      async () => {
        const prompt = buildDeepAnalysisPrompt(item, articleContent);
        const result = await model.generateContent(prompt);
        tokenTracker.record(`深度分析-${item.id}`, result.response.usageMetadata);
        const text = safeGetText(result);

        if (!text) {
          throw new Error('AI 回傳空白深度分析');
        }

        return text;
      },
      {
        retries: RETRY_COUNT,
        delayMs: RETRY_DELAY_MS,
        label: `深度分析生成（${item.id}）`,
      },
    );

    logger.info('深度分析生成成功', {
      itemId: item.id,
      analysisLength: analysis.length,
    });

    return analysis;
  } catch (err) {
    logger.warn('深度分析生成失敗', {
      itemId: item.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
}

// ─── 批次深度分析 ────────────────────────────────────────────────────────────

/**
 * 對多則重點新聞進行深度分析（抓取原文 + AI 分析）
 * 回傳 Map<itemId, deepAnalysis>
 */
export async function deepAnalyzeItems(
  items: AnalyzedNewsItem[],
): Promise<Map<string, string>> {
  logger.info('開始重點新聞深度分析', {
    count: items.length,
    concurrency: CONCURRENCY_LIMIT,
  });

  const tasks = items.map((item) => () => deepAnalyzeItem(item));
  const results = await promisePool(tasks, CONCURRENCY_LIMIT);

  const analysisMap = new Map<string, string>();
  for (let i = 0; i < items.length; i++) {
    if (results[i]) {
      analysisMap.set(items[i].id, results[i]);
    }
  }

  const successCount = Array.from(analysisMap.values()).filter((v) => v.length > 0).length;
  logger.info('深度分析完成', {
    total: items.length,
    success: successCount,
    failed: items.length - successCount,
  });

  return analysisMap;
}
