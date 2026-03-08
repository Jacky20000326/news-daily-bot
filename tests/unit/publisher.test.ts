// 設定測試所需環境變數（必須在任何 src 模組 import 前設定）
process.env.GEMINI_API_KEY = 'test-key';
process.env.NEWSAPI_KEY = 'test-key';
process.env.SENDER_EMAIL = 'test@example.com';
process.env.EMAIL_RECIPIENTS = 'test@example.com';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'test-pass';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 使用 vi.hoisted 確保變數在 vi.mock 工廠函式中可用
const { mockConfig, mockGet, mockPut, mockPost } = vi.hoisted(() => {
  return {
    mockConfig: {
      publisher: {
        githubToken: 'fake-token',
        githubOwner: 'fake-owner',
        githubRepo: 'fake-repo',
      },
    },
    mockGet: vi.fn(),
    mockPut: vi.fn(),
    mockPost: vi.fn(),
  };
});

// Mock config 模組，控制 publisher 設定值
vi.mock('../../src/config/index', () => ({
  config: mockConfig,
}));

// Mock httpClient，避免真正呼叫 GitHub API
vi.mock('../../src/utils/retry', () => ({
  httpClient: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

// Mock logger，避免測試輸出干擾
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import { getReportPageUrl, publishToGitHubPages } from '../../src/publisher/index';

describe('Publisher 模組', () => {
  beforeEach(() => {
    // 每次測試前重設 mock 狀態
    vi.clearAllMocks();

    // 重設 config 為完整設定
    mockConfig.publisher = {
      githubToken: 'fake-token',
      githubOwner: 'fake-owner',
      githubRepo: 'fake-repo',
    };
  });

  // ─── getReportPageUrl() ─────────────────────────────────────────────────────

  describe('getReportPageUrl()', () => {
    it('完整設定時回傳正確 URL 格式', () => {
      const url = getReportPageUrl('2026-03-07');

      expect(url).toBe(
        'https://fake-owner.github.io/fake-repo/crypto-daily-2026-03-07.html'
      );
    });

    it('URL 包含 dateStr 和 .html 副檔名', () => {
      const dateStr = '2026-01-15';
      const url = getReportPageUrl(dateStr);

      expect(url).not.toBeNull();
      expect(url).toContain(dateStr);
      expect(url).toMatch(/\.html$/);
    });

    it('githubToken 為空時回傳 null', () => {
      mockConfig.publisher = {
        githubToken: '',
        githubOwner: 'fake-owner',
        githubRepo: 'fake-repo',
      };

      const url = getReportPageUrl('2026-03-07');
      expect(url).toBeNull();
    });

    it('githubOwner 為空時回傳 null', () => {
      mockConfig.publisher = {
        githubToken: 'fake-token',
        githubOwner: '',
        githubRepo: 'fake-repo',
      };

      const url = getReportPageUrl('2026-03-07');
      expect(url).toBeNull();
    });

    it('githubRepo 為空時回傳 null', () => {
      mockConfig.publisher = {
        githubToken: 'fake-token',
        githubOwner: 'fake-owner',
        githubRepo: '',
      };

      const url = getReportPageUrl('2026-03-07');
      expect(url).toBeNull();
    });
  });

  // ─── publishToGitHubPages() ─────────────────────────────────────────────────

  describe('publishToGitHubPages()', () => {
    // 設定所有 API 呼叫預設成功回應的輔助函式
    function setupSuccessfulMocks() {
      // get 呼叫：Pages 狀態查詢 + getFileSha
      mockGet.mockImplementation((url: string) => {
        if (url.includes('/pages')) {
          // GitHub Pages 已啟用
          return Promise.resolve({
            data: { status: 'built', html_url: 'https://fake-owner.github.io/fake-repo/' },
          });
        }
        // getFileSha — 回傳既有檔案 sha
        return Promise.resolve({ data: { sha: 'existing-sha-123' } });
      });

      // pushFile 的 put 呼叫成功
      mockPut.mockResolvedValue({ data: {} });
    }

    it('完整設定且 API 成功時回傳 URL', async () => {
      setupSuccessfulMocks();

      const result = await publishToGitHubPages('<html>報告</html>', '2026-03-07');

      expect(result).toBe(
        'https://fake-owner.github.io/fake-repo/crypto-daily-2026-03-07.html'
      );
    });

    it('回傳的 URL 與 getReportPageUrl 一致', async () => {
      setupSuccessfulMocks();

      const expectedUrl = getReportPageUrl('2026-03-07');
      const result = await publishToGitHubPages('<html>報告</html>', '2026-03-07');

      expect(result).toBe(expectedUrl);
    });

    it('會呼叫 httpClient.put 推送 HTML 報告檔案', async () => {
      setupSuccessfulMocks();

      await publishToGitHubPages('<html>報告內容</html>', '2026-03-07');

      // 第一次 put 應為推送報告檔案
      const firstPutCall = mockPut.mock.calls[0];
      expect(firstPutCall[0]).toContain('crypto-daily-2026-03-07.html');
      // 確認 content 為 base64 編碼
      expect(firstPutCall[1]).toHaveProperty('content');
      expect(firstPutCall[1].content).toBe(
        Buffer.from('<html>報告內容</html>').toString('base64')
      );
    });

    it('會呼叫 httpClient.put 推送 index.html（第二次 put）', async () => {
      setupSuccessfulMocks();

      await publishToGitHubPages('<html>報告</html>', '2026-03-07');

      // 應有至少兩次 put 呼叫（報告檔 + index.html）
      expect(mockPut.mock.calls.length).toBeGreaterThanOrEqual(2);

      // 第二次 put 應為推送 index.html
      const secondPutCall = mockPut.mock.calls[1];
      expect(secondPutCall[0]).toContain('index.html');
    });

    it('githubToken 為空時回傳 null 且不呼叫任何 API', async () => {
      mockConfig.publisher = {
        githubToken: '',
        githubOwner: 'fake-owner',
        githubRepo: 'fake-repo',
      };

      const result = await publishToGitHubPages('<html>報告</html>', '2026-03-07');

      expect(result).toBeNull();
      expect(mockGet).not.toHaveBeenCalled();
      expect(mockPut).not.toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('API 失敗時回傳 null（不拋出錯誤）', async () => {
      // Pages 查詢成功但 pushFile 的 put 失敗
      mockGet.mockImplementation((url: string) => {
        if (url.includes('/pages')) {
          return Promise.resolve({
            data: { status: 'built', html_url: 'https://fake-owner.github.io/fake-repo/' },
          });
        }
        return Promise.resolve({ data: { sha: 'sha-123' } });
      });
      mockPut.mockRejectedValue(new Error('GitHub API 503 Service Unavailable'));

      const result = await publishToGitHubPages('<html>報告</html>', '2026-03-07');

      // 應回傳 null 而非拋出錯誤
      expect(result).toBeNull();
    });

    it('GitHub Pages 已啟用時正常推送（get pages 成功）', async () => {
      setupSuccessfulMocks();

      await publishToGitHubPages('<html>報告</html>', '2026-03-07');

      // 確認有呼叫 get pages 端點
      const pagesGetCall = mockGet.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('/pages')
      );
      expect(pagesGetCall).toBeDefined();

      // 不應呼叫 post 來啟用 Pages（因為已啟用）
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('GitHub Pages 未啟用時嘗試啟用（get pages 失敗後呼叫 post pages）', async () => {
      mockGet.mockImplementation((url: string) => {
        if (url.includes('/pages')) {
          // Pages 尚未啟用，回傳 404
          return Promise.reject(new Error('404 Not Found'));
        }
        // getFileSha 正常回傳
        return Promise.resolve({ data: { sha: 'sha-123' } });
      });
      mockPut.mockResolvedValue({ data: {} });
      // post pages 成功啟用
      mockPost.mockResolvedValue({ data: {} });

      const result = await publishToGitHubPages('<html>報告</html>', '2026-03-07');

      // 應嘗試透過 post 啟用 GitHub Pages
      expect(mockPost).toHaveBeenCalledTimes(1);
      const postCall = mockPost.mock.calls[0];
      expect(postCall[0]).toContain('/pages');
      expect(postCall[1]).toEqual({ source: { branch: 'main', path: '/' } });

      // 整體流程仍成功
      expect(result).toBe(
        'https://fake-owner.github.io/fake-repo/crypto-daily-2026-03-07.html'
      );
    });
  });
});
