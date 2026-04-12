/**
 * 用攔截到的瀏覽器真實 cookies 直接測試 API 呼叫
 * 確認問題是在 cookie 提取還是 notebooklm-kit 本身
 */
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  // 讀取 notebooklm-config.json 中攔截到的資訊
  const configPath = path.join(process.cwd(), 'notebooklm-config.json');
  if (!fs.existsSync(configPath)) {
    console.error('❌ 請先執行 auto-login.ts 取得 config');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const { buildLabel, fSid, capturedHeaders, capturedUrl } = config;

  // 讀取 credentials.json 中儲存的資料
  const creds = JSON.parse(fs.readFileSync('credentials.json', 'utf-8'));

  console.log('=== 測試 1: 用我們提取的 cookies + 正確 bl/f.sid ===');
  await testFetch({
    cookies: creds.cookies,
    authToken: creds.authToken,
    bl: buildLabel,
    fSid: fSid,
    label: '提取的 cookies',
  });

  console.log('\n=== 測試 2: 用瀏覽器攔截到的真實 cookies ===');
  if (capturedHeaders?.cookie) {
    await testFetch({
      cookies: capturedHeaders.cookie,
      authToken: creds.authToken,
      bl: buildLabel,
      fSid: fSid,
      label: '瀏覽器真實 cookies',
    });
  } else {
    console.log('❌ 沒有攔截到的 cookies');
  }

  console.log('\n=== 測試 3: 用瀏覽器 cookies + 完整 headers ===');
  if (capturedHeaders) {
    await testFetchFull({
      headers: capturedHeaders,
      authToken: creds.authToken,
      bl: buildLabel,
      fSid: fSid,
    });
  }
}

async function testFetch(opts: { cookies: string; authToken: string; bl: string; fSid: string; label: string }) {
  const rpcId = 'wXbhsf';
  const args = JSON.stringify([null, 1, null, [2]]);
  const fReq = JSON.stringify([[[rpcId, args, null, 'generic']]]);

  const formData = new URLSearchParams();
  formData.set('f.req', fReq);
  formData.set('at', opts.authToken);

  const url = new URL('https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute');
  url.searchParams.set('rpcids', rpcId);
  url.searchParams.set('source-path', '/');
  url.searchParams.set('bl', opts.bl);
  url.searchParams.set('f.sid', opts.fSid);
  url.searchParams.set('hl', 'zh-TW');
  url.searchParams.set('_reqid', '123456');
  url.searchParams.set('rt', 'c');

  try {
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Cookie': opts.cookies,
        'Origin': 'https://notebooklm.google.com',
        'Referer': 'https://notebooklm.google.com/',
        'x-same-domain': '1',
        'Accept': '*/*',
      },
      body: formData.toString(),
    });

    const body = await resp.text();
    console.log(`[${opts.label}] HTTP ${resp.status}, ${body.length} 字元`);
    if (resp.status === 200 && body.length > 200) {
      console.log(`✅ 成功！`);
      console.log(`回應前 200 字元: ${body.substring(0, 200)}`);
    } else {
      console.log(`❌ 失敗`);
      console.log(`回應: ${body.substring(0, 300)}`);
    }
  } catch (err: any) {
    console.error(`❌ 錯誤: ${err.message}`);
  }
}

async function testFetchFull(opts: { headers: Record<string, string>; authToken: string; bl: string; fSid: string }) {
  const rpcId = 'wXbhsf';
  const args = JSON.stringify([null, 1, null, [2]]);
  const fReq = JSON.stringify([[[rpcId, args, null, 'generic']]]);

  const formData = new URLSearchParams();
  formData.set('f.req', fReq);
  formData.set('at', opts.authToken);

  const url = new URL('https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute');
  url.searchParams.set('rpcids', rpcId);
  url.searchParams.set('source-path', '/');
  url.searchParams.set('bl', opts.bl);
  url.searchParams.set('f.sid', opts.fSid);
  url.searchParams.set('hl', 'zh-TW');
  url.searchParams.set('_reqid', '123456');
  url.searchParams.set('rt', 'c');

  // 使用瀏覽器完全相同的 headers
  const headers = { ...opts.headers };
  // 確保 content-type 正確（瀏覽器可能發送帶 charset 的版本）
  headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8';

  try {
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: formData.toString(),
    });

    const body = await resp.text();
    console.log(`[完整 headers] HTTP ${resp.status}, ${body.length} 字元`);
    if (resp.status === 200 && body.length > 200) {
      console.log(`✅ 成功！`);
      console.log(`回應前 200 字元: ${body.substring(0, 200)}`);
    } else {
      console.log(`❌ 失敗`);
      console.log(`回應: ${body.substring(0, 300)}`);
    }
  } catch (err: any) {
    console.error(`❌ 錯誤: ${err.message}`);
  }
}

main();
