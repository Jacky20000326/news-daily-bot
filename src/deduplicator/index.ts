import { TfIdf } from 'natural';
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

// ─── 標題向量工具 ─────────────────────────────────────────────────────────────

interface TfIdfTerm {
  term: string;
  tfidf: number;
}

/**
 * 利用 TfIdf 取得文件的詞頻向量（Map<term, tfidf>）
 */
function getDocumentVector(tfidf: TfIdf, docIndex: number): Map<string, number> {
  const vector = new Map<string, number>();
  const terms = tfidf.listTerms(docIndex) as TfIdfTerm[];
  for (const { term, tfidf: score } of terms) {
    vector.set(term, score);
  }
  return vector;
}

/**
 * 計算兩個 TF-IDF 向量的 Cosine Similarity
 */
function cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, scoreA] of vecA) {
    const scoreB = vecB.get(term) ?? 0;
    dotProduct += scoreA * scoreB;
    normA += scoreA * scoreA;
  }

  for (const [, scoreB] of vecB) {
    normB += scoreB * scoreB;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
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
 * 第二階段：依標題 TF-IDF Cosine Similarity 去重
 * 相似度 > 0.85 視為重複，保留 publishedAt 最早的那筆
 * 批次大小：50 筆一批（避免 TF-IDF 矩陣過大）
 */
export function deduplicateByTitle(items: NewsItem[]): NewsItem[] {
  const BATCH_SIZE = 50;
  const SIMILARITY_THRESHOLD = 0.85;

  // 保存最終保留的項目（跨批次去重需全域比對已保留的標題）
  const keptItems: NewsItem[] = [];

  for (let batchStart = 0; batchStart < items.length; batchStart += BATCH_SIZE) {
    const batch = items.slice(batchStart, batchStart + BATCH_SIZE);

    // 與已保留的項目合併建立 TF-IDF 模型（讓跨批次相似度計算一致）
    const allForTfidf = [...keptItems, ...batch];

    const tfidf = new TfIdf();
    for (const item of allForTfidf) {
      tfidf.addDocument(item.title.toLowerCase());
    }

    // keptItems 對應的向量索引為 0 .. keptItems.length-1
    // batch 中每筆對應索引為 initialKeptCount + i
    // 注意：必須在內層迴圈前固定此值，因 keptItems 在迴圈中會動態增長
    const initialKeptCount = keptItems.length;
    const keptVectors: Map<string, number>[] = keptItems.map((_, idx) =>
      getDocumentVector(tfidf, idx)
    );

    for (let i = 0; i < batch.length; i++) {
      const candidate = batch[i];
      const candidateIdx = initialKeptCount + i;
      const candidateVec = getDocumentVector(tfidf, candidateIdx);

      let isDuplicate = false;

      // 與所有已保留項目比較相似度
      for (let j = 0; j < keptItems.length; j++) {
        const similarity = cosineSimilarity(candidateVec, keptVectors[j]);
        if (similarity > SIMILARITY_THRESHOLD) {
          // 相似度超過閾值：保留 publishedAt 較早的那筆
          const existingItem = keptItems[j];
          if (candidate.publishedAt < existingItem.publishedAt) {
            // 候選項目更早發布，取代已保留的
            keptItems[j] = candidate;
            keptVectors[j] = candidateVec;
          }
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        keptItems.push(candidate);
        keptVectors.push(candidateVec);
      }
    }
  }

  logger.debug('標題相似度去重完成', { before: items.length, after: keptItems.length });
  return keptItems;
}

// ─── 主要匯出函式 ─────────────────────────────────────────────────────────────

export interface DeduplicateResult {
  items: NewsItem[];
  removedByUrl: number;
  removedByTitle: number;
}

/**
 * 兩階段去重：先 URL 去重，再標題相似度去重
 */
export function deduplicate(items: NewsItem[]): DeduplicateResult {
  logger.info('開始去重處理', { total: items.length });

  const afterUrl = deduplicateByUrl(items);
  const removedByUrl = items.length - afterUrl.length;

  const afterTitle = deduplicateByTitle(afterUrl);
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
