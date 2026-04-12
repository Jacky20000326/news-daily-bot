/**
 * NotebookLM 手動 Cookie 登入腳本
 *
 * 使用方式：
 * 1. 用 Chrome 打開 https://notebooklm.google.com 並登入
 * 2. 按 F12 開啟 DevTools → Application → Cookies → notebooklm.google.com
 * 3. 找到所有 cookie，在 Console 執行以下指令取得完整 cookie 字串：
 *      document.cookie
 * 4. 複製結果，設定為環境變數 NOTEBOOKLM_COOKIES
 * 5. 在 DevTools → Network → 任意請求 → Headers → 找到 "x-goog-authuser" 或
 *    在 Console 執行：
 *      document.querySelector('script[nonce]')?.nonce || 'check network tab'
 *    或者在 Network tab 找任意 batchexecute 請求，從 cookie 中找 __Secure-1PSID 的值
 *    設定為 NOTEBOOKLM_AUTH_TOKEN
 *
 * 更簡單的方式：直接在 Console 執行以下腳本一次取得所有需要的值：
 *
 *   // 取得 cookies
 *   console.log('COOKIES:', document.cookie);
 *
 *   // 取得 auth token（從頁面的 WIZ_global_data 中提取）
 *   const scripts = document.querySelectorAll('script');
 *   for (const s of scripts) {
 *     const match = s.textContent?.match(/\"SNlM0e\":\"([^\"]+)\"/);
 *     if (match) { console.log('AUTH_TOKEN:', match[1]); break; }
 *   }
 */
import {
  NotebookLMClient,
  saveCredentials,
  loadCredentials,
} from "notebooklm-kit";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const ask = (q: string): Promise<string> =>
  new Promise((r) => rl.question(q, r));

async function main() {
  console.log("=== NotebookLM 手動 Cookie 認證 ===\n");

  // 檢查是否已有儲存的 credentials
  const saved = await loadCredentials();
  if (saved) {
    console.log("偵測到已儲存的 credentials，嘗試連線...");
    try {
      const client = new NotebookLMClient({
        authToken: saved.authToken,
        cookies: saved.cookies,
        autoRefresh: false,
      });
      await client.connect();
      const notebooks = await client.notebooks.list();
      console.log(`✅ 連線成功！目前有 ${notebooks.length} 個 notebook`);
      client.dispose();
      rl.close();
      return;
    } catch {
      console.log("已儲存的 credentials 已過期，需要重新登入。\n");
    }
  }

  console.log("步驟 1：用 Chrome 打開 https://notebooklm.google.com 並登入");
  console.log("步驟 2：按 F12 → Console，貼上以下指令並按 Enter：");
  console.log("");
  console.log(" document.cookie");
  console.log("");
  console.log("步驟 3：複製輸出結果（整段 cookie 字串）\n");

  const cookies = await ask("請貼上 cookie 字串：");
  if (!cookies.trim()) {
    console.error("Cookie 不能為空");
    rl.close();
    process.exit(1);
  }

  console.log("\n步驟 4：在同一個 Console 貼上以下指令：");
  console.log("");
  console.log(
    '  (()=>{for(const s of document.querySelectorAll("script")){const m=s.textContent?.match(/"SNlM0e":"([^"]+)"/);if(m)return m[1]}return"not found"})()',
  );
  console.log("");

  const authToken = await ask("請貼上 auth token：");
  if (!authToken.trim() || authToken === "not found") {
    console.error("Auth token 不能為���");
    rl.close();
    process.exit(1);
  }

  console.log("\n嘗試連線中...");

  try {
    const client = new NotebookLMClient({
      authToken: authToken.trim(),
      cookies: cookies.trim(),
      autoRefresh: false,
    });
    await client.connect();

    const notebooks = await client.notebooks.list();
    console.log(`\n✅ 連線成功���目前有 ${notebooks.length} 個 notebook`);

    // 儲存 credentials
    await saveCredentials({
      authToken: authToken.trim(),
      cookies: cookies.trim(),
    });
    console.log("✅ Credentials 已儲存至本地（後續自動化流程可直接使用）");

    client.dispose();
  } catch (err) {
    console.error(
      "\n❌ 連線失敗：",
      err instanceof Error ? err.message : String(err),
    );
    console.error(
      "請確認 cookie 和 token 是否正確，以及是否已登入 notebooklm.google.com",
    );
    rl.close();
    process.exit(1);
  }

  rl.close();
}

main();
