---
name: qa
description: 對新增或修改的功能進行測試與回歸測試。當使用者完成新功能開發、修改現有模組、或要求進行測試驗證時，使用此 skill 自動偵測變更、執行對應測試、跑完整回歸測試套件，並在缺少測試時自動生成。任何涉及「測試」、「QA」、「驗證」、「確認功能正常」、「跑測試」的請求都應觸發此 skill。
---

# QA — 測試與回歸測試

當新功能開發完成或現有模組被修改時，執行此流程確保程式碼品質。整個流程分為四個階段：偵測變更 → 執行針對性測試 → 回歸測試 → 補齊缺失測試。

## 階段一：偵測變更範圍

透過 git 找出哪些原始碼檔案被修改或新增：

```bash
# 查看工作目錄中的變更（未提交）
git diff --name-only HEAD -- 'src/**'

# 查看已暫存的變更
git diff --cached --name-only -- 'src/**'

# 查看最近一次提交的變更（如果剛提交完）
git diff --name-only HEAD~1 -- 'src/**'
```

從變更的檔案中提取模組名稱。這個專案的原始碼結構為 `src/{module}/` 形式，例如 `src/collector/newsapi.ts`、`src/normalizer/index.ts`。

## 階段二：找到對應測試並執行

### 原始碼 → 測試檔案對應規則

本專案的測試檔案放在 `tests/` 下，命名規則如下：

| 原始碼路徑 | 測試檔案路徑 |
|-----------|-------------|
| `src/collector/newsapi.ts` | `tests/unit/collector-newsapi.test.ts` |
| `src/collector/rss.ts` | `tests/unit/collector-rss.test.ts` |
| `src/normalizer/index.ts` | `tests/unit/normalizer.test.ts` |
| `src/deduplicator/index.ts` | `tests/unit/deduplicator.test.ts` |
| `src/analyzer/ranker.ts` | `tests/unit/ranker.test.ts` |
| `src/reporter/index.ts` | `tests/unit/reporter.test.ts` |
| `src/mailer/index.ts` | `tests/unit/mailer.test.ts` |
| `src/publisher/index.ts` | `tests/unit/publisher.test.ts` |
| `src/scheduler/index.ts` | `tests/unit/scheduler.test.ts` |

**命名模式**：
- 如果原始碼是 `src/{module}/index.ts`，測試檔為 `tests/unit/{module}.test.ts`
- 如果原始碼是 `src/{module}/{submodule}.ts`，測試檔為 `tests/unit/{module}-{submodule}.test.ts`

### 執行對應的單元測試

找到對應測試檔後，先只跑這些測試以快速獲得回饋：

```bash
pnpm vitest run tests/unit/{matched-test-file}.test.ts
```

如果有多個檔案，可以一次指定多個路徑：

```bash
pnpm vitest run tests/unit/normalizer.test.ts tests/unit/reporter.test.ts
```

回報結果：列出每個測試檔的通過/失敗數量。如果有失敗，顯示失敗的測試名稱和錯誤訊息。

## 階段三：回歸測試

針對性測試通過後，執行完整測試套件確保沒有破壞其他功能：

```bash
pnpm test
```

這會執行 `tests/unit/`、`tests/integration/`、`tests/e2e/` 下的所有測試。

回報結果：
- 如果全部通過，簡短確認即可
- 如果有失敗，分析失敗原因——判斷是本次變更導致的回歸，還是先前已存在的問題

## 階段四：補齊缺失的測試

如果修改的模組沒有對應的測試檔案，自動生成測試。生成時遵循以下規範：

### 測試檔案結構模板

```typescript
// 1. 環境變數設定（必須在所有 import 之前）
process.env.GEMINI_API_KEY = 'test-key';
process.env.NEWSAPI_KEY = 'test-key';
process.env.SENDER_EMAIL = 'test@example.com';
process.env.EMAIL_RECIPIENTS = 'test@example.com';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'test-pass';

// 2. Mock 外部依賴（HTTP client、第三方 API、logger 等）
vi.mock('../../src/utils/retry', () => ({
  httpClient: { get: vi.fn() },
  withRetry: vi.fn((fn) => fn()),
}));
vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// 3. 導入被測模組和 mock
import { 被測函式 } from '../../src/模組路徑';

// 4. 可選：定義本地輔助函式
function buildTestData(overrides = {}) { ... }

// 5. 測試
describe('被測函式()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正常情況下應該...', async () => {
    // Arrange
    // Act
    // Assert
  });

  it('邊界情況：當...時應該...', async () => {
    // ...
  });

  it('錯誤處理：當...失敗時應該...', async () => {
    // ...
  });
});
```

### 測試命名規範

- `describe` 使用函式名稱，例如 `describe('normalize()', ...)`
- `it` 使用繁體中文描述預期行為，例如 `it('應正確處理空陣列', ...)`
- 分組邏輯：正常路徑 → 邊界情況 → 錯誤處理

### 關鍵原則

- **外部 API 一律 mock**：HTTP 請求、Gemini API、SMTP、GitHub API 等
- **config 模組需要環境變數**：必須在 import 前設定所有必要環境變數，否則觸發 `ConfigValidationError`
- **可使用 `tests/helpers/mocks.ts` 的工廠函式**：`mockRawItem()`、`mockNewsItem()`、`mockAnalyzedItem()`、`mockTimeWindow()`
- **測試應覆蓋**：正常路徑、邊界條件（空輸入、null 值）、錯誤處理路徑
- 測試框架為 Vitest，已啟用 `globals: true`，不需額外 import `describe`/`it`/`expect`

## 輸出摘要格式

執行完畢後，輸出簡潔的摘要報告：

```
## QA 測試結果

### 變更偵測
- 修改檔案：src/normalizer/index.ts, src/reporter/index.ts

### 針對性測試
- normalizer.test.ts: ✅ 12/12 通過
- reporter.test.ts: ✅ 8/8 通過

### 回歸測試
- 全部測試: ✅ 45/45 通過

### 測試覆蓋
- ✅ 所有修改模組皆有對應測試
```

如果有失敗或缺失，在對應區塊說明問題並提供修復方案。
