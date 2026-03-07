import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockRawItem } from '../helpers/mocks';
import type { RawNewsItem } from '../../src/types';

// ── Mock config（確保在模組評估時環境變數已設定）──
vi.mock('../../src/config/index', () => ({
  config: {
    ai: {
      apiKey: 'test-key',
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      temperature: 0.3,
    },
    sources: {
      newsApiKey: 'test-key',
      cryptoPanicToken: '',
      coinGeckoApiKey: '',
      enableRss: false,
      enableCoinGecko: false,
    },
    email: {
      sendgridApiKey: 'test-key',
      senderEmail: 'test@example.com',
      recipients: ['test@example.com'],
      alertEmail: '',
      smtp: {
        host: 'smtp.gmail.com',
        port: 587,
        user: '',
        pass: '',
      },
    },
    scheduler: {
      timezone: 'Asia/Taipei',
      reportHour: 9,
    },
    app: {
      dryRun: true,
      logLevel: 'info',
      nodeEnv: 'test',
    },
  },
}));

// ── Mock Anthropic SDK（避免實際呼叫 AI API）──
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify([
          {
            id: 'testid0000000001',
            importanceScore: 8,
            category: 'market',
            relatedTickers: ['BTC'],
            sentiment: 'positive',
          },
          {
            id: 'testid0000000002',
            importanceScore: 7,
            category: 'regulation',
            relatedTickers: ['ETH'],
            sentiment: 'neutral',
          },
          {
            id: 'testid0000000003',
            importanceScore: 6,
            category: 'security',
            relatedTickers: [],
            sentiment: 'negative',
          },
        ]),
      },
    ],
  });

  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  }));

  return {
    default: MockAnthropic,
  };
});

// ── Mock collector（避免實際發出 API 請求）──
vi.mock('../../src/collector/index', () => ({
  collect: vi.fn(),
}));

// ── Mock mailer（避免實際發送 Email）──
vi.mock('../../src/mailer/index', () => ({
  sendReport: vi.fn().mockResolvedValue(undefined),
  sendAlertEmail: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock reporter（避免讀取 Handlebars 模板檔案）──
vi.mock('../../src/reporter/index', () => ({
  generateReport: vi.fn().mockReturnValue('<html>Mock Report</html>'),
  buildPlainText: vi.fn().mockReturnValue('Mock Plain Text'),
}));

// 在 mock 設定後才 import 相關模組
import { collect } from '../../src/collector/index';
import { runDailyPipeline } from '../../src/index';

const mockCollect = collect as ReturnType<typeof vi.fn>;

describe('runDailyPipeline() 整合測試', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // 設定 collect mock：回傳 3 筆測試用原始新聞
    const now = new Date();
    const rawItems: RawNewsItem[] = [
      mockRawItem({
        rawId: 'raw-001',
        url: 'https://example.com/news/bitcoin-001',
        title: 'Bitcoin price reaches new high today',
        publishedAt: now.toISOString(),
      }),
      mockRawItem({
        rawId: 'raw-002',
        url: 'https://example.com/news/ethereum-002',
        title: 'Ethereum upgrade successfully deployed',
        publishedAt: now.toISOString(),
      }),
      mockRawItem({
        rawId: 'raw-003',
        url: 'https://example.com/news/defi-003',
        title: 'DeFi protocol exploit drains liquidity pool',
        publishedAt: now.toISOString(),
      }),
    ];

    mockCollect.mockResolvedValue(rawItems);
  });

  it('呼叫 runDailyPipeline() 確認回傳 DailyReport 物件', async () => {
    const report = await runDailyPipeline();

    expect(report).toBeDefined();
    expect(typeof report).toBe('object');
    expect(report).not.toBeNull();
  });

  it('report 包含必要的 DailyReport 欄位', async () => {
    const report = await runDailyPipeline();

    expect(report).toHaveProperty('reportDate');
    expect(report).toHaveProperty('generatedAt');
    expect(report).toHaveProperty('timeWindowFrom');
    expect(report).toHaveProperty('timeWindowTo');
    expect(report).toHaveProperty('totalCollected');
    expect(report).toHaveProperty('afterDedup');
    expect(report).toHaveProperty('topStories');
    expect(report).toHaveProperty('categorizedStories');
    expect(report).toHaveProperty('executiveSummary');
    expect(report).toHaveProperty('sources');
  });

  it('report.topStories.length <= 5', async () => {
    const report = await runDailyPipeline();

    expect(report.topStories.length).toBeLessThanOrEqual(5);
  });

  it('report.afterDedup <= report.totalCollected', async () => {
    const report = await runDailyPipeline();

    expect(report.afterDedup).toBeLessThanOrEqual(report.totalCollected);
  });

  it('report.reportDate 格式為 YYYY-MM-DD', async () => {
    const report = await runDailyPipeline();

    // 驗證 YYYY-MM-DD 格式
    expect(report.reportDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('report.generatedAt 為 Date 物件', async () => {
    const report = await runDailyPipeline();

    expect(report.generatedAt).toBeInstanceOf(Date);
    expect(isNaN(report.generatedAt.getTime())).toBe(false);
  });

  it('report.totalCollected 等於 collect 回傳的項目數量', async () => {
    const report = await runDailyPipeline();

    // collect 回傳 3 筆
    expect(report.totalCollected).toBe(3);
  });

  it('report.categorizedStories 包含所有 9 個分類的 key', async () => {
    const report = await runDailyPipeline();

    const expectedCategories = [
      'market',
      'regulation',
      'technology',
      'defi',
      'nft',
      'security',
      'macro',
      'exchange',
      'other',
    ];

    for (const cat of expectedCategories) {
      expect(report.categorizedStories).toHaveProperty(cat);
    }
  });

  it('DRY_RUN 模式下不呼叫 sendReport', async () => {
    const { sendReport } = await import('../../src/mailer/index');
    const mockSendReport = sendReport as ReturnType<typeof vi.fn>;

    await runDailyPipeline();

    expect(mockSendReport).not.toHaveBeenCalled();
  });

  it('report.topStories 中每筆都有 importanceScore（1~10 之間的數字）', async () => {
    const report = await runDailyPipeline();

    for (const story of report.topStories) {
      expect(typeof story.importanceScore).toBe('number');
      expect(story.importanceScore).toBeGreaterThanOrEqual(1);
      expect(story.importanceScore).toBeLessThanOrEqual(10);
    }
  });

  it('report.sources 為字串陣列', async () => {
    const report = await runDailyPipeline();

    expect(Array.isArray(report.sources)).toBe(true);
    for (const source of report.sources) {
      expect(typeof source).toBe('string');
    }
  });
});
