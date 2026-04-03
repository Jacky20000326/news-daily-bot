import { pipeline, FeatureExtractionPipeline } from '@huggingface/transformers';
import { NewsItem } from '../types';
import { logger } from '../utils/logger';
import { getHistoryTexts } from './history';

// ─── URL 正規化 ──────────────────────────────────────────────────────────────

/**
 * 正規化 URL：
 * 1. 轉換 scheme + host 為小寫
 * 2. 移除 UTM 參數（utm_source, utm_medium, utm_campaign 等）
 * 3. 移除其他追蹤參數（fbclid, gclid 等）
 * 4. 移除尾端斜線
 */
function normalizeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    // 無效 URL 直接回傳小寫原始值
    return rawUrl.toLowerCase().replace(/\/$/, '');
  }

  // scheme + host 強制小寫
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  // 移除追蹤用查詢參數
  const TRACKING_PARAMS = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'utm_id',
    'fbclid',
    'gclid',
    'ref',
    'referrer',
    'source',
  ];

  for (const param of TRACKING_PARAMS) {
    url.searchParams.delete(param);
  }

  // 移除尾端斜線（pathname 層級）
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';

  return url.toString().replace(/\/$/, '');
}

// ─── Embedding 模型管理 ─────────────────────────────────────────────────────

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * 取得或初始化 feature extraction pipeline（單例）
 */
function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    logger.info('載入語義模型', { model: MODEL_NAME });
    extractorPromise = pipeline('feature-extraction', MODEL_NAME, {
      dtype: 'fp32',
    });
  }
  return extractorPromise;
}

/**
 * 計算文字陣列的 embedding 向量
 * 回傳二維陣列 [n][dim]
 */
async function computeEmbeddings(texts: string[]): Promise<number[][]> {
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  return output.tolist() as number[][];
}

/**
 * 計算兩個已正規化向量的 Cosine Similarity
 * （normalize: true 後向量已是單位向量，dot product 即為 cosine similarity）
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
  }
  return dot;
}

// ─── 去重函式 ─────────────────────────────────────────────────────────────────

/**
 * 第一階段：依 URL 精確去重
 * 正規化後的 URL 相同視為重複，保留第一筆
 */
export function deduplicateByUrl(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const result: NewsItem[] = [];

  for (const item of items) {
    const normalized = normalizeUrl(item.url);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(item);
    }
  }

  logger.debug('URL 去重完成', { before: items.length, after: result.length });
  return result;
}

/**
 * 將新聞項目轉為語義比較用的文字
 * 結合標題與內容前 300 字，提供更豐富的語義資訊
 */
function buildSemanticText(item: NewsItem): string {
  const contentSnippet = item.content.slice(0, 300).trim();
  return contentSnippet ? `${item.title} | ${contentSnippet}` : item.title;
}

/**
 * 第二階段：依語義相似度去重
 * 使用 Transformer embedding 計算 cosine similarity
 * 結合標題與內容摘要進行比較，相似度 > 0.72 視為重複，保留 publishedAt 最早的那筆
 */
export async function deduplicateByTitle(items: NewsItem[]): Promise<NewsItem[]> {
  const SIMILARITY_THRESHOLD = 0.72;

  if (items.length <= 1) return [...items];

  // 一次性計算所有項目的 embedding（標題 + 內容摘要）
  const texts = items.map((item) => buildSemanticText(item));
  const embeddings = await computeEmbeddings(texts);

  // 貪心去重：依序比較每筆與已保留項目的相似度
  const keptIndices: number[] = [0];

  for (let i = 1; i < items.length; i++) {
    let isDuplicate = false;

    for (let j = 0; j < keptIndices.length; j++) {
      const keptIdx = keptIndices[j];
      const similarity = cosineSimilarity(embeddings[i], embeddings[keptIdx]);

      if (similarity > SIMILARITY_THRESHOLD) {
        // 保留 publishedAt 較早的那筆
        if (items[i].publishedAt < items[keptIdx].publishedAt) {
          keptIndices[j] = i;
        }
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      keptIndices.push(i);
    }
  }

  const result = keptIndices.map((idx) => items[idx]);
  logger.debug('標題語義去重完成', { before: items.length, after: result.length });
  return result;
}

// ─── 跨日去重 ────────────────────────────────────────────────────────────────

/**
 * 第三階段：依歷史記錄去重（跨日）
 * 將今日新聞與過去 7 天已報導的新聞比較
 * 相似度 > HISTORY_THRESHOLD 視為重複，直接移除
 */
export async function deduplicateByHistory(items: NewsItem[]): Promise<NewsItem[]> {
  const HISTORY_THRESHOLD = 0.70;

  const historyTexts = getHistoryTexts();
  if (historyTexts.length === 0 || items.length === 0) return [...items];

  // 組合歷史記錄的語義文字
  const historySemanticTexts = historyTexts.map((h) =>
    h.contentSnippet ? `${h.title} | ${h.contentSnippet}` : h.title,
  );

  // 組合今日新聞的語義文字
  const todaySemanticTexts = items.map((item) => buildSemanticText(item));

  // 一次性計算所有 embedding
  const allTexts = [...historySemanticTexts, ...todaySemanticTexts];
  const allEmbeddings = await computeEmbeddings(allTexts);

  const historyEmbeddings = allEmbeddings.slice(0, historySemanticTexts.length);
  const todayEmbeddings = allEmbeddings.slice(historySemanticTexts.length);

  const result: NewsItem[] = [];

  for (let i = 0; i < items.length; i++) {
    let isDuplicate = false;

    for (let j = 0; j < historyEmbeddings.length; j++) {
      const similarity = cosineSimilarity(todayEmbeddings[i], historyEmbeddings[j]);
      if (similarity > HISTORY_THRESHOLD) {
        logger.debug('跨日重複偵測', {
          todayTitle: items[i].title,
          historyTitle: historyTexts[j].title,
          similarity: similarity.toFixed(4),
        });
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      result.push(items[i]);
    }
  }

  logger.debug('跨日去重完成', { before: items.length, after: result.length });
  return result;
}

// ─── 主要匯出函式 ─────────────────────────────────────────────────────────────

export interface DeduplicateResult {
  items: NewsItem[];
  removedByUrl: number;
  removedByTitle: number;
  removedByHistory: number;
}

/**
 * 三階段去重：URL 去重 → 當日語義去重 → 跨日歷史去重
 */
export async function deduplicate(items: NewsItem[]): Promise<DeduplicateResult> {
  logger.info('開始去重處理', { total: items.length });

  // 第一階段：URL 精確去重
  const afterUrl = deduplicateByUrl(items);
  const removedByUrl = items.length - afterUrl.length;

  // 第二階段：當日語義去重
  const afterTitle = await deduplicateByTitle(afterUrl);
  const removedByTitle = afterUrl.length - afterTitle.length;

  // 第三階段：跨日歷史去重
  const afterHistory = await deduplicateByHistory(afterTitle);
  const removedByHistory = afterTitle.length - afterHistory.length;

  logger.info('去重處理完成', {
    originalCount: items.length,
    removedByUrl,
    removedByTitle,
    removedByHistory,
    finalCount: afterHistory.length,
  });

  return {
    items: afterHistory,
    removedByUrl,
    removedByTitle,
    removedByHistory,
  };
}
