/**
 * GitHub Pages 連線診斷腳本
 * 執行：pnpm ts-node scripts/test-github-pages.ts
 */
import { config } from "../src/config";
import axios from "axios";

const { githubToken, githubOwner, githubRepo } = config.publisher;

const headers = {
  Authorization: `Bearer ${githubToken}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg: string) {
  console.log(`  ✗ ${msg}`);
}
function info(msg: string) {
  console.log(`  → ${msg}`);
}

async function run() {
  console.log("\n=== GitHub Pages 診斷 ===\n");

  // ── 1. 環境變數 ──
  console.log("[1] 環境變數檢查");
  if (githubToken) ok(`GH_PAGES_TOKEN 已設定（長度 ${githubToken.length}）`);
  else {
    fail("GH_PAGES_TOKEN 未設定");
    process.exit(1);
  }

  if (githubOwner) ok(`GH_PAGES_OWNER = ${githubOwner}`);
  else {
    fail("GH_PAGES_OWNER 未設定");
    process.exit(1);
  }

  if (githubRepo) ok(`GH_PAGES_REPO = ${githubRepo}`);
  else {
    fail("GH_PAGES_REPO 未設定");
    process.exit(1);
  }

  // ── 2. Token 有效性（取得目前使用者）──
  console.log("\n[2] Token 驗證");
  try {
    const res = await axios.get<{ login: string }>(
      "https://api.github.com/user",
      { headers },
    );
    ok(`Token 有效，帳號：${res.data.login}`);
    if (res.data.login.toLowerCase() !== githubOwner.toLowerCase()) {
      fail(
        `帳號不符：Token 屬於 "${res.data.login}"，但 GH_PAGES_OWNER 設定為 "${githubOwner}"`,
      );
    }
  } catch (err: any) {
    fail(
      `Token 無效或已過期：${err.response?.status} ${err.response?.data?.message ?? err.message}`,
    );
    process.exit(1);
  }

  // ── 3. Repo 存在性 ──
  console.log("\n[3] Repo 存在性");
  try {
    const res = await axios.get<{ full_name: string; private: boolean }>(
      `https://api.github.com/repos/${githubOwner}/${githubRepo}`,
      { headers },
    );
    ok(
      `Repo 存在：${res.data.full_name}（${res.data.private ? "private" : "public"}）`,
    );
    if (res.data.private) {
      fail(
        "Repo 為 private — GitHub Pages 免費方案需使用 public repo，或升級 GitHub Pro",
      );
    }
  } catch (err: any) {
    fail(
      `Repo 不存在或無法存取：${err.response?.status} ${err.response?.data?.message ?? err.message}`,
    );
    info(`請確認 https://github.com/${githubOwner}/${githubRepo} 是否存在`);
    process.exit(1);
  }

  // ── 4. 寫入權限（嘗試推送測試檔案）──
  console.log("\n[4] 寫入權限測試");
  const testFile = "_test-connection.txt";
  const testApiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${testFile}`;
  try {
    // 推送
    await axios.put(
      testApiUrl,
      {
        message: "test: 連線測試（可刪除此檔案）",
        content: Buffer.from(
          `GitHub Pages 連線測試 ${new Date().toISOString()}`,
        ).toString("base64"),
      },
      { headers },
    );
    ok("檔案寫入成功");

    // 刪除測試檔
    const getRes = await axios.get<{ sha: string }>(testApiUrl, { headers });
    await axios.delete(testApiUrl, {
      headers,
      data: { message: "test: 清除連線測試檔", sha: getRes.data.sha },
    });
    ok("測試檔案已清除");
  } catch (err: any) {
    fail(
      `寫入失敗：${err.response?.status} ${err.response?.data?.message ?? err.message}`,
    );
    info("請確認 Token 有 Contents → Read and write 權限");
    process.exit(1);
  }

  // ── 5. GitHub Pages 狀態 ──
  console.log("\n[5] GitHub Pages 狀態");
  try {
    const res = await axios.get<{ status: string; html_url: string }>(
      `https://api.github.com/repos/${githubOwner}/${githubRepo}/pages`,
      { headers },
    );
    ok(`GitHub Pages 已啟用，狀態：${res.data.status}`);
    info(`Pages URL：${res.data.html_url}`);
  } catch (err: any) {
    if (err.response?.status === 404) {
      fail("GitHub Pages 尚未啟用");
      info(
        "程式將在下次執行時自動啟用（需要 Token 有 Pages: Read and write 權限）",
      );
      info(
        `或手動至：https://github.com/${githubOwner}/${githubRepo}/settings/pages`,
      );
    } else {
      fail(
        `無法取得 Pages 狀態：${err.response?.status} ${err.response?.data?.message ?? err.message}`,
      );
    }
  }

  console.log("\n=== 診斷完成 ===\n");
}

run().catch((err) => {
  console.error("診斷失敗：", err.message);
  process.exit(1);
});
