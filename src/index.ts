import type { DailyReport, NewsCategory, AnalyzedNewsItem } from "./types";
import { config } from "./config";
import { logger } from "./utils/logger";
import { getReportTimeWindow, getReportDateString } from "./utils/time";
import { collect } from "./collector";
import { normalize } from "./normalizer";
import { deduplicate } from "./deduplicator";
import { analyze, generateExecutiveSummary } from "./analyzer";
import { generateReport } from "./reporter";
import { sendReport, sendAlertEmail } from "./mailer";

// ─── 所有 NewsCategory 值（確保 categorizedStories 含全部 9 個 key） ────────
const ALL_CATEGORIES: NewsCategory[] = [
  "market",
  "regulation",
  "technology",
  "defi",
  "nft",
  "security",
  "macro",
  "exchange",
  "other",
];

// ─── 主要流程 ──────────────────────────────────────────────────────────────────

/**
 * 執行每日加密貨幣報告完整流程：
 * 收集 → 標準化 → 去重 → AI 分析 → 產生報告 → 發送 Email
 *
 * @returns 完整的 DailyReport 物件
 */
export async function runDailyPipeline(): Promise<DailyReport> {
  const pipelineStart = Date.now();

  logger.info("每日報告流程開始");

  // ── 步驟 1：取得時間窗 ──
  const timeWindow = getReportTimeWindow();
  logger.info("報告時間窗確認", {
    from: timeWindow.from.toISOString(),
    to: timeWindow.to.toISOString(),
  });

  // ── 步驟 2：收集原始新聞 ──
  const rawItems = await collect(timeWindow);
  logger.info("收集完成", { rawCount: rawItems.length });

  // ── 步驟 3：標準化 ──
  const normalizedItems = normalize(rawItems, timeWindow);
  logger.info("標準化完成", { normalizedCount: normalizedItems.length });

  // ── 步驟 4：去重 ──
  const dedupResult = deduplicate(normalizedItems);
  logger.info("去重完成", {
    dedupedCount: dedupResult.items.length,
    removedByUrl: dedupResult.removedByUrl,
    removedByTitle: dedupResult.removedByTitle,
  });

  // ── 步驟 5：AI 分析 ──
  const analyzedItems = await analyze(dedupResult.items);
  logger.info("AI 分析完成", { analyzedCount: analyzedItems.length });

  // ── 步驟 6：建立 topStories（重要度前 15，與 AI 摘要數量一致） ──
  const topStories = analyzedItems.slice(0, 15);

  // ── 步驟 7：依 category 分組（所有 9 個分類都必須有 key，空分類為空陣列） ──
  const categorizedStories = ALL_CATEGORIES.reduce<
    Record<NewsCategory, AnalyzedNewsItem[]>
  >(
    (acc, cat) => {
      acc[cat] = analyzedItems.filter((item) => item.category === cat);
      return acc;
    },
    {} as Record<NewsCategory, AnalyzedNewsItem[]>,
  );

  // ── 步驟 8：生成執行摘要 ──
  const executiveSummary = await generateExecutiveSummary(topStories);

  // ── 步驟 9：取不重複的來源名稱清單 ──
  const sources = [...new Set(analyzedItems.map((item) => item.sourceName))];

  // ── 步驟 10：組裝 DailyReport ──
  const report: DailyReport = {
    reportDate: getReportDateString(),
    generatedAt: new Date(),
    timeWindowFrom: timeWindow.from,
    timeWindowTo: timeWindow.to,
    totalCollected: rawItems.length,
    afterDedup: dedupResult.items.length,
    topStories,
    categorizedStories,
    executiveSummary,
    sources,
  };

  // ── 步驟 11：產生 HTML 報告 ──
  const html = generateReport(report);

  // ── 步驟 12：發送（或 dryRun 跳過） ──
  if (config.app.dryRun) {
    logger.info("dryRun 模式：跳過 Email 發送", {
      reportDate: report.reportDate,
    });
  } else {
    await sendReport(report, html);
  }

  // ── 步驟 13：記錄整體耗時 ──
  const durationMs = Date.now() - pipelineStart;
  logger.info("每日報告流程完成", {
    reportDate: report.reportDate,
    totalCollected: report.totalCollected,
    afterDedup: report.afterDedup,
    topStoriesCount: report.topStories.length,
    duration_ms: durationMs,
  });

  return report;
}

// ─── 全域錯誤邊界 ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    await runDailyPipeline();
  } catch (err) {
    logger.error("每日報告流程失敗", { err: String(err) });
    await sendAlertEmail(err);
    process.exit(1);
  }
}

// 直接執行時（node dist/index.js 或 ts-node src/index.ts）才呼叫 main()
if (require.main === module) {
  main();
}
