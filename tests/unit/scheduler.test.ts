// 必須在任何 src import 之前設定環境變數
process.env.GEMINI_API_KEY = 'test-key';
process.env.NEWSAPI_KEY = 'test-key';
process.env.SENDER_EMAIL = 'test@example.com';
process.env.EMAIL_RECIPIENTS = 'test@example.com';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'test-pass';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── 使用 vi.hoisted 確保 mock 在模組評估前就準備好 ──────────────────────
const mocks = vi.hoisted(() => ({
  schedule: vi.fn(),
  runDailyPipeline: vi.fn().mockResolvedValue(undefined),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

// ─── Mock node-cron ─────────────────────────────────────────────────────
vi.mock('node-cron', () => ({
  default: { schedule: mocks.schedule },
}));

// ─── Mock 主 pipeline ───────────────────────────────────────────────────
vi.mock('../../src/index', () => ({
  runDailyPipeline: mocks.runDailyPipeline,
}));

// ─── Mock config ────────────────────────────────────────────────────────
vi.mock('../../src/config/index', () => ({
  config: {
    scheduler: { reportHour: 9, timezone: 'Asia/Taipei' },
    ai: {
      apiKey: 'test',
      model: 'gemini-1.5-flash',
      maxTokens: 4096,
      temperature: 0.3,
    },
    sources: {
      newsApiKey: 'test',
      cryptoPanicToken: '',
      enableRss: false,
      enableCoinGecko: false,
    },
    email: {
      senderEmail: 'test@example.com',
      recipients: ['test@example.com'],
      alertEmail: '',
      smtp: { host: 'smtp.gmail.com', port: 587, user: '', pass: '' },
    },
    app: { dryRun: true, logLevel: 'info', nodeEnv: 'test' },
    publisher: { githubToken: '', githubOwner: '', githubRepo: '' },
  },
}));

// ─── Mock logger ────────────────────────────────────────────────────────
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    error: mocks.loggerError,
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── 載入 side-effect 模組（import 即執行 cron.schedule）───────────────

describe('Scheduler 模組', () => {
  beforeEach(async () => {
    // 每個測試前重設所有 mock 狀態並重新載入模組
    vi.resetModules();
    mocks.schedule.mockClear();
    mocks.runDailyPipeline.mockReset().mockResolvedValue(undefined);
    mocks.loggerInfo.mockClear();
    mocks.loggerError.mockClear();

    // 重新 import 讓 side-effect 再次執行
    await import('../../src/scheduler/index');
  });

  // ─── cron.schedule 呼叫驗證 ─────────────────────────────────────────

  describe('cron.schedule 呼叫驗證', () => {
    it('cron.schedule 應被呼叫恰好一次', () => {
      expect(mocks.schedule).toHaveBeenCalledTimes(1);
    });

    it('cron 表達式應為 "0 9 * * *"（對應 reportHour = 9）', () => {
      const cronExpression = mocks.schedule.mock.calls[0][0];
      expect(cronExpression).toBe('0 9 * * *');
    });

    it('options 應包含 timezone: "Asia/Taipei"', () => {
      const options = mocks.schedule.mock.calls[0][2];
      expect(options).toEqual(
        expect.objectContaining({ timezone: 'Asia/Taipei' }),
      );
    });
  });

  // ─── 排程回呼函式驗證 ───────────────────────────────────────────────

  describe('排程回呼函式驗證', () => {
    it('排程觸發時應呼叫 runDailyPipeline()', async () => {
      const callback = mocks.schedule.mock.calls[0][1];
      await callback();

      expect(mocks.runDailyPipeline).toHaveBeenCalledTimes(1);
    });

    it('排程觸發時應記錄啟動資訊日誌', async () => {
      const callback = mocks.schedule.mock.calls[0][1];
      await callback();

      expect(mocks.loggerInfo).toHaveBeenCalledWith(
        '排程觸發：開始執行每日報告流程',
        expect.objectContaining({ hour: 9 }),
      );
    });

    it('runDailyPipeline 拋出錯誤時應記錄 error 日誌', async () => {
      const testError = new Error('pipeline 測試錯誤');
      mocks.runDailyPipeline.mockRejectedValueOnce(testError);

      const callback = mocks.schedule.mock.calls[0][1];
      await callback();

      expect(mocks.loggerError).toHaveBeenCalledWith(
        '排程執行失敗',
        expect.objectContaining({ err: String(testError) }),
      );
    });

    it('runDailyPipeline 拋出錯誤時不應讓錯誤傳播到外層（排程不中斷）', async () => {
      mocks.runDailyPipeline.mockRejectedValueOnce(
        new Error('不應傳播的錯誤'),
      );

      const callback = mocks.schedule.mock.calls[0][1];

      // 回呼不應拋出錯誤
      await expect(callback()).resolves.toBeUndefined();
    });
  });

  // ─── 啟動日誌驗證 ───────────────────────────────────────────────────

  describe('啟動日誌驗證', () => {
    it('模組載入後應記錄「排程器已啟動」日誌', () => {
      expect(mocks.loggerInfo).toHaveBeenCalledWith(
        '排程器已啟動',
        expect.objectContaining({
          expression: '0 9 * * *',
          timezone: 'Asia/Taipei',
        }),
      );
    });
  });
});
