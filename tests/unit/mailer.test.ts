// 必須在任何 src import 之前設定環境變數
process.env.GEMINI_API_KEY = 'test-key';
process.env.NEWSAPI_KEY = 'test-key';
process.env.SENDER_EMAIL = 'test@example.com';
process.env.EMAIL_RECIPIENTS = 'recipient@example.com';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'test-pass';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock nodemailer ─────────────────────────────────────────────────────
const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' });

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

import { sendReport, sendAlertEmail } from '../../src/mailer/index';
import { config } from '../../src/config';
import { mockAnalyzedItem } from '../helpers/mocks';
import type { DailyReport, NewsCategory } from '../../src/types';

// ─── 建構測試用 DailyReport ──────────────────────────────────────────────

function buildMockReport(overrides?: Partial<DailyReport>): DailyReport {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const defaultTopStories = [
    mockAnalyzedItem({ title: '比特幣突破十萬美元創歷史新高', sourceName: 'CoinDesk' }),
    mockAnalyzedItem({ title: '以太坊 2.0 升級進展順利', sourceName: 'CoinTelegraph' }),
    mockAnalyzedItem({ title: 'SEC 批准新一批加密貨幣 ETF', sourceName: 'Bloomberg' }),
  ];

  const emptyCategorized: Record<NewsCategory, never[]> = {
    market: [],
    regulation: [],
    technology: [],
    defi: [],
    nft: [],
    security: [],
    macro: [],
    exchange: [],
    other: [],
  };

  return {
    reportDate: '2026-03-07',
    generatedAt: now,
    timeWindowFrom: from,
    timeWindowTo: now,
    totalCollected: 120,
    afterDedup: 80,
    topStories: defaultTopStories,
    categorizedStories: emptyCategorized,
    executiveSummary: '今日市場整體偏多，比特幣突破歷史新高。',
    sources: ['NewsAPI', 'CryptoPanic', 'RSS'],
    ...overrides,
  };
}

// ─── 測試 ────────────────────────────────────────────────────────────────

describe('Mailer 模組', () => {
  beforeEach(() => {
    mockSendMail.mockClear();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // sendReport()
  // ═══════════════════════════════════════════════════════════════════════
  describe('sendReport()', () => {
    it('呼叫 sendReport 會呼叫 nodemailer 的 sendMail', async () => {
      const report = buildMockReport();
      await sendReport(report);
      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });

    it('sendMail 收到的 from 欄位包含「加密日報」', async () => {
      const report = buildMockReport();
      await sendReport(report);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.from).toContain('加密日報');
    });

    it('sendMail 收到的 to 欄位為 config 中的 recipients', async () => {
      const report = buildMockReport();
      await sendReport(report);

      const callArgs = mockSendMail.mock.calls[0][0];
      const expectedTo = config.email.recipients.join(', ');
      expect(callArgs.to).toBe(expectedTo);
    });

    it('sendMail 收到的 subject 包含 reportDate', async () => {
      const report = buildMockReport({ reportDate: '2026-03-07' });
      await sendReport(report);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.subject).toContain('2026-03-07');
    });

    it('sendMail 收到的 subject 包含 topStories 第一筆的標題（前 30 字）', async () => {
      const report = buildMockReport();
      const expectedTitleSlice = report.topStories[0].title.slice(0, 30);
      await sendReport(report);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.subject).toContain(expectedTitleSlice);
    });

    it('sendMail 收到的 html 包含所有 topStories 的標題', async () => {
      const report = buildMockReport();
      await sendReport(report);

      const callArgs = mockSendMail.mock.calls[0][0];
      for (const story of report.topStories) {
        expect(callArgs.html).toContain(story.title);
      }
    });

    it('sendMail 收到的 html 包含 mdReportUrl 的「閱讀完整報告」連結', async () => {
      const testUrl = 'https://example.github.io/reports/2026-03-07';
      const report = buildMockReport({ mdReportUrl: testUrl });
      await sendReport(report);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('閱讀完整報告');
      expect(callArgs.html).toContain(testUrl);
    });

    it('沒有 mdReportUrl 時 html 不包含「閱讀完整報告」按鈕連結', async () => {
      const report = buildMockReport({ mdReportUrl: undefined });
      await sendReport(report);

      const callArgs = mockSendMail.mock.calls[0][0];
      // HTML 註解會保留，但實際的按鈕連結不應渲染
      expect(callArgs.html).not.toContain('閱讀完整報告 &rarr;');
    });

    it('sendMail 收到的 text 為純文字版（包含頭條標題）', async () => {
      const report = buildMockReport();
      await sendReport(report);

      const callArgs = mockSendMail.mock.calls[0][0];
      // 純文字版應包含每筆頭條的標題
      for (const story of report.topStories) {
        expect(callArgs.text).toContain(story.title);
      }
      // 純文字版不應含 HTML 標籤
      expect(callArgs.text).not.toContain('<html');
    });

    it('topStories 為空時 subject 包含「今日市場摘要」', async () => {
      const report = buildMockReport({ topStories: [] });
      await sendReport(report);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.subject).toContain('今日市場摘要');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // sendAlertEmail()
  // ═══════════════════════════════════════════════════════════════════════
  describe('sendAlertEmail()', () => {
    it('alertEmail 未設定時不呼叫 sendMail（只記錄 log）', async () => {
      // 暫時將 alertEmail 設為空字串（預設行為）
      const original = config.email.alertEmail;
      // config 是 as const，需要透過 Object.defineProperty 覆寫
      Object.defineProperty(config.email, 'alertEmail', {
        value: '',
        writable: true,
        configurable: true,
      });

      await sendAlertEmail(new Error('測試錯誤'));

      expect(mockSendMail).not.toHaveBeenCalled();

      // 還原
      Object.defineProperty(config.email, 'alertEmail', {
        value: original,
        writable: true,
        configurable: true,
      });
    });

    it('alertEmail 有設定時正確呼叫 sendMail', async () => {
      const original = config.email.alertEmail;
      Object.defineProperty(config.email, 'alertEmail', {
        value: 'alert@example.com',
        writable: true,
        configurable: true,
      });

      await sendAlertEmail(new Error('測試錯誤'));

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('alert@example.com');

      // 還原
      Object.defineProperty(config.email, 'alertEmail', {
        value: original,
        writable: true,
        configurable: true,
      });
    });

    it('Error 物件傳入時 html 包含 error.message', async () => {
      const original = config.email.alertEmail;
      Object.defineProperty(config.email, 'alertEmail', {
        value: 'alert@example.com',
        writable: true,
        configurable: true,
      });

      const testError = new Error('資料庫連線逾時');
      await sendAlertEmail(testError);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('資料庫連線逾時');

      // 還原
      Object.defineProperty(config.email, 'alertEmail', {
        value: original,
        writable: true,
        configurable: true,
      });
    });

    it('字串傳入時也能正確處理', async () => {
      const original = config.email.alertEmail;
      Object.defineProperty(config.email, 'alertEmail', {
        value: 'alert@example.com',
        writable: true,
        configurable: true,
      });

      await sendAlertEmail('未知的系統錯誤');

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('未知的系統錯誤');

      // 還原
      Object.defineProperty(config.email, 'alertEmail', {
        value: original,
        writable: true,
        configurable: true,
      });
    });
  });
});
