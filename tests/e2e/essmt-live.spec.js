import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildExtension } from '../../scripts/build-extension.mjs';
import { inbox, blockRealNaver, mountNaverFixture, refreshNaverFixture } from './naver-essmt-fixture.js';

// Opt-in: an isolated ESSMT server seeded ONLY with the synthetic 101–104 contract.
// Credentials come from local environment, never a tracked file or test attachment.
for (const naver of [false, true]) test(`${naver ? 'Naver fixture' : 'Demo'} → installed worker → isolated ESSMT password login, tags and logout`, async () => {
  test.skip(!process.env.ESSMT_TEST_ORIGIN, 'Isolated HTTPS ESSMT environment not supplied');
  const origin = process.env.ESSMT_TEST_ORIGIN;
  const dir = await mkdtemp(path.join(tmpdir(), 'overlay-live-'));
  const extension = await buildExtension({ origin, namespace: process.env.ESSMT_TEST_NAMESPACE, naver, destination: path.join(dir, 'extension') });
  if (process.env.ESSMT_TEST_EXTENSION_KEY) {
    const manifestPath = path.join(extension, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath));
    manifest.key = process.env.ESSMT_TEST_EXTENSION_KEY;
    await writeFile(manifestPath, JSON.stringify(manifest));
  }
  const context = await chromium.launchPersistentContext(path.join(dir, 'profile'), { channel: 'chromium', headless: true, ignoreHTTPSErrors: true, args: ['--ignore-certificate-errors', blockRealNaver, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    if (naver) await mountNaverFixture(context);
    const page = await context.newPage(); await page.goto(naver ? inbox : 'http://127.0.0.1:4173');
    const row = sn => page.locator(naver ? `[data-row="${sn}"]` : `[data-demo-row="row-${sn}"]`);
    const first = row('101');
    const refresh = () => naver ? refreshNaverFixture(page) : page.locator('#refresh').click();
    await expect(first.locator('.essmt-tag')).toHaveCount(naver ? 1 : 2);
    const options = await context.newPage(); await options.goto(`chrome-extension://${id}/options.html`);
    await options.locator('#mode').selectOption('essmt');
    if (naver) await options.locator('#confirm-inbox').click();
    await expect(first).toHaveAttribute('data-essmt-error', 'HTTP_401');
    const login = await context.newPage();
    // Keep unrelated dashboard requests from racing with logout's Set-Cookie.
    await login.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === origin && ['/login', '/logout'].includes(url.pathname)
        ? route.continue()
        : route.fulfill({ status: 200, contentType: 'text/html', body: '' });
    });
    await login.goto(origin + '/login');
    // No locator assertions include the password value; tracing is disabled for this test.
    await login.locator('[name="full_name"]').fill(process.env.ESSMT_TEST_FULL_NAME);
    await login.locator('[name="password"]').fill(process.env.ESSMT_TEST_PASSWORD);
    await login.locator('button[type="submit"]').click();
    await expect(login).not.toHaveURL(/\/login(?:\?|$)/);
    const session = (await context.cookies(origin)).find(cookie => cookie.name === 'session');
    expect(session?.httpOnly).toBe(true);
    expect(session?.secure).toBe(true);
    expect(session?.sameSite).toBe('Lax');
    await refresh();
    await expect(first.locator('.essmt-tag')).toHaveText('합성 HTTP 태그');
    for (const [sn, state] of [['102', 'no-tags'], ['103', 'unmatched'], ['104', 'ambiguous']]) await expect(row(sn)).toHaveAttribute('data-essmt-state', state);
    // Real auth route; do not read/copy session cookies into extension or page bridge.
    await login.evaluate(() => {
      const form = document.createElement('form');
      form.action = '/logout';
      form.method = 'POST';
      document.body.append(form);
      form.submit();
    });
    await login.waitForURL(origin + '/login', { timeout: 8000 });
    await expect.poll(async () => (await context.cookies(origin)).some(cookie => cookie.name === 'session')).toBe(false);
    await refresh(); await expect(first).toHaveAttribute('data-essmt-error', 'HTTP_401');
    await expect(page.locator('.essmt-tag')).toHaveCount(0);
    if (process.env.ESSMT_TEST_UNGRANTED_NAME) {
      await login.goto(origin + '/login');
      await login.locator('[name="full_name"]').fill(process.env.ESSMT_TEST_UNGRANTED_NAME);
      await login.locator('[name="password"]').fill(process.env.ESSMT_TEST_PASSWORD);
      await login.locator('button[type="submit"]').click();
      await expect(login).not.toHaveURL(/\/login(?:\?|$)/);
      await refresh();
      await expect(first).toHaveAttribute('data-essmt-error', 'HTTP_403');
      await expect(page.locator('.essmt-tag')).toHaveCount(0);
    }
  } finally { await context.close(); await rm(dir, { recursive: true, force: true }); }
});
// Avoid storing employee login actions/values in Playwright traces or screenshots.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
