import type { DailyReport } from '../types';

/**
 * Podcast 內容優先級規則
 *
 * 優先級結構：
 * 1. 執行摘要（市場總覽）- 作為開場背景
 * 2. 前 6 則新聞（重點分析）- 主要內容，含深度分析
 * 3. 第 7-10 則新聞（次要新聞）- 簡要提及
 */

export interface NarrationConfig {
  // 主要內容
  primaryNewsCount: number;        // 前N則為主要內容（含深度分析）
  includeDeepAnalysis: boolean;    // 是否包含深度分析

  // 次要內容
  secondaryNewsCount: number;      // 次N則為次要內容（簡要提及）
  secondaryDetailLevel: 'brief' | 'summary' | 'minimal';

  // 執行摘要
  includeExecutiveSummary: boolean;
  executiveSummaryPosition: 'start' | 'end';
}

/** 默認配置：重點新聞深度分析 + 市場總覽 */
export const DEFAULT_NARRATION_CONFIG: NarrationConfig = {
  primaryNewsCount: 6,              // 前 6 則新聞為主要內容
  includeDeepAnalysis: true,        // 包含深度分析
  secondaryNewsCount: 4,            // 第 7-10 則為次要內容
  secondaryDetailLevel: 'brief',    // 簡要提及
  includeExecutiveSummary: true,    // 包含市場總覽
  executiveSummaryPosition: 'start', // 開場背景
};

/** 簡潔版配置：只強調前6則主要新聞 */
export const BRIEF_CONFIG: NarrationConfig = {
  primaryNewsCount: 6,
  includeDeepAnalysis: true,
  secondaryNewsCount: 0,            // 不包含次要新聞
  secondaryDetailLevel: 'minimal',
  includeExecutiveSummary: true,
  executiveSummaryPosition: 'start',
};

/** 完整版配置：包含所有新聞 */
export const FULL_CONFIG: NarrationConfig = {
  primaryNewsCount: 6,
  includeDeepAnalysis: true,
  secondaryNewsCount: 4,
  secondaryDetailLevel: 'summary',  // 較詳細的次要內容
  includeExecutiveSummary: true,
  executiveSummaryPosition: 'start',
};

// ─── 分段構建函數 ───────────────────────────────────────────────────────────

/**
 * 根據規則構建 Podcast 敘述段落
 *
 * 結構：
 * 1. 開場 + 市場總覽（如有）
 * 2. 主要新聞（含深度分析）
 * 3. 次要新聞（簡要）
 * 4. 結語
 */
export function buildNarrationSegmentsWithRules(
  report: DailyReport,
  config: NarrationConfig = DEFAULT_NARRATION_CONFIG
): string[] {
  const segments: string[] = [];

  // ─── 開場 ────────────────────────────────────────────────────────────

  let intro = `加密貨幣日報，${report.reportDate}。\n`;

  if (config.includeExecutiveSummary && config.executiveSummaryPosition === 'start') {
    intro += `今日市場總覽。\n${report.executiveSummary}`;
  }

  segments.push(intro);

  // ─── 主要新聞（前 N 則，含深度分析） ──────────────────────────────────

  const primaryStories = report.topStories.slice(0, config.primaryNewsCount);

  segments.push('重點分析。');

  primaryStories.forEach((story, i) => {
    const parts: string[] = [];

    // 標題和基本信息
    parts.push(`第${i + 1}則。${story.title}。`);

    // AI 摘要
    if (story.aiSummary) {
      parts.push(story.aiSummary);
    }

    // 深度分析（如啟用）
    if (config.includeDeepAnalysis && story.deepAnalysis) {
      const cleaned = story.deepAnalysis.replace(/\*\*(.+?)\*\*/g, '$1');
      parts.push(`深度分析：${cleaned}`);
    }

    segments.push(parts.join('\n'));
  });

  // ─── 次要新聞（後 N 則，簡要） ────────────────────────────────────

  const secondaryStories = report.topStories.slice(
    config.primaryNewsCount,
    config.primaryNewsCount + config.secondaryNewsCount
  );

  if (secondaryStories.length > 0) {
    segments.push('其他重要新聞簡覽。');

    secondaryStories.forEach((story) => {
      let secondaryText = '';

      switch (config.secondaryDetailLevel) {
        case 'brief':
          // 只提及標題
          secondaryText = `${story.title}。`;
          break;

        case 'summary':
          // 標題 + 摘要
          secondaryText = `${story.title}。${story.aiSummary || story.content.substring(0, 100)}`;
          break;

        case 'minimal':
          // 超短版本
          secondaryText = `${story.title.substring(0, 50)}...`;
          break;
      }

      segments.push(secondaryText);
    });
  }

  // ─── 結語 ────────────────────────────────────────────────────────────

  if (config.includeExecutiveSummary && config.executiveSummaryPosition === 'end') {
    segments.push(`市場展望。${report.executiveSummary}`);
  }

  segments.push('以上為今日加密貨幣日報主要內容，感謝收聽。');

  return segments;
}

// ─── 簡潔版：只構建主要新聞 ────────────────────────────────────────────────────

/**
 * 構建簡潔版 Podcast（僅主要新聞）
 * 適用於時間有限的快速更新
 */
export function buildBriefNarration(report: DailyReport): string[] {
  return buildNarrationSegmentsWithRules(report, BRIEF_CONFIG);
}

// ─── 優先級分析 ──────────────────────────────────────────────────────────

/**
 * 分析報告中的新聞優先級
 */
export function analyzeNewsPriority(report: DailyReport) {
  const config = DEFAULT_NARRATION_CONFIG;

  const primaryCount = Math.min(config.primaryNewsCount, report.topStories.length);
  const secondaryCount = Math.min(
    config.secondaryNewsCount,
    report.topStories.length - primaryCount
  );

  return {
    配置: 'DEFAULT_NARRATION_CONFIG',
    主要新聞數量: primaryCount,
    主要新聞標題: report.topStories
      .slice(0, primaryCount)
      .map((s, i) => `${i + 1}. ${s.title.substring(0, 50)}...`),
    次要新聞數量: secondaryCount,
    次要新聞標題: report.topStories
      .slice(primaryCount, primaryCount + secondaryCount)
      .map((s) => `• ${s.title.substring(0, 40)}...`),
    市場總覽: `${report.executiveSummary.substring(0, 100)}...`,
    預計播報時長: `${Math.ceil((primaryCount * 2 + secondaryCount * 0.5 + 1) * 60)} 秒`,
  };
}

// ─── 內容統計 ────────────────────────────────────────────────────────────

/**
 * 統計 Podcast 內容長度
 */
export function estimateNarrationLength(
  report: DailyReport,
  config: NarrationConfig = DEFAULT_NARRATION_CONFIG
): {
  totalCharacters: number;
  totalWords: number;
  estimatedDurationSeconds: number;
  estimatedDurationMinutes: string;
} {
  const segments = buildNarrationSegmentsWithRules(report, config);
  const fullText = segments.join('\n');

  // 計算字符數
  const totalCharacters = fullText.length;

  // 計算詞數（簡化：中文以字計，英文以詞計）
  const chineseChars = (fullText.match(/[\u4E00-\u9FFF]/g) || []).length;
  const englishWords = (fullText.match(/\b\w+\b/g) || []).length;
  const totalWords = chineseChars + englishWords;

  // 估算播報時間（中文：每秒3字，英文：每秒3詞）
  const chineseDuration = chineseChars / 3;
  const englishDuration = englishWords / 3;
  const estimatedDurationSeconds = Math.ceil(chineseDuration + englishDuration);
  const estimatedDurationMinutes = (estimatedDurationSeconds / 60).toFixed(1);

  return {
    totalCharacters,
    totalWords,
    estimatedDurationSeconds,
    estimatedDurationMinutes,
  };
}
