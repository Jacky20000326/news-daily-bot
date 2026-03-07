import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { NewsItem, NewsCategory, Sentiment } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { withRetry, delay } from '../utils/retry';
import { buildRankingPrompt } from './prompts/ranking';
import { classifyByKeywords } from './prompts/classification';

// ─── 型別定義 ─────────────────────────────────────────────────────────────────

export interface RankingResult {
  importanceScore: number;
  category: NewsCategory;
  relatedTickers: string[];
  sentiment: Sentiment;
}

// AI 回傳的原始 JSON 結構
interface RawRankingItem {
  id: string;
  importanceScore: number;
  category: string;
  relatedTickers: string[];
  sentiment: string;
}

// ─── 常數 ─────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 20;
const BATCH_INTERVAL_MS = 1000;
const RETRY_COUNT = 2;
const RETRY_DELAY_MS = 2000;
const FALLBACK_SCORE = 5;

// ─── 驗證函式 ─────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set<string>([
  'market',
  'regulation',
  'technology',
  'defi',
  'nft',
  'security',
  'macro',
  'exchange',
  'other',
]);

const VALID_SENTIMENTS = new Set<string>(['positive', 'negative', 'neutral']);

function isValidCategory(value: string): value is NewsCategory {
  return VALID_CATEGORIES.has(value);
}

function isValidSentiment(value: string): value is Sentiment {
  return VALID_SENTIMENTS.has(value);
}

/**
 * 驗證並正規化單筆 AI 回傳的評分結果
 */
function validateRankingItem(raw: RawRankingItem): RankingResult {
  const importanceScore =
    typeof raw.importanceScore === 'number' && raw.importanceScore >= 1 && raw.importanceScore <= 10
      ? Math.round(raw.importanceScore)
      : FALLBACK_SCORE;

  const category = isValidCategory(raw.category) ? raw.category : 'other';
  const sentiment = isValidSentiment(raw.sentiment) ? raw.sentiment : 'neutral';

  const relatedTickers = Array.isArray(raw.relatedTickers)
    ? raw.relatedTickers
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.toUpperCase().trim())
        .filter((t) => t.length > 0)
    : [];

  return { importanceScore, category, relatedTickers, sentiment };
}

// ─── AI 回應解析 ──────────────────────────────────────────────────────────────

/**
 * 解析 AI 回傳的 JSON 字串，提取 RawRankingItem 陣列
 * 支援 AI 在 JSON 外包裹 markdown 程式碼區塊的情況
 */
function parseRankingResponse(responseText: string): RawRankingItem[] {
  // 嘗試移除 markdown 程式碼區塊標記
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  const parsed: unknown = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error('AI 回傳格式不是陣列');
  }

  return parsed as RawRankingItem[];
}

// ─── 單批次處理 ───────────────────────────────────────────────────────────────

/**
 * 處理單一批次的新聞評分，失敗時使用關鍵字備援
 */
async function processBatch(
  model: GenerativeModel,
  batch: NewsItem[],
  batchIndex: number
): Promise<Map<string, RankingResult>> {
  const resultMap = new Map<string, RankingResult>();

  try {
    const prompt = buildRankingPrompt(batch);

    const rawItems = await withRetry(
      async () => {
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        if (!text) {
          throw new Error('AI 回應中沒有文字內容');
        }

        return parseRankingResponse(text);
      },
      {
        retries: RETRY_COUNT,
        delayMs: RETRY_DELAY_MS,
        label: `批次 ${batchIndex + 1} 新聞評分`,
      }
    );

    // 建立 id -> rawItem 的對照表（容許 AI 回傳順序不同）
    const rawItemMap = new Map<string, RawRankingItem>();
    for (const rawItem of rawItems) {
      if (typeof rawItem.id === 'string') {
        rawItemMap.set(rawItem.id, rawItem);
      }
    }

    // 對照每筆批次項目，填入驗證後的結果
    for (const item of batch) {
      const rawItem = rawItemMap.get(item.id);
      if (rawItem) {
        resultMap.set(item.id, validateRankingItem(rawItem));
      } else {
        // AI 未回傳此筆，使用關鍵字備援
        logger.warn('AI 未回傳該新聞的評分，使用關鍵字備援', { itemId: item.id });
        resultMap.set(item.id, {
          importanceScore: FALLBACK_SCORE,
          category: classifyByKeywords(item),
          relatedTickers: [],
          sentiment: 'neutral',
        });
      }
    }
  } catch (err) {
    // 整批失敗：記錄 warn 並對批次所有項目使用關鍵字備援
    logger.warn('批次新聞評分失敗，使用關鍵字備援', {
      batchIndex,
      batchSize: batch.length,
      error: err instanceof Error ? err.message : String(err),
    });

    for (const item of batch) {
      resultMap.set(item.id, {
        importanceScore: FALLBACK_SCORE,
        category: classifyByKeywords(item),
        relatedTickers: [],
        sentiment: 'neutral',
      });
    }
  }

  return resultMap;
}

// ─── 主要匯出函式 ─────────────────────────────────────────────────────────────

/**
 * 對所有新聞進行批次評分與分類
 *
 * 每批 20 筆，批次間間隔 1 秒，失敗時使用關鍵字備援
 */
export async function rankAndClassify(
  items: NewsItem[]
): Promise<Map<string, RankingResult>> {
  const genAI = new GoogleGenerativeAI(config.ai.apiKey);
  const model = genAI.getGenerativeModel({
    model: config.ai.model,
    generationConfig: {
      temperature: config.ai.temperature,
      maxOutputTokens: config.ai.maxTokens,
    },
  });
  const allResults = new Map<string, RankingResult>();

  logger.info('開始批次新聞評分', { total: items.length, batchSize: BATCH_SIZE });

  for (let batchStart = 0; batchStart < items.length; batchStart += BATCH_SIZE) {
    const batchIndex = Math.floor(batchStart / BATCH_SIZE);
    const batch = items.slice(batchStart, batchStart + BATCH_SIZE);

    logger.debug('處理評分批次', {
      batchIndex,
      batchStart,
      batchEnd: batchStart + batch.length,
    });

    const batchResults = await processBatch(model, batch, batchIndex);

    for (const [id, result] of batchResults) {
      allResults.set(id, result);
    }

    // 批次間隔（最後一批不需要等待）
    if (batchStart + BATCH_SIZE < items.length) {
      await delay(BATCH_INTERVAL_MS);
    }
  }

  logger.info('批次新聞評分完成', { processedCount: allResults.size });
  return allResults;
}
