import { NewsItem, AnalyzedNewsItem } from '../types';
import { logger } from '../utils/logger';
import { rankAndClassify } from './ranker';
import { summarizeItems, generateExecutiveSummary as generateExecSummary } from './summarizer';
import { deepAnalyzeItems } from './deep-analyzer';

// ─── 常數 ─────────────────────────────────────────────────────────────────────

/** 保留的精選新聞數量 */
const TOP_ITEMS_TO_KEEP = 10;

/** 進行深度分析的前 N 名新聞 */
const TOP_ITEMS_FOR_DEEP = 6;

// ─── 主要分析函式 ─────────────────────────────────────────────────────────────

/**
 * 分析新聞：評分、分類、生成摘要
 *
 * 步驟：
 * 1. 呼叫 rankAndClassify（全部 items）
 * 2. 對前 15 筆（依 importanceScore 排序）並行呼叫 summarizeItem
 * 3. 合併結果，對未排到的項目設 aiSummary = ''
 * 4. 回傳 AnalyzedNewsItem[]（依 importanceScore 降序）
 */
export async function analyze(items: NewsItem[]): Promise<AnalyzedNewsItem[]> {
  if (items.length === 0) {
    logger.info('無新聞待分析，回傳空陣列');
    return [];
  }

  logger.info('開始新聞 AI 分析', { total: items.length });

  // ── 步驟 1：批次評分與分類 ──
  const rankingMap = await rankAndClassify(items);

  // ── 步驟 2：依評分排序，取前 15 筆生成摘要 ──
  // 先建立附帶評分的暫時結構，方便排序
  const rankedItems = items.map((item) => {
    const ranking = rankingMap.get(item.id) ?? {
      importanceScore: 5,
      category: 'other' as const,
      relatedTickers: [],
      sentiment: 'neutral' as const,
    };
    return { item, ranking };
  });

  // 依 importanceScore 降序排序（相同分數保持原始順序）
  rankedItems.sort((a, b) => b.ranking.importanceScore - a.ranking.importanceScore);

  // ── 步驟 2.5：截斷至前 TOP_ITEMS_TO_KEEP 名（丟棄其餘低分新聞）──
  const keptItems = rankedItems.slice(0, TOP_ITEMS_TO_KEEP);

  logger.info('開始生成精選新聞摘要', {
    kept: keptItems.length,
    discarded: rankedItems.length - keptItems.length,
    topScores: keptItems.map((r) => r.ranking.importanceScore),
  });

  const summaries = await summarizeItems(keptItems.map((r) => r.item));

  // ── 步驟 3：合併結果 ──
  // 建立 id -> aiSummary 的對照表
  const summaryMap = new Map<string, string>();
  for (let i = 0; i < keptItems.length; i++) {
    summaryMap.set(keptItems[i].item.id, summaries[i] ?? '');
  }

  // 組合最終的 AnalyzedNewsItem 陣列（僅保留精選的 TOP_ITEMS_TO_KEEP 筆）
  const analyzedItems: AnalyzedNewsItem[] = keptItems.map(({ item, ranking }) => ({
    ...item,
    importanceScore: ranking.importanceScore,
    category: ranking.category,
    relatedTickers: ranking.relatedTickers,
    sentiment: ranking.sentiment,
    aiSummary: summaryMap.get(item.id) ?? '',
  }));

  // ── 步驟 4：對前 6 筆重點新聞進行深度分析（抓取原文 + AI 分析）──
  const topItemsForDeep = analyzedItems.slice(0, TOP_ITEMS_FOR_DEEP);
  logger.info('開始重點新聞深度分析（抓取原文）', {
    count: topItemsForDeep.length,
  });

  const deepAnalysisMap = await deepAnalyzeItems(topItemsForDeep);

  // 將深度分析結果寫入對應項目
  for (const item of analyzedItems) {
    const deep = deepAnalysisMap.get(item.id);
    if (deep) {
      item.deepAnalysis = deep;
    }
  }

  logger.info('新聞 AI 分析完成', {
    total: analyzedItems.length,
    withSummary: analyzedItems.filter((i) => i.aiSummary.length > 0).length,
    withDeepAnalysis: analyzedItems.filter((i) => i.deepAnalysis && i.deepAnalysis.length > 0).length,
    topScore: analyzedItems[0]?.importanceScore ?? 0,
  });

  return analyzedItems;
}

// ─── 執行摘要（重新匯出）────────────────────────────────────────────────────────

/**
 * 依據分析後的前幾名新聞生成「今日市場總覽」
 * 直接代理至 summarizer 的實作
 */
export async function generateExecutiveSummary(
  topItems: AnalyzedNewsItem[]
): Promise<string> {
  return generateExecSummary(topItems);
}
