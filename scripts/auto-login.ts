/**
 * 使用既有 Chrome profile 提取 NotebookLM credentials
 *
 * 透過攔截瀏覽器真實的 batchexecute 請求，取得正確的 cookie 字串，
 * 確保跟瀏覽器實際發送的完全一致。
 */
import { chromium } from 'playwright';
import { saveCredentials, NotebookLMClient } from 'notebooklm-kit';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function main() {
  console.log('=== NotebookLM Credentials 提取 ===\n');

  const chromeProfileDir = path.join(
    os.homedir(),
    'Library/Application Support/Google/Chrome'
  );

  if (!fs.existsSync(chromeProfileDir)) {
    console.error('❌ 找不到 Chrome profile 目錄：', chromeProfileDir);
    process.exit(1);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-'));
  console.log('正在複製 Chrome profile...');

  const filesToCopy = ['Default/Cookies', 'Default/Login Data', 'Local State'];
  for (const file of filesToCopy) {
    const src = path.join(chromeProfileDir, file);
    const dest = path.join(tmpDir, file);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
  console.log('✅ Profile 複製完成\n');

  // 設定攔截：在瀏覽器發出請求前就開始攔截
  let capturedCookies = '';

  const context = await chromium.launchPersistentContext(tmpDir, {
    channel: 'chrome',
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  // 提前設定路由攔截，捕獲所有 batchexecute 請求的真實 cookies
  await page.route('**/batchexecute**', async (route) => {
    const req = route.request();
    const cookies = req.headers()['cookie'] || '';
    if (cookies.length > capturedCookies.length) {
      capturedCookies = cookies;
    }
    await route.continue();
  });

  console.log('正在開啟 NotebookLM...');
  await page.goto('https://notebooklm.google.com/', {
    waitUntil: 'networkidle',
    timeout: 120000,
  });

  const currentUrl = page.url();
  if (currentUrl.includes('accounts.google.com')) {
    console.log('\n⚠️  需要登入，請在瀏覽器中手動完成（最多 3 分鐘）...');
    await page.waitForURL('**/notebooklm.google.com/**', { timeout: 180000 });
    console.log('✅ 登入完成！');
    // 重新載入以觸發 batchexecute 請求
    await page.goto('https://notebooklm.google.com/', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
  }

  // 等待攔截到 cookies
  await page.waitForTimeout(3000);

  if (!capturedCookies) {
    console.log('未攔截到請求，重新載入頁面...');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
  }

  // 提取 WIZ_global_data
  let authToken: string | null = null;
  let fSid: string | null = null;
  let buildLabel: string | null = null;

  for (let i = 0; i < 15; i++) {
    const data = await page.evaluate(() => {
      const w = (window as any).WIZ_global_data;
      return {
        authToken: w?.SNlM0e || null,
        fSid: w?.FdrFJe || null,
        buildLabel: w?.cfb2h || null,
      };
    });
    authToken = data.authToken;
    fSid = data.fSid;
    buildLabel = data.buildLabel;
    if (authToken) break;
    console.log(`等待 auth token...（${i + 1}/15）`);
    await page.waitForTimeout(2000);
  }

  if (!authToken) {
    console.error('❌ 無法取得 auth token');
    await context.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }

  console.log('✅ Auth token 取得成功');
  console.log(`  Build label (bl): ${buildLabel || '未取得'}`);
  console.log(`  F.sid: ${fSid ? fSid.substring(0, 20) + '...' : '未取得'}`);
  console.log(`  Cookie 長度: ${capturedCookies.length} 字元`);

  // 關鍵 cookie 檢查
  const keyNames = ['SID', '__Secure-1PSID', 'HSID', 'SSID', 'SAPISID'];
  for (const name of keyNames) {
    const found = capturedCookies.includes(`${name}=`);
    console.log(`  ${found ? '✅' : '❌'} ${name}`);
  }

  await context.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (!capturedCookies) {
    console.error('❌ 無法攔截到瀏覽器的 cookies');
    process.exit(1);
  }

  // 使用攔截到的真實 cookies 儲存
  await saveCredentials({ authToken, cookies: capturedCookies });
  console.log('\n✅ Credentials 已儲存至 credentials.json（使用瀏覽器真實 cookies）');

  // 儲存 build config
  if (buildLabel || fSid) {
    fs.writeFileSync(
      path.join(process.cwd(), 'notebooklm-config.json'),
      JSON.stringify({ buildLabel, fSid }, null, 2)
    );
  }

  // 驗證連線
  console.log('\n驗證連線中...');
  const clientConfig: any = {
    authToken,
    cookies: capturedCookies,
    autoRefresh: false,
  };
  if (buildLabel || fSid) {
    clientConfig.urlParams = {};
    if (buildLabel) clientConfig.urlParams['bl'] = buildLabel;
    if (fSid) clientConfig.urlParams['f.sid'] = fSid;
  }

  const client = new NotebookLMClient(clientConfig);
  try {
    await client.connect();
    const notebooks = await client.notebooks.list();
    console.log(`✅ 連線成功！目前有 ${notebooks.length} 個 notebook`);
    client.dispose();
  } catch (err) {
    console.error('❌ Client 驗證失敗：', err instanceof Error ? err.message : String(err));
    client.dispose();
    process.exit(1);
  }
}

main();
