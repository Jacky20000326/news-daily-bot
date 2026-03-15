---
name: commit
description: 整理當前 git 變更並依照 Conventional Commits 1.0.0 規範建立結構化的 commit。分析所有暫存與未暫存的變更，自動分組、生成符合規範的 commit message，並在本地完成提交。嚴禁推送到遠端。當使用者說「整理 commit」、「提交變更」、「commit」時觸發。
---

# Commit — 依照 Conventional Commits 規範整理並提交變更

依照 [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) 規範，分析當前工作目錄的所有變更，將其分組為邏輯相關的 commit，並在本地完成提交。

**嚴禁執行 `git push`、`git push --force` 或任何推送到遠端的操作。**

## Conventional Commits 規範

### Commit Message 格式

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### 可用的 Type

| Type       | 用途                                           | SemVer 對應 |
|------------|------------------------------------------------|-------------|
| `feat`     | 新增功能                                       | MINOR       |
| `fix`      | 修復 bug                                       | PATCH       |
| `docs`     | 僅文件變更                                     | -           |
| `style`    | 不影響程式邏輯的格式變更（空白、分號、格式化） | -           |
| `refactor` | 既非新增功能也非修復 bug 的程式碼重構          | -           |
| `perf`     | 效能改善                                       | -           |
| `test`     | 新增或修改測試                                 | -           |
| `build`    | 建置系統或外部依賴變更（webpack, npm 等）      | -           |
| `ci`       | CI 設定檔變更（GitHub Actions 等）             | -           |
| `chore`    | 其他不修改原始碼或測試的變更                   | -           |

### Scope

以括號標註影響範圍，使用本專案的模組名稱：

`collector`, `normalizer`, `deduplicator`, `analyzer`, `reporter`, `publisher`, `mailer`, `scheduler`, `config`, `types`

若變更跨多個模組且無法歸類，可省略 scope。

### Breaking Changes

- 在 type/scope 後加 `!`：`feat(analyzer)!: 改變評分演算法`
- 或在 footer 加 `BREAKING CHANGE: 說明`
- 兩者皆用亦可

### Description 規則

- 使用繁體中文撰寫
- 簡潔描述變更內容（建議 50 字以內）
- 不以大寫開頭、不加句號（英文規則；中文則自然書寫）

### Body 規則

- 與 description 之間空一行
- 說明變更的動機與前後差異
- 可包含多段落

### Footer 規則

- 與 body 之間空一行
- 格式：`Token: value` 或 `Token #value`
- Token 中的空白用 `-` 替代（如 `Reviewed-by`）
- `BREAKING CHANGE` 必須大寫

## 執行流程

### 階段一：分析變更

```bash
# 查看所有變更的檔案（未暫存 + 已暫存 + 未追蹤）
git status

# 查看已暫存的具體變更
git diff --cached

# 查看未暫存的具體變更
git diff

# 查看最近的 commit 訊息風格作為參考
git log --oneline -10
```

閱讀所有變更的內容，理解每個檔案的修改目的。

### 階段二：分組變更

將變更依照邏輯關聯性分組。分組原則：

1. **同一功能的相關變更**放在同一個 commit（例如：新增 collector 模組 + 對應的 type 定義 + 對應的測試）
2. **不同目的的變更**拆成不同 commit（例如：bug fix 和新功能分開）
3. **文件變更**如果與程式碼變更相關就合併，獨立的文件更新單獨 commit
4. **測試變更**如果是為了對應的功能/修復而寫，與該功能/修復合併
5. **設定檔變更**（如 `.github/workflows/`、`tsconfig.json`）依其目的歸類

### 階段三：向使用者確認

在執行 commit 之前，列出計畫的 commit 清單供使用者確認：

```
## 預計提交的 Commit

### Commit 1
- **Type**: feat(collector)
- **Message**: feat(collector): 新增 CoinDesk RSS 來源
- **包含檔案**:
  - src/collector/coindesk.ts (新增)
  - src/collector/index.ts (修改)
  - src/types/index.ts (修改)

### Commit 2
- **Type**: test(collector)
- **Message**: test(collector): 新增 CoinDesk collector 單元測試
- **包含檔案**:
  - tests/unit/collector-coindesk.test.ts (新增)

### Commit 3
- **Type**: ci
- **Message**: ci: 更新 daily-report workflow 觸發條件
- **包含檔案**:
  - .github/workflows/daily-report.yml (修改)
```

等待使用者確認或調整後再執行。

### 階段四：依序執行 Commit

使用者確認後，依照計畫的順序逐一提交：

```bash
# 先確保工作區乾淨（unstage all）
git reset HEAD

# 針對每個 commit，只 stage 對應的檔案
git add <file1> <file2> ...

# 提交（使用 HEREDOC 確保格式正確）
git commit -m "$(cat <<'EOF'
<type>(<scope>): <description>

<body>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 階段五：驗證結果

```bash
# 確認所有 commit 已正確建立
git log --oneline -<N>  # N = 本次建立的 commit 數量

# 確認工作區已乾淨
git status
```

## 輸出摘要格式

完成後輸出簡潔摘要：

```
## Commit 整理結果

### 已建立的 Commit（共 N 筆）
1. `abc1234` feat(collector): 新增 CoinDesk RSS 來源
2. `def5678` test(collector): 新增 CoinDesk collector 單元測試
3. `ghi9012` ci: 更新 daily-report workflow 觸發條件

### 工作區狀態
- ✅ 所有變更已提交，工作區乾淨
```

## 重要限制

- **嚴禁推送到遠端**：不執行 `git push`、`git push --force`、`git push -u` 或任何推送操作
- **不使用 `git add -A` 或 `git add .`**：每個 commit 只 stage 明確指定的檔案
- **不使用 `--amend`**：每次都建立新的 commit
- **不使用 `--no-verify`**：不跳過 pre-commit hooks
- **不修改 git config**：不變更使用者的 git 設定
- **必須等待使用者確認**：commit 計畫需經使用者同意後才執行
