import { NotebookLMClient, loadCredentials, type AudioOverview, ArtifactState } from 'notebooklm-kit';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { config } from '../config';
import type { DailyReport } from '../types';
import { buildNarrationSegmentsWithRules, DEFAULT_NARRATION_CONFIG } from './narration-rules';
import { logger } from '../utils/logger';

/**
 * 讀取 notebooklm-config.json 中的 build label 和 f.sid
 * 這些值由 scripts/auto-login.ts 從瀏覽器動態提取，
 * 用來覆蓋 notebooklm-kit 中過時的硬編碼值
 */
function loadBuildConfig(): { bl?: string; fSid?: string } {
  try {
    const configPath = path.join(process.cwd(), 'notebooklm-config.json');
    const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return { bl: data.buildLabel, fSid: data.fSid };
  } catch {
    return {};
  }
}

/** Audio Overview 生成超時時間（10 分鐘，適應服務器繁忙情況） */
const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;
/** 輪詢間隔（5 秒） */
const POLL_INTERVAL_MS = 5000;

/**
 * 從 DailyReport 組合出適合 NotebookLM 的完整文字內容
 * 應用優先級規則：
 * - 前 6 則新聞含深度分析（主要內容）
 * - 執行摘要作為市場總覽（背景脈絡）
 * - 第 7-10 則新聞簡要提及（補充資料）
 */
function buildSourceText(report: DailyReport): string {
  const segments = buildNarrationSegmentsWithRules(report, DEFAULT_NARRATION_CONFIG);
  return segments.join('\n\n');
}

/**
 * 建立 NotebookLM client
 *
 * 認證優先順序：
 * 1. 環境變數 NOTEBOOKLM_AUTH_TOKEN + NOTEBOOKLM_COOKIES（直接注入）
 * 2. 已儲存的 credentials（由 scripts/notebooklm-login.ts 產生）
 * 3. Email/Password 自動登入（Playwright，需能通過 Google 驗證）
 */
async function createClient(): Promise<NotebookLMClient> {
  const buildConfig = loadBuildConfig();
  const urlParams: Record<string, string> = {};
  if (buildConfig.bl) urlParams['bl'] = buildConfig.bl;
  if (buildConfig.fSid) urlParams['f.sid'] = buildConfig.fSid;

  // 方式 1：環境變數直接提供 token + cookies
  const envToken = process.env.NOTEBOOKLM_AUTH_TOKEN;
  const envCookies = process.env.NOTEBOOKLM_COOKIES;
  if (envToken && envCookies) {
    logger.info('使用環境變數 AUTH_TOKEN + COOKIES 認證');
    return new NotebookLMClient({
      authToken: envToken,
      cookies: envCookies,
      autoRefresh: false,
      ...(Object.keys(urlParams).length > 0 && { urlParams }),
    });
  }

  // 方式 2：已儲存的 credentials
  const saved = await loadCredentials();
  if (saved) {
    logger.info('使用已儲存的 credentials 認證');
    return new NotebookLMClient({
      authToken: saved.authToken,
      cookies: saved.cookies,
      autoRefresh: false,
      ...(Object.keys(urlParams).length > 0 && { urlParams }),
    });
  }

  // 方式 3：Email/Password 自動登入（fallback）
  const { notebookLmEmail, notebookLmPassword } = config.podcast;
  if (notebookLmEmail && notebookLmPassword) {
    logger.info('使用 Email/Password 自動登入');
    return new NotebookLMClient({
      auth: {
        email: notebookLmEmail,
        password: notebookLmPassword,
        headless: true,
      },
      autoRefresh: false,
    });
  }

  throw new Error(
    'NotebookLM 認證資訊未設定。請先執行 bun run scripts/auto-login.ts 完成認證，' +
    '或設定 NOTEBOOKLM_AUTH_TOKEN + NOTEBOOKLM_COOKIES 環境變數。'
  );
}

/**
 * 使用 NotebookLM 的 Audio Overview 功能生成雙主持人 Podcast
 *
 * 流程：
 * 1. 初始化 NotebookLM client（多種認證方式）
 * 2. 建立新 notebook
 * 3. 將報告內容作為 text source 加入
 * 4. 觸發 Audio Overview 生成
 * 5. 輪詢等待生成完成（最多 5 分鐘）
 * 6. 下載音檔為 Buffer（MP3）
 * 7. 刪除 notebook（避免累積）
 * 8. 回傳音檔 Buffer
 */
export async function generatePodcast(report: DailyReport): Promise<Buffer> {
  logger.info('開始 NotebookLM Podcast 生成', { reportDate: report.reportDate });

  // 1. 初始化 client
  const client = await createClient();
  await client.connect();

  let notebookId: string | undefined;

  try {
    // 2. 建立 notebook
    const notebook = await client.notebooks.create({
      title: `加密貨幣日報 ${report.reportDate}`,
    });
    notebookId = notebook.projectId;
    logger.info('NotebookLM notebook 建立完成', { notebookId });

    // 3. 加入報告文字為 source
    const sourceText = buildSourceText(report);
    await client.sources.addFromText(notebookId, {
      title: `日報內容 ${report.reportDate}`,
      content: sourceText,
    });
    logger.info('Source 上傳完成', { chars: sourceText.length });

    // 4. 觸發 Audio Overview 生成
    const audio: AudioOverview = await client.artifacts.audio.create(notebookId, {
      customization: { language: 'zh-TW' },
    });
    const audioId = audio.audioId;
    if (!audioId) {
      throw new Error('Audio Overview 建立失敗：未取得 audioId');
    }
    logger.info('Audio Overview 生成已觸發', { audioId });

    // 5. 輪詢等待完成
    const startTime = Date.now();
    let artifact = await client.artifacts.get(audioId, notebookId);

    while (artifact.state !== ArtifactState.READY) {
      if (Date.now() - startTime > GENERATION_TIMEOUT_MS) {
        throw new Error(`Audio Overview 生成超時（${GENERATION_TIMEOUT_MS / 1000}s）`);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      artifact = await client.artifacts.get(audioId, notebookId);
      logger.debug('Audio Overview 狀態', { state: artifact.state });
    }

    logger.info('Audio Overview 生成完成');

    // 6. 下載音檔至臨時目錄，讀取為 Buffer
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'podcast-'));
    try {
      const result = await client.artifacts.download(audioId, tmpDir, notebookId);
      const filePath = result.filePath;
      const audioBuffer = fs.readFileSync(filePath);
      logger.info('Podcast 音檔下載完成', {
        sizeKB: (audioBuffer.length / 1024).toFixed(1),
      });
      return audioBuffer;
    } finally {
      // 清理臨時目錄
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  } finally {
    // 7. 清理：刪除 notebook
    if (notebookId) {
      try {
        await client.notebooks.delete(notebookId);
        logger.info('NotebookLM notebook 已清理', { notebookId });
      } catch (cleanupErr) {
        logger.warn('Notebook 清理失敗（不影響流程）', {
          error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        });
      }
    }
    // 8. 釋放 client
    client.dispose();
  }
}
