import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { buildExtension } from '../../scripts/build-extension.mjs';
import { inbox, allMail, blockRealNaver, mountNaverFixture, refreshNaverFixture } from './naver-essmt-fixture.js';

// Actual HTTPS, Secure/HttpOnly/SameSite=Lax cookie and installed MV3 worker.
// Synthetic transport server is deliberately distinct from ESSMT employee auth.
for (const naver of [false, true]) test(`${naver ? 'Naver fixture' : 'Demo'} ESSMT mode uses worker cookies, handles logout/grant/errors and invalidates stale bindings`, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'overlay-https-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  let denied = false, errorStatus = 0, delay = 0, malformed = false;
  const requests = [];
  const server = https.createServer({ key: await readFile(path.join(dir, 'key.pem')), cert: await readFile(path.join(dir, 'cert.pem')) }, async (req, res) => {
    if (req.url === '/login') { res.setHeader('Set-Cookie', 'synthetic_employee=yes; Secure; HttpOnly; SameSite=Lax; Path=/'); res.end('signed in'); return; }
    if (req.url === '/logout') { res.setHeader('Set-Cookie', 'synthetic_employee=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); res.end('signed out'); return; }
    if (req.url !== '/api/browser-overlay/email-tags/lookup') { res.writeHead(404).end(); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ cookie: req.headers.cookie, headers: req.headers, body: JSON.parse(body) });
    if (errorStatus === -1) { req.socket.destroy(); return; }
    const status = errorStatus || (req.headers.cookie?.includes('synthetic_employee=yes') ? (denied ? 403 : 200) : 401);
    const input = JSON.parse(body);
    const reply = { schema_version: 1, namespace: 'synthetic:naver:team', results: [...new Set(input.messages.map(m => m.mail_sn))].map(mail_sn => ({ mail_sn, status: mail_sn === '103' ? 'unmatched' : mail_sn === '104' ? 'ambiguous' : 'matched', candidate_count: mail_sn === '103' ? 0 : mail_sn === '104' ? 2 : 1, tags: mail_sn === '101' ? [{ id: '7', name: 'HTTPS 합성 태그' }] : [] })) };
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(malformed ? {} : reply));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `https://localhost:${server.address().port}`;
  const extension = await buildExtension({ origin, namespace: 'synthetic:naver:team', naver, destination: path.join(dir, 'extension') });
  const context = await chromium.launchPersistentContext(path.join(dir, 'profile'), { channel: 'chromium', headless: true, ignoreHTTPSErrors: true, args: ['--ignore-certificate-errors', blockRealNaver, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    if (naver) {
      await mountNaverFixture(context);
      await page.goto(new URL('/v2/folders/1/all', inbox).href);
      await expect(page.locator('[data-essmt-state]')).toHaveCount(0);
      await page.evaluate(url => history.pushState({}, '', url), inbox);
      const row = sn => page.locator(`[data-row="${sn}"]`);
      const first = row('101');
      const badges = first.locator('a + [data-essmt-tags] .essmt-tag');
      await expect(badges).toHaveText('Mock · 합성 태그');
      expect(requests).toHaveLength(0);
      const extraInbox = await context.newPage();
      await extraInbox.goto(inbox);
      const extraBadges = extraInbox.locator('[data-row="101"] .essmt-tag');
      await expect(extraBadges).toHaveText('Mock · 합성 태그');
      const options = await context.newPage(); await options.goto(`chrome-extension://${id}/options.html`);
      await options.locator('#mode').selectOption('essmt');
      await expect(badges).toHaveCount(0);
      await expect(extraBadges).toHaveCount(0);
      expect(requests).toHaveLength(0);
      await options.locator('#confirm-inbox').click();
      await expect(options.getByRole('status')).toHaveText('이 창에 받은메일함 또는 전체메일 탭을 하나만 열고 다시 확인하세요.');
      expect(requests).toHaveLength(0);
      await extraInbox.close();
      await worker.evaluate(() => {
        const set = chrome.storage.session.set.bind(chrome.storage.session);
        chrome.storage.session.set = async (...args) => {
          await new Promise(resolve => { globalThis.releaseConfirmation = resolve; });
          chrome.storage.session.set = set;
          return set(...args);
        };
      });
      await options.locator('#confirm-inbox').click();
      await expect.poll(() => worker.evaluate(() => typeof globalThis.releaseConfirmation)).toBe('function');
      await page.evaluate(url => {
        history.pushState({}, '', '/v2/folders/1/all');
        history.pushState({}, '', url);
      }, inbox);
      await worker.evaluate(() => globalThis.releaseConfirmation());
      await expect(options.getByRole('status')).toHaveText('이 창에 받은메일함 또는 전체메일 탭을 하나만 열고 다시 확인하세요.');
      expect(requests).toHaveLength(0);
      const confirm = async () => {
        await options.locator('#confirm-inbox').click();
        await expect(options.getByRole('status')).toHaveText('현재 메일 목록의 연결을 확인했습니다.');
      };
      await confirm();
      await expect(first).toHaveAttribute('data-essmt-error', 'HTTP_401');
      expect(requests.at(-1).body).toEqual({
        namespace: 'synthetic:naver:team',
        messages: ['101', '102', '103', '104'].map(mail_sn => ({ mail_sn, folder_sn: '0' }))
      });
      const login = await context.newPage(); await login.goto(origin + '/login');
      const refresh = () => refreshNaverFixture(page);
      await refresh();
      await expect(badges).toHaveText('HTTPS 합성 태그');
      expect(requests.at(-1).cookie).toBe('synthetic_employee=yes');
      for (const [sn, state] of [['102', 'no-tags'], ['103', 'unmatched'], ['104', 'ambiguous'], ['2147483648', 'unidentified']]) {
        await expect(row(sn)).toHaveAttribute('data-essmt-state', state);
      }
      await first.getByRole('checkbox').check();
      await expect(first.getByRole('checkbox')).toBeChecked();
      denied = true;
      await refresh();
      await expect(first).toHaveAttribute('data-essmt-error', 'HTTP_403');
      await expect(badges).toHaveCount(0);
      denied = false;
      for (const [status, code] of [[422, 'HTTP_422'], [503, 'HTTP_503'], [-1, 'NETWORK_ERROR']]) {
        errorStatus = status;
        await refresh();
        await expect(first).toHaveAttribute('data-essmt-error', code);
        await expect(badges).toHaveCount(0);
      }
      errorStatus = 0;
      malformed = true;
      await refresh();
      await expect(first).toHaveAttribute('data-essmt-error', 'INVALID_RESPONSE');
      await expect(badges).toHaveCount(0);
      malformed = false;
      delay = 4750;
      await refresh();
      await expect(first).toHaveAttribute('data-essmt-error', 'NETWORK_TIMEOUT', { timeout: 7000 });
      await expect(badges).toHaveCount(0);
      delay = 0;
      await refresh();
      await expect(badges).toHaveText('HTTPS 합성 태그');
      delay = 500;
      const before = requests.length;
      await refresh();
      await expect.poll(() => requests.length).toBeGreaterThan(before);
      await page.evaluate(() => {
        const root = document.querySelector('.mail_list');
        const replacement = root.cloneNode(true);
        const row = replacement.querySelector('[data-row="101"]');
        row.className = 'mail_item mail-102';
        row.querySelector('a').setAttribute('href', '/v2/popup/read/0/102');
        root.replaceWith(replacement);
      });
      await expect(first).not.toHaveAttribute('data-essmt-state', /.+/);
      await expect(badges).toHaveCount(0);
      await confirm();
      await expect(first).toHaveAttribute('data-essmt-state', 'no-tags');
      await expect(badges).toHaveCount(0);
      await page.evaluate(() => {
        const row = document.querySelector('[data-row="101"]');
        row.className = 'mail_item mail-101';
        row.querySelector('a').setAttribute('href', '/v2/popup/read/0/101');
      });
      await expect(badges).toHaveText('HTTPS 합성 태그');
      await page.evaluate(() => history.pushState({}, '', '/v2/folders/1/all'));
      await expect(page.locator('[data-essmt-state]')).toHaveCount(0);
      await page.evaluate(url => history.pushState({}, '', url), inbox);
      await expect(page.locator('[data-essmt-state]')).toHaveCount(0);
      await confirm();
      await expect(first).toHaveAttribute('data-essmt-state', 'loading');
      await options.locator('#mode').selectOption('mock');
      await expect(badges).toHaveText('Mock · 합성 태그');
      await page.waitForTimeout(delay);
      await expect(badges).toHaveText('Mock · 합성 태그');
      delay = 0;
      await options.locator('#mode').selectOption('essmt');
      await expect(badges).toHaveCount(0);
      await confirm();
      await expect(badges).toHaveText('HTTPS 합성 태그');
      const beforeAllMail = requests.length;
      await page.evaluate(url => {
        history.pushState({}, '', url);
        document.querySelector('[data-row="101"] a').setAttribute('href', '/v2/popup/read/42/101');
      }, allMail);
      await expect(page).toHaveURL(allMail);
      await expect(page.locator('[data-essmt-state]')).toHaveCount(0);
      expect(requests).toHaveLength(beforeAllMail);
      await confirm();
      await expect(badges).toHaveText('HTTPS 합성 태그');
      expect(requests.at(-1).body.messages).toEqual([
        { mail_sn: '101', folder_sn: '42' },
        ...['102', '103', '104'].map(mail_sn => ({ mail_sn, folder_sn: '0' }))
      ]);
      await login.goto(origin + '/logout');
      await refresh();
      await expect(first).toHaveAttribute('data-essmt-error', 'HTTP_401');
      await expect(badges).toHaveCount(0);
      const beforeReload = requests.length;
      await page.reload();
      await expect(page.locator('[data-essmt-state]')).toHaveCount(0);
      expect(requests).toHaveLength(beforeReload);
      return;
    }
    await page.goto('http://127.0.0.1:4173');
    const first = page.locator('[data-demo-row="row-101"]');
    await expect(first.locator('.essmt-tag')).toContainText(['합성 분류 가', '합성 분류 나']);
    const options = await context.newPage(); await options.goto(`chrome-extension://${id}/options.html`);
    await options.locator('#mode').selectOption('essmt');
    await expect(first).toHaveAttribute('data-essmt-error', 'HTTP_401');
    const login = await context.newPage(); await login.goto(origin + '/login');
    await page.locator('#refresh').click();
    await expect(first.locator('.essmt-tag')).toHaveText('HTTPS 합성 태그');
    expect(requests.at(-1).cookie).toBe('synthetic_employee=yes');
    expect(requests.at(-1).headers['x-essmt-overlay']).toBe('1');
    expect(requests.at(-1).body.namespace).toBe('synthetic:naver:team');
    for (const [sn, state] of [['102', 'no-tags'], ['103', 'unmatched'], ['104', 'ambiguous']]) await expect(page.locator(`[data-demo-row="row-${sn}"]`)).toHaveAttribute('data-essmt-state', state);
    denied = true; await page.locator('#refresh').click(); await expect(first).toHaveAttribute('data-essmt-error', 'HTTP_403');
    await expect(page.locator('.essmt-tag')).toHaveCount(0); denied = false;
    for (const status of [422, 500]) { errorStatus = status; await page.locator('#refresh').click(); await expect(first).toHaveAttribute('data-essmt-error', `HTTP_${status}`); }
    errorStatus = 0;
    const oldRow = await first.evaluate(el => el.outerHTML);
    await page.locator('#account').selectOption('demo:naver:account-b');
    await expect(page.locator('.mail_item')).toHaveCount(0);
    // Even stale rows inserted under a foreign account must never query the dataset.
    await page.evaluate(html => document.querySelector('.mail_list').insertAdjacentHTML('beforeend', html), oldRow);
    await expect(page.locator('.mail_item').first()).toHaveAttribute('data-essmt-error', 'ACCOUNT_NOT_BOUND');
    await expect(page.locator('.essmt-tag')).toHaveCount(0);
    await page.locator('#account').selectOption('demo:naver:account-a');
    await expect(first.locator('.essmt-tag')).toHaveText('HTTPS 합성 태그');
    delay = 1000; const before = requests.length;
    await page.locator('#refresh').click(); await expect.poll(() => requests.length).toBeGreaterThan(before);
    await options.locator('#mode').selectOption('mock');
    await expect(first.locator('.essmt-tag')).toContainText(['합성 분류 가', '합성 분류 나']);
    await page.waitForTimeout(1200); await expect(first.locator('.essmt-tag')).not.toContainText(['HTTPS 합성 태그']); delay = 0;
    await options.locator('#mode').selectOption('essmt'); await expect(first.locator('.essmt-tag')).toHaveText('HTTPS 합성 태그');
    await login.goto(origin + '/logout'); await page.locator('#refresh').click();
    await expect(first).toHaveAttribute('data-essmt-error', 'HTTP_401'); await expect(page.locator('.essmt-tag')).toHaveCount(0);
  } finally { await context.close(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});
