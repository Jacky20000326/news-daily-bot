import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockRawItem } from '../helpers/mocks';
import type { RawNewsItem } from '../../src/types';

// ── Mock config（確保在模組評估時環境變數已設定）──
vi.mock('../../src/config/index', () => ({
  config: {
    ai: {
      apiKey: 'test-key',
      model: 'gemini-1.5-flash',
      maxTokens: 4096,
      temperature: 0.3,
    },
    sources: {
      newsApiKey: 'test-key',
      cryptoPanicToken: '',
      enableCoinGecko: false,
    },
    email: {
      senderEmail: 'test@example.com',
      recipients: ['test@example.com'],
      alertEmail: '',
      smtp: {
        host: 'smtp.gmail.com',
        port: 587,
        user: 'test@example.com',
        pass: 'test-pass',
      },
    },
    scheduler: { timezone: 'Asia/Taipei', reportHour: 9 },
    app: { dryRun: true, logLevel: 'info', nodeEnv: 'test' },
    publisher: { githubToken: '', githubOwner: '', githubRepo: '' },
  },
}));

// ── Mock Google Generative AI SDK（避免實際呼叫 AI API）──
vi.mock('@google/generative-ai', () => {
  const mockGenerateContent = vi.fn().mockResolvedValue({
    response: {
      candidates: [{ finishReason: 'STOP' }],
      text: () =>
        JSON.stringify([
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
      promptFeedback: null,
    },
  });

  const MockGoogleGenerativeAI = vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  }));

  return { GoogleGenerativeAI: MockGoogleGenerativeAI };
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
  generateFullReport: vi.fn().mockReturnValue('<html>Mock Full Report</html>'),
  buildPlainText: vi.fn().mockReturnValue('Mock Plain Text'),
}));

// ── Mock publisher（避免實際呼叫 GitHub API）──
vi.mock('../../src/publisher/index', () => ({
  getReportPageUrl: vi.fn().mockReturnValue(null),
  publishToGitHubPages: vi.fn().mockResolvedValue(null),
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
    expect(report).toHaveProperty('executiveSummary');
    expect(report).toHaveProperty('sources');
  });

  it('report.topStories.length <= 10', async () => {
    const report = await runDailyPipeline();

    expect(report.topStories.length).toBeLessThanOrEqual(10);
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

  it('report.topStories 中每筆都有合法 category', async () => {
    const report = await runDailyPipeline();

    const validCategories = [
      'market', 'regulation', 'technology', 'defi', 'nft',
      'security', 'macro', 'exchange', 'other',
    ];

    for (const story of report.topStories) {
      expect(validCategories).toContain(story.category);
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

  it('sendReport 被呼叫時只傳入 report（不傳 html）', async () => {
    // 將 dryRun 暫時設為 false 以觸發 sendReport
    const { config: mockConfig } = await import('../../src/config/index');
    const originalDryRun = mockConfig.app.dryRun;
    // @ts-expect-error -- 測試用途，強制覆寫 readonly 屬性
    mockConfig.app.dryRun = false;

    const { sendReport } = await import('../../src/mailer/index');
    const mockSendReport = sendReport as ReturnType<typeof vi.fn>;

    await runDailyPipeline();

    if (mockSendReport.mock.calls.length > 0) {
      // 驗證 sendReport 只接收一個參數（report 物件）
      expect(mockSendReport.mock.calls[0]).toHaveLength(1);
    }

    // 還原 dryRun 設定
    // @ts-expect-error -- 測試用途，強制覆寫 readonly 屬性
    mockConfig.app.dryRun = originalDryRun;
  });
});
