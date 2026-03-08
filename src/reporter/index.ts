import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import type { DailyReport, AnalyzedNewsItem, NewsCategory } from '../types';
import { formatTaipeiTime } from '../utils/time';
import { logger } from '../utils/logger';

// ─── 型別：加入 publishedAtFormatted 的擴充項目 ────────────────────────────
interface FormattedNewsItem extends AnalyzedNewsItem {
  publishedAtFormatted: string;
}

// ─── 型別：用於優先閱讀清單，含錨點連結 ─────────────────────────────────────
interface OverviewNewsItem extends FormattedNewsItem {
  detailLink: string; // 有 aiSummary 時為 '#story-{id}'，否則為原始 URL
}

// ─── Handlebars Helper 註冊 ────────────────────────────────────────────────

/**
 * 比較兩值是否相等
 */
Handlebars.registerHelper('eq', (a: unknown, b: unknown): boolean => a === b);

/**
 * 大於等於
 */
Handlebars.registerHelper('gte', (a: number, b: number): boolean => a >= b);

/**
 * 小於等於
 */
Handlebars.registerHelper('lte', (a: number, b: number): boolean => a <= b);

/**
 * 小於
 */
Handlebars.registerHelper('lt', (a: number, b: number): boolean => a < b);

/**
 * 邏輯 AND（用於數值範圍判斷）
 */
Handlebars.registerHelper('and', (a: boolean, b: boolean): boolean => a && b);

// ─── Handlebars Helper：1-based index ────────────────────────────────────
Handlebars.registerHelper('index_1', (index: number): number => index + 1);

// ─── 模板快取 ─────────────────────────────────────────────────────────────
let compiledTemplate: HandlebarsTemplateDelegate | null = null;
let compiledFullTemplate: HandlebarsTemplateDelegate | null = null;

/**
 * 載入並編譯 Handlebars 模板（首次呼叫後快取）
 */
function getCompiledTemplate(): HandlebarsTemplateDelegate {
  if (compiledTemplate !== null) {
    return compiledTemplate;
  }

  const templatePath = path.join(__dirname, 'templates', 'daily-report.hbs');
  const templateSource = fs.readFileSync(templatePath, 'utf-8');
  compiledTemplate = Handlebars.compile(templateSource);

  logger.debug('Handlebars 模板已編譯', { templatePath });
  return compiledTemplate;
}

/**
 * 載入並編譯完整報告模板（GitHub Pages 用）
 */
function getCompiledFullTemplate(): HandlebarsTemplateDelegate {
  if (compiledFullTemplate !== null) {
    return compiledFullTemplate;
  }

  const templatePath = path.join(__dirname, 'templates', 'full-report.hbs');
  const templateSource = fs.readFileSync(templatePath, 'utf-8');
  compiledFullTemplate = Handlebars.compile(templateSource);

  logger.debug('完整報告模板已編譯', { templatePath });
  return compiledFullTemplate;
}

// ─── 分類中文對照表 ───────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<NewsCategory, string> = {
  market: '市場行情',
  regulation: '監管政策',
  technology: '技術發展',
  defi: 'DeFi',
  nft: 'NFT',
  security: '安全事件',
  macro: '總體經濟',
  exchange: '交易所動態',
  other: '其他',
};

// ─── 格式化新聞項目（加入台北時間字串） ────────────────────────────────────
function formatItem(item: AnalyzedNewsItem): FormattedNewsItem {
  return {
    ...item,
    publishedAtFormatted: formatTaipeiTime(item.publishedAt),
  };
}

// ─── 格式化台北時間（Date -> HH:MM 字串，供模板時間窗顯示） ─────────────────
function formatDateTaipei(date: Date): string {
  const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
  const taipeiDate = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  const y = taipeiDate.getUTCFullYear();
  const mo = String(taipeiDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(taipeiDate.getUTCDate()).padStart(2, '0');
  const h = String(taipeiDate.getUTCHours()).padStart(2, '0');
  const min = String(taipeiDate.getUTCMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${min}`;
}

// ─── 主要函式：生成 HTML 報告 ──────────────────────────────────────────────

/**
 * 將 DailyReport 編譯為完整的 HTML Email 字串。
 *
 * @param report - 每日報告資料
 * @returns 完整 HTML 字串
 */
export function generateReport(report: DailyReport): string {
  const template = getCompiledTemplate();

  // 準備 topStories（重點分析區塊）：加入格式化時間
  const topStories: FormattedNewsItem[] = report.topStories.map(formatItem);

  // 準備 categorizedStories：只保留非空分類，並為每項加入格式化時間
  const allCategories = Object.keys(CATEGORY_LABELS) as NewsCategory[];
  const categorizedStories: Partial<Record<NewsCategory, FormattedNewsItem[]>> = {};

  for (const cat of allCategories) {
    const items = report.categorizedStories[cat];
    if (items && items.length > 0) {
      categorizedStories[cat] = items.map(formatItem);
    }
  }

  // 準備優先閱讀清單：所有新聞依重要度排序，含錨點連結
  const topStoryIds = new Set(report.topStories.map((s) => s.id));
  const allStoriesByImportance: OverviewNewsItem[] = (
    Object.values(report.categorizedStories) as AnalyzedNewsItem[][]
  )
    .flat()
    .sort((a, b) => b.importanceScore - a.importanceScore)
    .map((item) => ({
      ...formatItem(item),
      detailLink: topStoryIds.has(item.id) ? `#story-${item.id}` : item.url,
    }));

  // 組裝傳入模板的資料物件
  const templateData = {
    reportDate: report.reportDate,
    timeWindowFrom: formatDateTaipei(report.timeWindowFrom),
    timeWindowTo: formatDateTaipei(report.timeWindowTo),
    executiveSummary: report.executiveSummary,
    totalCollected: report.totalCollected,
    afterDedup: report.afterDedup,
    sourcesCount: report.sources.length,
    topStories,
    categorizedStories,
    allStoriesByImportance,
    mdReportUrl: report.mdReportUrl ?? '',
  };

  const html = template(templateData);

  logger.info('HTML 報告生成完成', {
    reportDate: report.reportDate,
    topStoriesCount: topStories.length,
    categoriesWithContent: Object.keys(categorizedStories).length,
  });

  return html;
}

// ─── 輔助函式：生成純文字版本 ──────────────────────────────────────────────

/**
 * 生成純文字版報告，作為 HTML Email 的備援（text part）。
 * 此函式同時供 mailer/index.ts 使用。
 *
 * @param report - 每日報告資料
 * @returns 純文字字串
 */
export function buildPlainText(report: DailyReport): string {
  const lines: string[] = [];

  // 標題
  lines.push(`加密貨幣日報 ${report.reportDate}`);
  lines.push('='.repeat(50));
  lines.push('');

  // 時間範圍
  lines.push(`資料時間：${formatDateTaipei(report.timeWindowFrom)} ～ ${formatDateTaipei(report.timeWindowTo)}（台北時間）`);
  lines.push('');

  // 市場總覽
  lines.push('【今日市場總覽】');
  lines.push(report.executiveSummary);
  lines.push('');

  // 今日頭條
  const topStories = report.topStories.slice(0, 5);
  if (topStories.length > 0) {
    lines.push('【今日頭條】');
    lines.push('-'.repeat(40));

    topStories.forEach((item, index) => {
      const categoryLabel = CATEGORY_LABELS[item.category] ?? item.category;
      const sentimentLabel =
        item.sentiment === 'positive' ? '正向' :
        item.sentiment === 'negative' ? '負向' : '中性';

      lines.push(`${index + 1}. [重要度 ${item.importanceScore}/10] [${categoryLabel}] [${sentimentLabel}]`);
      lines.push(`   ${item.title}`);
      lines.push(`   ${item.aiSummary}`);
      lines.push(`   來源：${item.sourceName}  時間：${formatTaipeiTime(item.publishedAt)}（台北）`);
      lines.push(`   連結：${item.url}`);
      lines.push('');
    });
  }

  // 分類新聞
  const allCategories = Object.keys(CATEGORY_LABELS) as NewsCategory[];
  let hasCategorized = false;

  for (const cat of allCategories) {
    const items = report.categorizedStories[cat];
    if (!items || items.length === 0) continue;

    if (!hasCategorized) {
      lines.push('【分類新聞】');
      lines.push('-'.repeat(40));
      hasCategorized = true;
    }

    lines.push(`\n# ${CATEGORY_LABELS[cat]}`);

    items.forEach((item) => {
      const sentimentLabel =
        item.sentiment === 'positive' ? '正向' :
        item.sentiment === 'negative' ? '負向' : '中性';

      lines.push(`  - ${item.title}`);
      lines.push(`    [${sentimentLabel}] ${item.sourceName} ${formatTaipeiTime(item.publishedAt)}`);
      lines.push(`    ${item.url}`);
    });
  }

  lines.push('');
  lines.push('-'.repeat(50));

  // 數據摘要
  lines.push(`本日收集 ${report.totalCollected} 則 | 去重後 ${report.afterDedup} 則 | 使用來源 ${report.sources.length} 個`);
  lines.push('');

  // 免責聲明
  lines.push('【免責聲明】');
  lines.push('本報告由 AI 自動生成，僅供參考，不構成投資建議。');
  lines.push('加密貨幣投資具有高度風險，請自行評估並謹慎決策。');

  return lines.join('\n');
}

// ─── 主要函式：生成完整報告 HTML（GitHub Pages 用）──────────────────────

/**
 * 生成完整報告頁面，用於 GitHub Pages 線上閱讀。
 * 與 Email 版不同，此版本聚焦於 AI 深度分析內容，
 * 每則新聞附有完整 AI 摘要，而非單純的連結清單。
 *
 * @param report - 每日報告資料
 * @returns 完整 HTML 字串
 */
export function generateFullReport(report: DailyReport): string {
  const template = getCompiledFullTemplate();

  const topStories = report.topStories.map((item) => ({
    ...formatItem(item),
    '@index_1': 0, // placeholder, handled by helper
  }));

  const templateData = {
    reportDate: report.reportDate,
    timeWindowFrom: formatDateTaipei(report.timeWindowFrom),
    timeWindowTo: formatDateTaipei(report.timeWindowTo),
    executiveSummary: report.executiveSummary,
    totalCollected: report.totalCollected,
    afterDedup: report.afterDedup,
    topStoriesCount: topStories.length,
    topStories,
    sourcesText: report.sources.join('、'),
  };

  const html = template(templateData);

  logger.info('完整報告頁面生成完成', {
    reportDate: report.reportDate,
    topStoriesCount: topStories.length,
  });

  return html;
}
