import { logger } from './logger';

// ─── 型別定義 ─────────────────────────────────────────────────────────────────

export interface TokenUsageEntry {
  source: string;
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  timestamp: Date;
}

export interface TokenUsageSummary {
  totalPromptTokens: number;
  totalCandidatesTokens: number;
  totalTokens: number;
  callCount: number;
  entries: TokenUsageEntry[];
}

// ─── Token 追蹤器 ────────────────────────────────────────────────────────────

class TokenTracker {
  private entries: TokenUsageEntry[] = [];

  /**
   * 記錄一次 Gemini API 呼叫的 token 用量
   */
  record(source: string, usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined): void {
    if (!usageMetadata) {
      logger.debug('Gemini 回應未包含 usageMetadata', { source });
      return;
    }

    const entry: TokenUsageEntry = {
      source,
      promptTokens: usageMetadata.promptTokenCount ?? 0,
      candidatesTokens: usageMetadata.candidatesTokenCount ?? 0,
      totalTokens: usageMetadata.totalTokenCount ?? 0,
      timestamp: new Date(),
    };

    this.entries.push(entry);

    logger.info('📊 Token 用量', {
      source,
      promptTokens: entry.promptTokens,
      candidatesTokens: entry.candidatesTokens,
      totalTokens: entry.totalTokens,
    });
  }

  /**
   * 取得完整用量摘要
   */
  getSummary(): TokenUsageSummary {
    const totalPromptTokens = this.entries.reduce((sum, e) => sum + e.promptTokens, 0);
    const totalCandidatesTokens = this.entries.reduce((sum, e) => sum + e.candidatesTokens, 0);
    const totalTokens = this.entries.reduce((sum, e) => sum + e.totalTokens, 0);

    return {
      totalPromptTokens,
      totalCandidatesTokens,
      totalTokens,
      callCount: this.entries.length,
      entries: [...this.entries],
    };
  }

  /**
   * 輸出用量摘要到日誌
   */
  logSummary(): void {
    const summary = this.getSummary();

    logger.info('═══════════════════════════════════════════');
    logger.info('📊 Gemini API Token 用量總結');
    logger.info('═══════════════════════════════════════════');
    logger.info(`  API 呼叫次數：${summary.callCount}`);
    logger.info(`  輸入 Token：${summary.totalPromptTokens.toLocaleString()}`);
    logger.info(`  輸出 Token：${summary.totalCandidatesTokens.toLocaleString()}`);
    logger.info(`  總 Token：${summary.totalTokens.toLocaleString()}`);
    logger.info('───────────────────────────────────────────');

    // 按來源分組統計
    const bySource = new Map<string, { calls: number; prompt: number; candidates: number; total: number }>();
    for (const entry of this.entries) {
      const existing = bySource.get(entry.source) ?? { calls: 0, prompt: 0, candidates: 0, total: 0 };
      existing.calls++;
      existing.prompt += entry.promptTokens;
      existing.candidates += entry.candidatesTokens;
      existing.total += entry.totalTokens;
      bySource.set(entry.source, existing);
    }

    for (const [source, stats] of bySource) {
      logger.info(`  [${source}] 呼叫 ${stats.calls} 次 | 輸入 ${stats.prompt.toLocaleString()} | 輸出 ${stats.candidates.toLocaleString()} | 合計 ${stats.total.toLocaleString()}`);
    }

    logger.info('═══════════════════════════════════════════');
  }

  /**
   * 重置追蹤器（每次 pipeline 執行前呼叫）
   */
  reset(): void {
    this.entries = [];
  }
}

/** 全域單例 */
export const tokenTracker = new TokenTracker();
