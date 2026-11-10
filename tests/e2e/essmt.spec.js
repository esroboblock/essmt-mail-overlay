import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm, cp, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import https from 'node:https';

// Actual HTTPS, Secure/HttpOnly/SameSite=Lax cookie and installed MV3 worker.
// Synthetic transport server is deliberately distinct from ESSMT employee auth.
test('ESSMT mode uses worker cookies, handles logout/grant/errors and invalidates account/mode changes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'overlay-https-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  let denied = false, errorStatus = 0, delay = 0;
  const requests = [];
  const server = https.createServer({ key: await readFile(path.join(dir, 'key.pem')), cert: await readFile(path.join(dir, 'cert.pem')) }, async (req, res) => {
    if (req.url === '/login') { res.setHeader('Set-Cookie', 'synthetic_employee=yes; Secure; HttpOnly; SameSite=Lax; Path=/'); res.end('signed in'); return; }
    if (req.url === '/logout') { res.setHeader('Set-Cookie', 'synthetic_employee=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); res.end('signed out'); return; }
    if (req.url !== '/api/browser-overlay/email-tags/lookup') { res.writeHead(404).end(); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ cookie: req.headers.cookie, headers: req.headers, body: JSON.parse(body) });
    const status = errorStatus || (req.headers.cookie?.includes('synthetic_employee=yes') ? (denied ? 403 : 200) : 401);
    const input = JSON.parse(body);
    const reply = { schema_version: 1, namespace: 'synthetic:naver:team', results: [...new Set(input.messages.map(m => m.mail_sn))].map(mail_sn => ({ mail_sn, status: mail_sn === '103' ? 'unmatched' : mail_sn === '104' ? 'ambiguous' : 'matched', candidate_count: mail_sn === '103' ? 0 : mail_sn === '104' ? 2 : 1, tags: mail_sn === '101' ? [{ id: '7', name: 'HTTPS 합성 태그' }] : [] })) };
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(reply));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `https://localhost:${server.address().port}`;
  const extension = path.join(dir, 'extension');
  await cp('extension', extension, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'))); manifest.host_permissions = [origin + '/*'];
  await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(extension, 'config.js'), 'globalThis.ESSMT_CONFIG = ' + JSON.stringify({ origin, namespace: 'synthetic:naver:team', demoNamespace: 'demo:naver:account-a' }));
  const context = await chromium.launchPersistentContext(path.join(dir, 'profile'), { channel: 'chromium', headless: true, ignoreHTTPSErrors: true, args: ['--ignore-certificate-errors', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage(); await page.goto('http://127.0.0.1:4173');
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
