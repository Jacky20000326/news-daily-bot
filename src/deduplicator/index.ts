import { pipeline, FeatureExtractionPipeline } from '@huggingface/transformers';
import { NewsItem } from '../types';
import { logger } from '../utils/logger';

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
 * 第二階段：依標題語義相似度去重
 * 使用 Transformer embedding 計算 cosine similarity
 * 相似度 > 0.80 視為重複，保留 publishedAt 最早的那筆
 */
export async function deduplicateByTitle(items: NewsItem[]): Promise<NewsItem[]> {
  const SIMILARITY_THRESHOLD = 0.80;

  if (items.length <= 1) return [...items];

  // 一次性計算所有標題的 embedding
  const titles = items.map((item) => item.title);
  const embeddings = await computeEmbeddings(titles);

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

// ─── 主要匯出函式 ─────────────────────────────────────────────────────────────

export interface DeduplicateResult {
  items: NewsItem[];
  removedByUrl: number;
  removedByTitle: number;
}

/**
 * 兩階段去重：先 URL 去重，再標題語義去重
 */
export async function deduplicate(items: NewsItem[]): Promise<DeduplicateResult> {
  logger.info('開始去重處理', { total: items.length });

  const afterUrl = deduplicateByUrl(items);
  const removedByUrl = items.length - afterUrl.length;

  const afterTitle = await deduplicateByTitle(afterUrl);
  const removedByTitle = afterUrl.length - afterTitle.length;

  logger.info('去重處理完成', {
    originalCount: items.length,
    removedByUrl,
    removedByTitle,
    finalCount: afterTitle.length,
  });

  return {
    items: afterTitle,
    removedByUrl,
    removedByTitle,
  };
}
