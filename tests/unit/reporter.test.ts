// 環境變數設定（必須在所有 src import 之前）
process.env.GEMINI_API_KEY = 'test-key';
process.env.NEWSAPI_KEY = 'test-key';
process.env.SENDER_EMAIL = 'test@example.com';
process.env.EMAIL_RECIPIENTS = 'test@example.com';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'test-pass';

import { describe, it, expect } from 'vitest';
import { generateReport, buildPlainText } from '../../src/reporter/index';
import { mockAnalyzedItem } from '../helpers/mocks';
import type { DailyReport, AnalyzedNewsItem, NewsCategory } from '../../src/types';

// ─── 輔助函式：建立所有分類皆有 key 的空分類記錄 ──────────────────────────
const ALL_CATEGORIES: NewsCategory[] = [
  'market', 'regulation', 'technology', 'defi', 'nft',
  'security', 'macro', 'exchange', 'other',
];

/**
 * 建立完整的 categorizedStories 物件，確保所有 9 個分類都有 key
 */
function buildEmptyCategorizedStories(): Record<NewsCategory, AnalyzedNewsItem[]> {
  const result = {} as Record<NewsCategory, AnalyzedNewsItem[]>;
  for (const cat of ALL_CATEGORIES) {
    result[cat] = [];
  }
  return result;
}

/**
 * 建立測試用的 DailyReport，可透過 overrides 覆寫任何欄位
 */
function buildMockReport(overrides?: Partial<DailyReport>): DailyReport {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 預設建立兩筆 topStories
  const topStory1 = mockAnalyzedItem({
    id: 'story001',
    title: 'Bitcoin 突破十萬美元大關',
    importanceScore: 9,
    category: 'market',
    aiSummary: '比特幣在機構資金持續湧入下突破十萬美元，創下歷史新高。',
    sentiment: 'positive',
  });

  const topStory2 = mockAnalyzedItem({
    id: 'story002',
    title: 'SEC 通過新加密貨幣監管框架',
    importanceScore: 8,
    category: 'regulation',
    aiSummary: '美國 SEC 正式通過新監管框架，為加密貨幣市場提供更清晰的法規指引。',
    sentiment: 'neutral',
  });

  // 預設 categorizedStories 含 market 和 regulation 分類資料
  const categorizedStories = buildEmptyCategorizedStories();
  categorizedStories.market = [topStory1];
  categorizedStories.regulation = [topStory2];

  return {
    reportDate: '2026-03-07',
    generatedAt: now,
    timeWindowFrom: from,
    timeWindowTo: now,
    totalCollected: 120,
    afterDedup: 85,
    topStories: [topStory1, topStory2],
    categorizedStories,
    executiveSummary: '今日加密貨幣市場表現強勁，比特幣突破歷史新高，監管政策逐步明朗化。',
    sources: ['newsapi', 'cryptopanic', 'rss'],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// generateReport() 測試
// ═══════════════════════════════════════════════════════════════════════════
describe('generateReport()', () => {
  it('回傳的 HTML 包含 <!DOCTYPE html> 開頭', () => {
    const report = buildMockReport();
    const html = generateReport(report);
    expect(html.trimStart().startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('HTML 包含報告日期', () => {
    const report = buildMockReport({ reportDate: '2026-03-07' });
    const html = generateReport(report);
    expect(html).toContain('2026-03-07');
  });

  it('HTML 包含 executiveSummary 內容', () => {
    const summary = '今日加密貨幣市場表現強勁，比特幣突破歷史新高，監管政策逐步明朗化。';
    const report = buildMockReport({ executiveSummary: summary });
    const html = generateReport(report);
    expect(html).toContain(summary);
  });

  it('HTML 包含 topStories 的標題', () => {
    const report = buildMockReport();
    const html = generateReport(report);
    // 驗證兩筆 topStories 的標題都出現在 HTML 中
    expect(html).toContain('Bitcoin 突破十萬美元大關');
    expect(html).toContain('SEC 通過新加密貨幣監管框架');
  });

  it('HTML 包含分類新聞區塊（market 分類有內容時出現「市場行情」）', () => {
    const report = buildMockReport();
    const html = generateReport(report);
    // 模板中 market 分類的標題文字為「市場行情」
    expect(html).toContain('市場行情');
  });

  it('HTML 包含 story-{id} 錨點（供優先清單連結跳轉）', () => {
    const report = buildMockReport();
    const html = generateReport(report);
    // 重點分析區塊中每個 topStory 有 id="story-{id}" 錨點
    expect(html).toContain('id="story-story001"');
    expect(html).toContain('id="story-story002"');
  });

  it('有 mdReportUrl 時 HTML 包含該連結', () => {
    const mdUrl = 'https://gist.github.com/user/abc123';
    const report = buildMockReport({ mdReportUrl: mdUrl });
    const html = generateReport(report);
    expect(html).toContain(mdUrl);
    // 模板中按鈕文字包含「線上 MD 報告」
    expect(html).toContain('線上 MD 報告');
  });

  it('沒有 mdReportUrl 時 HTML 不包含「線上 MD 報告」按鈕', () => {
    const report = buildMockReport({ mdReportUrl: undefined });
    const html = generateReport(report);
    expect(html).not.toContain('線上 MD 報告');
  });

  it('HTML 包含數據摘要（totalCollected、afterDedup）', () => {
    const report = buildMockReport({ totalCollected: 150, afterDedup: 90 });
    const html = generateReport(report);
    // 模板中數據摘要區塊直接輸出數字
    expect(html).toContain('150');
    expect(html).toContain('90');
  });

  it('topStories 為空時仍能正確生成 HTML（不拋出錯誤）', () => {
    const categorizedStories = buildEmptyCategorizedStories();
    const report = buildMockReport({
      topStories: [],
      categorizedStories,
    });
    // 不拋出錯誤
    expect(() => generateReport(report)).not.toThrow();
    const html = generateReport(report);
    // 仍然是合法的 HTML
    expect(html.trimStart().startsWith('<!DOCTYPE html>')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildPlainText() 測試
// ═══════════════════════════════════════════════════════════════════════════
describe('buildPlainText()', () => {
  it('回傳的文字包含報告日期', () => {
    const report = buildMockReport({ reportDate: '2026-03-07' });
    const text = buildPlainText(report);
    expect(text).toContain('2026-03-07');
  });

  it('包含 executiveSummary', () => {
    const summary = '今日加密貨幣市場表現強勁，比特幣突破歷史新高，監管政策逐步明朗化。';
    const report = buildMockReport({ executiveSummary: summary });
    const text = buildPlainText(report);
    expect(text).toContain(summary);
  });

  it('包含 topStories 標題', () => {
    const report = buildMockReport();
    const text = buildPlainText(report);
    expect(text).toContain('Bitcoin 突破十萬美元大關');
    expect(text).toContain('SEC 通過新加密貨幣監管框架');
  });

  it('包含來源資訊', () => {
    const report = buildMockReport({ sources: ['newsapi', 'cryptopanic', 'rss'] });
    const text = buildPlainText(report);
    // buildPlainText 輸出「使用來源 3 個」
    expect(text).toContain('使用來源 3 個');
  });

  it('包含免責聲明', () => {
    const report = buildMockReport();
    const text = buildPlainText(report);
    expect(text).toContain('免責聲明');
    expect(text).toContain('本報告由 AI 自動生成，僅供參考，不構成投資建議。');
    expect(text).toContain('加密貨幣投資具有高度風險，請自行評估並謹慎決策。');
  });

  it('topStories 為空時不拋出錯誤', () => {
    const categorizedStories = buildEmptyCategorizedStories();
    const report = buildMockReport({
      topStories: [],
      categorizedStories,
    });
    expect(() => buildPlainText(report)).not.toThrow();
    const text = buildPlainText(report);
    // 仍包含報告日期與基本結構
    expect(text).toContain('2026-03-07');
    expect(text).toContain('免責聲明');
  });
});
