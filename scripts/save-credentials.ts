/**
 * 透過 CDP 連接到已開啟的 Chrome，從 NotebookLM 頁面提取 credentials
 *
 * 使用方式：
 * 1. 關閉 Chrome
 * 2. 用以下指令重新開啟 Chrome（帶遠端除錯埠）：
 *    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 * 3. 在 Chrome 中打開 https://notebooklm.google.com 並確認已登入
 * 4. 執行此腳本
 */
import { chromium } from 'playwright';
import { saveCredentials, NotebookLMClient } from 'notebooklm-kit';

async function main() {
  console.log('正在連接到 Chrome (port 9222)...\n');

  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  } catch {
    console.error('❌ 無法連接到 Chrome。請先執行以下步驟：');
    console.error('');
    console.error('  1. 完全關閉 Chrome');
    console.error('  2. 在終端機執行：');
    console.error('     /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
    console.error('  3. 在 Chrome 中開啟 https://notebooklm.google.com 並確認已登入');
    console.error('  4. 重新執行此腳本');
    process.exit(1);
  }

  console.log('✅ 已連接到 Chrome');

  // 找到 NotebookLM 的頁面，或開新分頁
  const contexts = browser.contexts();
  let page = null;

  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      if (p.url().includes('notebooklm.google.com')) {
        page = p;
        break;
      }
    }
    if (page) break;
  }

  if (!page) {
    console.log('未找到 NotebookLM 頁面，正在開啟...');
    const ctx = contexts[0];
    page = await ctx.newPage();
    await page.goto('https://notebooklm.google.com/', { waitUntil: 'networkidle', timeout: 60000 });
  } else {
    console.log('✅ 找到已開啟的 NotebookLM 頁面');
  }

  // 提取 auth token
  let authToken: string | null = null;
  for (let i = 0; i < 15; i++) {
    try {
      authToken = await page.evaluate(() => {
        return (window as any).WIZ_global_data?.SNlM0e || null;
      });
      if (authToken) break;
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }

  if (!authToken) {
    console.error('❌ 無法取得 auth token，請確認已登入 NotebookLM');
    browser.close();
    process.exit(1);
  }
  console.log('✅ Auth token 取得成功');

  // 透過 CDP 取得所有 cookies（包括 HttpOnly）
  const context = page.context();
  const cdpSession = await context.newCDPSession(page);
  const { cookies: cdpCookies } = await cdpSession.send('Network.getAllCookies');

  const googleCookies = cdpCookies.filter((c: any) => c.domain.includes('google'));
  const cookieString = googleCookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
  console.log(`✅ 取得 ${googleCookies.length} 個 Google cookies`);

  const keyNames = ['SID', '__Secure-1PSID', 'HSID', 'SSID', 'SAPISID'];
  for (const name of keyNames) {
    const found = googleCookies.find((c: any) => c.name === name);
    console.log(`  ${found ? '✅' : '❌'} ${name}`);
  }

  // 不關閉 browser（那是使用者的 Chrome）
  browser.disconnect();

  // 儲存
  await saveCredentials({ authToken, cookies: cookieString });
  console.log('\n✅ Credentials 已儲存');

  // 驗證
  console.log('驗證連線中...');
  const client = new NotebookLMClient({ authToken, cookies: cookieString, autoRefresh: false });
  try {
    await client.connect();
    const notebooks = await client.notebooks.list();
    console.log(`✅ 連線成功！目前有 ${notebooks.length} 個 notebook`);
    client.dispose();
  } catch (err) {
    console.error('❌ 驗證失敗：', err instanceof Error ? err.message : String(err));
    client.dispose();
    process.exit(1);
  }
}

main();
