import { config } from '../config';
import { logger } from '../utils/logger';
import { httpClient } from '../utils/retry';

// ─── 型別 ─────────────────────────────────────────────────────────────────────

interface GitHubFileResponse {
  sha: string;
}

interface GitHubPagesResponse {
  status: string;
  html_url: string;
}

// ─── 內部工具 ─────────────────────────────────────────────────────────────────

function repoApiBase(): string {
  const { githubOwner, githubRepo } = config.publisher;
  return `https://api.github.com/repos/${githubOwner}/${githubRepo}`;
}

function buildHeaders() {
  return {
    Authorization: `Bearer ${config.publisher.githubToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * 取得檔案現有 sha（檔案不存在時回傳 undefined）
 */
async function getFileSha(path: string): Promise<string | undefined> {
  try {
    const res = await httpClient.get<GitHubFileResponse>(
      `${repoApiBase()}/contents/${path}`,
      { headers: buildHeaders() }
    );
    return res.data.sha;
  } catch {
    return undefined;
  }
}

/**
 * 推送單一檔案至 repo
 */
async function pushFile(path: string, content: string, message: string): Promise<void> {
  const sha = await getFileSha(path);
  await httpClient.put(
    `${repoApiBase()}/contents/${path}`,
    {
      message,
      content: Buffer.from(content).toString('base64'),
      ...(sha ? { sha } : {}),
    },
    { headers: buildHeaders() }
  );
}

// ─── GitHub Pages 自動啟用 ────────────────────────────────────────────────────

/**
 * 檢查 GitHub Pages 是否已啟用；若未啟用則自動透過 API 啟用。
 * 需要 token 具備 pages: write 權限。
 */
async function ensureGitHubPagesEnabled(): Promise<void> {
  const pagesUrl = `${repoApiBase()}/pages`;

  try {
    const res = await httpClient.get<GitHubPagesResponse>(pagesUrl, {
      headers: buildHeaders(),
    });
    logger.debug('GitHub Pages 已啟用', { status: res.data.status, url: res.data.html_url });
  } catch {
    // Pages 未啟用，嘗試自動啟用
    try {
      await httpClient.post(
        pagesUrl,
        { source: { branch: 'master', path: '/' } },
        { headers: buildHeaders() }
      );
      logger.info('GitHub Pages 已自動啟用（首次）。Pages 建置通常需要 1-3 分鐘，之後連結即可正常瀏覽。');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        'GitHub Pages 自動啟用失敗，請手動至 repo → Settings → Pages → Source 選擇 main branch。',
        { error: msg }
      );
    }
  }
}

// ─── 公開 URL 計算 ────────────────────────────────────────────────────────────

/**
 * 計算 GitHub Pages 上的 HTML 報告 URL（URL 結構固定，可在發布前預先取得）。
 * 若設定不完整則回傳 null。
 */
export function getReportPageUrl(dateStr: string): string | null {
  const { githubToken, githubOwner, githubRepo } = config.publisher;
  if (!githubToken || !githubOwner || !githubRepo) return null;

  return `https://${githubOwner}.github.io/${githubRepo}/crypto-daily-${dateStr}.html`;
}

// ─── GitHub Pages 部署 ────────────────────────────────────────────────────────

/**
 * 將 HTML 報告推送至 GitHub repo，透過 GitHub Pages 提供線上瀏覽。
 *
 * 同時會：
 * - 自動啟用 GitHub Pages（若尚未啟用）
 * - 更新 index.html 自動轉址至最新報告
 *
 * 若三個環境變數（GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO）任一未設定，跳過並回傳 null。
 */
export async function publishToGitHubPages(
  html: string,
  dateStr: string
): Promise<string | null> {
  const { githubToken, githubOwner, githubRepo } = config.publisher;

  if (!githubToken || !githubOwner || !githubRepo) {
    logger.warn('GitHub Pages 設定不完整，跳過 HTML 報告發布', {
      hasToken: !!githubToken,
      hasOwner: !!githubOwner,
      hasRepo: !!githubRepo,
    });
    return null;
  }

  const reportFilename = `crypto-daily-${dateStr}.html`;
  const pageUrl = getReportPageUrl(dateStr)!;

  try {
    // 1. 確保 GitHub Pages 已啟用
    await ensureGitHubPagesEnabled();

    // 2. 推送 HTML 報告主檔案
    await pushFile(
      reportFilename,
      html,
      `report: 加密貨幣每日報告 ${dateStr}`
    );
    logger.info('HTML 報告推送成功', { file: reportFilename });

    // 3. 更新 index.html，自動轉址至最新報告
    const indexHtml = buildIndexHtml(dateStr, pageUrl);
    await pushFile('index.html', indexHtml, `chore: 更新首頁轉址至 ${dateStr}`);
    logger.info('index.html 已更新');

    logger.info('GitHub Pages 報告連結（建置完成後即可瀏覽）', { url: pageUrl });
    return pageUrl;
  } catch (err) {
    logger.warn('HTML 報告發布至 GitHub Pages 失敗', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── index.html 樣板 ──────────────────────────────────────────────────────────

function buildIndexHtml(dateStr: string, reportUrl: string): string {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="refresh" content="3; url=${reportUrl}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>加密貨幣日報 ${dateStr}</title>
  <style>
    body {
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #1a1a2e;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #ffffff;
      text-align: center;
    }
    .card {
      padding: 48px 40px;
      background: #16213e;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p  { margin: 0 0 24px; color: #a8d8ea; font-size: 14px; }
    a  {
      display: inline-block;
      padding: 12px 28px;
      background: #f39c12;
      color: #fff;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
    }
    a:hover { background: #e67e22; }
    .note { margin-top: 16px; font-size: 12px; color: #7f8fa6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>加密貨幣日報</h1>
    <p>最新報告：${dateStr}　正在為您轉址...</p>
    <a href="${reportUrl}">立即閱讀 &rarr;</a>
    <div class="note">3 秒後自動跳轉</div>
  </div>
</body>
</html>`;
}
