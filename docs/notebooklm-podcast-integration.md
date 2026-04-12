# NotebookLM Podcast 自動化整合方案

## 背景

目前每日報告流程已包含單人語音導讀（Gemini TTS），希望升級為 **NotebookLM 雙主持人 Podcast**，讓每日加密貨幣日報更生動、更具吸引力。

---

## 核心概念

NotebookLM 的 **Audio Overview** 功能可將文件內容自動轉化為兩位主持人的自然對話式 Podcast。我們要做的是：

```
每日報告文字 → 上傳至 NotebookLM → 生成 Audio Overview → 下載 MP3 → 嵌入報告
```

---

## 實作流程

### 整體 Pipeline（修改後）

```
收集 → 標準化 → 去重 → AI 分析 → 組裝報告
  → [新] NotebookLM Podcast 生成（失敗則退回既有 TTS）
  → 發布 HTML + 音檔至 GitHub Pages
  → 寄送通知 Email
```

### Podcast 生成步驟

1. **建立 Notebook** — 以當日日期命名
2. **上傳報告內容** — 將執行摘要 + 各則新聞分析作為文字 source 加入
3. **觸發 Audio Overview** — 指定繁體中文，NotebookLM 自動生成雙主持人對話
4. **等待完成** — 輪詢狀態，約需 2-5 分鐘
5. **下載音檔** — 取得 MP3 格式音檔
6. **清理** — 刪除 Notebook，避免帳號累積垃圾

### Fallback 機制

Podcast 生成失敗時（網路問題、API 變動等），自動退回既有的 Gemini TTS 單人語音導讀，確保報告永遠有語音內容。

---

## 技術選型

### 為什麼用 `notebooklm-kit`？

NotebookLM 目前沒有官方個人版 API。經評估現有非官方方案：

| 方案 | 語言 | 可自動化 | 說明 |
|------|------|---------|------|
| **notebooklm-kit** | TypeScript/Node.js | ✅ Email/Password 認證 | 與專案技術棧一致，最適合 CI/CD |
| notebooklm-sdk | TypeScript/Node.js | ⚠️ 需手動取得 cookies | 認證不夠自動化 |
| notebooklm-py | Python | ⚠️ 需瀏覽器互動登入 | 語言不同，整合成本高 |
| 瀏覽器自動化 | 任意 | ❌ 極度脆弱 | UI 變更即壞，不適合生產環境 |

### 風險認知

所有非官方套件都基於逆向工程，Google 更新後可能失效。因此：
- 保留既有 TTS 作為永久 fallback
- 透過環境變數 `PODCAST_ENABLED` 控制開關，可隨時切回

---

## 需要的設定

| 環境變數 | 說明 |
|---------|------|
| `PODCAST_ENABLED` | `true` 開啟 Podcast 模式，`false` 用既有 TTS |
| `NOTEBOOKLM_EMAIL` | Google 帳號 Email |
| `NOTEBOOKLM_PASSWORD` | Google App Password（建議使用應用程式密碼） |

---

## 異動範圍

| 檔案 | 異動說明 |
|------|---------|
| `src/podcast/index.ts` | **新建** — NotebookLM Podcast 生成模組 |
| `src/config/index.ts` | 新增 `podcast` 設定區塊 |
| `src/index.ts` | 步驟 12 加入 podcast/tts 分支判斷 |
| `src/publisher/index.ts` | `publishAudioFile` 支援 `.mp3` 格式 |
| `.env.example` | 新增 3 個 podcast 環境變數說明 |

既有模組（`src/tts/`、`src/reporter/`、`src/mailer/`）皆不受影響。

---

## 驗證方式

1. `DRY_RUN=true PODCAST_ENABLED=true pnpm dev` — 確認 Podcast 生成流程正常
2. 播放產出的 MP3，確認為雙主持人繁中對話
3. `PODCAST_ENABLED=false` 確認 fallback 至既有 TTS 正常運作
