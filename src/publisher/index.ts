import { config } from '../config';
import { logger } from '../utils/logger';
import { httpClient } from '../utils/retry';

// ─── GitHub Contents API 回應型別 ─────────────────────────────────────────────

interface GitHubFileResponse {
  sha: string;
}

// ─── 公開 URL 計算 ────────────────────────────────────────────────────────────

/**
 * 計算 GitHub Pages 上的 HTML 報告 URL（可在發布前預先取得，因 URL 結構固定）。
 * 若設定不完整則回傳 null。
 */
export function getReportPageUrl(dateStr: string): string | null {
  const { githubToken, githubOwner, githubRepo } = config.publisher;
  if (!githubToken || !githubOwner || !githubRepo) return null;

  return `https://${githubOwner}.github.io/${githubRepo}/crypto-daily-${dateStr}.html`;
}

// ─── GitHub Pages 部署 ────────────────────────────────────────────────────────

/**
 * 透過 GitHub Contents API 將 HTML 報告推送至指定 repo，
 * 由 GitHub Pages 提供線上瀏覽服務。
 *
 * 若 GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO 任一未設定，跳過並回傳 null。
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

  const filename = `crypto-daily-${dateStr}.html`;
  const apiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${filename}`;
  const pageUrl = getReportPageUrl(dateStr)!;
  const content = Buffer.from(html).toString('base64');
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    // 取得現有檔案的 sha（若存在），更新時必須帶上
    let sha: string | undefined;
    try {
      const existing = await httpClient.get<GitHubFileResponse>(apiUrl, { headers });
      sha = existing.data.sha;
    } catch {
      // 檔案不存在，新建即可，不需要 sha
    }

    await httpClient.put(
      apiUrl,
      {
        message: `report: 加密貨幣每日報告 ${dateStr}`,
        content,
        ...(sha ? { sha } : {}),
      },
      { headers }
    );

    logger.info('HTML 報告已發布至 GitHub Pages', { url: pageUrl });
    return pageUrl;
  } catch (err) {
    logger.warn('HTML 報告發布至 GitHub Pages 失敗', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
