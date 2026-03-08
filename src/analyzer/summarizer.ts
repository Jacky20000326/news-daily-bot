import {
  GoogleGenerativeAI,
  GenerateContentResult,
} from "@google/generative-ai";
import { NewsItem, AnalyzedNewsItem } from "../types";
import { config } from "../config";
import { logger } from "../utils/logger";
import { withRetry, NonRetryableError } from "../utils/retry";
import {
  buildSummaryPrompt,
  buildExecutiveSummaryPrompt,
} from "./prompts/summary";

// ─── 常數 ─────────────────────────────────────────────────────────────────────

// Gemini 免費層上限 15 RPM，降低並行數避免觸發 429
const CONCURRENCY_LIMIT = 2;
const RETRY_COUNT = 2;
const RETRY_DELAY_MS = 3000;

// ─── Promise Pool（並行數量控制）─────────────────────────────────────────────

/**
 * 以最多 limit 個並行任務執行 tasks 陣列中的所有非同步函式
 * 保留執行順序（回傳陣列索引對應輸入索引）
 */
async function promisePool<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let currentIndex = 0;

  async function runNext(): Promise<void> {
    while (currentIndex < tasks.length) {
      const taskIndex = currentIndex;
      currentIndex++;
      results[taskIndex] = await tasks[taskIndex]();
    }
  }

  // 啟動最多 limit 個 worker
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    runNext(),
  );
  await Promise.all(workers);

  return results;
}

// ─── AI 客戶端工廠 ────────────────────────────────────────────────────────────

function createModel(maxOutputTokens: number) {
  const genAI = new GoogleGenerativeAI(config.ai.apiKey);
  return genAI.getGenerativeModel({
    model: config.ai.model,
    generationConfig: {
      temperature: config.ai.temperature,
      maxOutputTokens,
    },
  });
}

/**
 * 安全地從 Gemini 回應中取得文字內容。
 * 當安全篩選器攔截時，`.text()` 會直接拋出例外，此函式改為先檢查 candidates
 * 並在被攔截時拋出 NonRetryableError（避免無意義的重試）。
 */
function safeGetText(result: GenerateContentResult): string {
  const candidate = result.response.candidates?.[0];

  if (!candidate) {
    const blockReason = result.response.promptFeedback?.blockReason;
    throw new NonRetryableError(
      `Gemini 安全篩選器阻擋請求（blockReason: ${blockReason ?? "未知"}）`,
    );
  }

  const finishReason = candidate.finishReason as string | undefined;
  if (finishReason === "SAFETY" || finishReason === "RECITATION") {
    throw new NonRetryableError(
      `Gemini 拒絕生成內容（finishReason: ${finishReason}）`,
    );
  }

  return result.response.text().trim();
}

// ─── 單則新聞摘要 ─────────────────────────────────────────────────────────────

/**
 * 為單則新聞生成繁體中文 AI 摘要（100-150 字）
 * 失敗時回傳空字串
 */
export async function summarizeItem(item: NewsItem): Promise<string> {
  const model = createModel(512);

  try {
    const summary = await withRetry(
      async () => {
        const prompt = buildSummaryPrompt(item);

        const result = await model.generateContent(prompt);
        const text = safeGetText(result);

        if (!text) {
          throw new Error("AI 回傳空白摘要");
        }

        return text;
      },
      {
        retries: RETRY_COUNT,
        delayMs: RETRY_DELAY_MS,
        label: `新聞摘要生成（${item.id}）`,
      },
    );

    return summary;
  } catch (err) {
    logger.warn("新聞摘要生成失敗，回傳空字串", {
      itemId: item.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

// ─── 批次並行摘要 ─────────────────────────────────────────────────────────────

/**
 * 對多則新聞並行生成摘要（最多 5 個同時進行）
 */
export async function summarizeItems(items: NewsItem[]): Promise<string[]> {
  logger.info("開始並行生成新聞摘要", {
    count: items.length,
    concurrency: CONCURRENCY_LIMIT,
  });

  const tasks = items.map((item) => () => summarizeItem(item));
  const summaries = await promisePool(tasks, CONCURRENCY_LIMIT);

  const successCount = summaries.filter((s) => s.length > 0).length;
  logger.info("並行摘要生成完成", {
    total: items.length,
    success: successCount,
    failed: items.length - successCount,
  });

  return summaries;
}

// ─── 今日市場總覽 ─────────────────────────────────────────────────────────────

/**
 * 依據前幾名重要新聞生成整體「今日市場總覽」（250-300 字）
 * 失敗時回傳空字串
 */
export async function generateExecutiveSummary(
  topItems: AnalyzedNewsItem[],
): Promise<string> {
  const model = createModel(1024);

  try {
    const executiveSummary = await withRetry(
      async () => {
        const prompt = buildExecutiveSummaryPrompt(topItems);

        const result = await model.generateContent(prompt);
        const text = safeGetText(result);

        if (!text) {
          throw new Error("AI 回傳空白總覽");
        }

        return text;
      },
      {
        retries: RETRY_COUNT,
        delayMs: RETRY_DELAY_MS,
        label: "今日市場總覽生成",
      },
    );

    return executiveSummary;
  } catch (err) {
    logger.warn("今日市場總覽生成失敗，回傳空字串", {
      topItemCount: topItems.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}
