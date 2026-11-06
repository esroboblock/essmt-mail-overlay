import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Opt-in: an isolated ESSMT server seeded ONLY with the synthetic 101–104 contract.
// Credentials come from local environment, never a tracked file or test attachment.
test('isolated ESSMT employee password login → installed worker → tags → logout', async () => {
  test.skip(!process.env.ESSMT_TEST_ORIGIN, 'Isolated HTTPS ESSMT environment not supplied');
  const origin = process.env.ESSMT_TEST_ORIGIN;
  const dir = await mkdtemp(path.join(tmpdir(), 'overlay-live-'));
  const extension = path.join(dir, 'extension');
  await cp('extension', extension, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json')));
  manifest.host_permissions = [origin + '/*'];
  if (process.env.ESSMT_TEST_EXTENSION_KEY) manifest.key = process.env.ESSMT_TEST_EXTENSION_KEY;
  await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(extension, 'config.js'), 'globalThis.ESSMT_CONFIG = ' + JSON.stringify({ origin, namespace: process.env.ESSMT_TEST_NAMESPACE, demoNamespace: 'demo:naver:account-a' }));
  const context = await chromium.launchPersistentContext(path.join(dir, 'profile'), { channel: 'chromium', headless: true, ignoreHTTPSErrors: true, args: ['--ignore-certificate-errors', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage(); await page.goto('http://127.0.0.1:4173');
    const first = page.locator('[data-demo-row="row-101"]');
    await expect(first.locator('.essmt-tag')).toHaveCount(2);
    const options = await context.newPage(); await options.goto(`chrome-extension://${id}/options.html`);
    await options.locator('#mode').selectOption('essmt');
    await expect(first).toHaveAttribute('data-essmt-error', 'HTTP_401');
    const login = await context.newPage(); await login.goto(origin + '/login');
    // No locator assertions include the password value; tracing is disabled for this test.
    await login.locator('[name="full_name"]').fill(process.env.ESSMT_TEST_FULL_NAME);
    await login.locator('[name="password"]').fill(process.env.ESSMT_TEST_PASSWORD);
    await login.locator('button[type="submit"]').click();
    await expect(login).not.toHaveURL(/\/login(?:\?|$)/);
    const session = (await context.cookies(origin)).find(cookie => cookie.name === 'session');
    expect(session?.httpOnly).toBe(true);
    expect(session?.secure).toBe(true);
    expect(session?.sameSite).toBe('Lax');
    await page.locator('#refresh').click();
    await expect(first.locator('.essmt-tag')).toHaveText('합성 HTTP 태그');
    for (const [sn, state] of [['102', 'no-tags'], ['103', 'unmatched'], ['104', 'ambiguous']]) await expect(page.locator(`[data-demo-row="row-${sn}"]`)).toHaveAttribute('data-essmt-state', state);
    // Real auth route; do not read/copy session cookies into extension or page bridge.
    await login.evaluate(async () => { await fetch('/logout', { method: 'POST', credentials: 'include' }); });
    await page.locator('#refresh').click(); await expect(first).toHaveAttribute('data-essmt-error', 'HTTP_401');
    await expect(page.locator('.essmt-tag')).toHaveCount(0);
    if (process.env.ESSMT_TEST_UNGRANTED_NAME) {
      await login.goto(origin + '/login');
      await login.locator('[name="full_name"]').fill(process.env.ESSMT_TEST_UNGRANTED_NAME);
      await login.locator('[name="password"]').fill(process.env.ESSMT_TEST_PASSWORD);
      await login.locator('button[type="submit"]').click();
      await expect(login).not.toHaveURL(/\/login(?:\?|$)/);
      await page.locator('#refresh').click();
      await expect(first).toHaveAttribute('data-essmt-error', 'HTTP_403');
      await expect(page.locator('.essmt-tag')).toHaveCount(0);
    }
  } finally { await context.close(); await rm(dir, { recursive: true, force: true }); }
});
// Avoid storing employee login actions/values in Playwright traces or screenshots.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
