import { test as base, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Real MV3 installation in bundled Chromium, with an isolated ephemeral profile.
const test = base.extend({
  context: async ({}, use) => {
    const profile = await mkdtemp(path.join(tmpdir(), 'essmt-extension-'));
    const extension = path.resolve('extension');
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      baseURL: 'http://127.0.0.1:4173'
    });
    try { await use(context); } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
  },
  page: async ({ context }, use) => { const page = await context.newPage(); await use(page); }
});
const row = (page, id) => page.locator(`[data-demo-row="${id}"]`);
const badge = '[data-essmt-tags]';
async function ready(page) {
  await page.goto('/');
  await expect(row(page, 'row-101').locator(badge)).toContainText('합성 분류 가');
}
async function scenario(page, value) {
  await page.locator('#scenario').selectOption(value);
  await expect(page.locator('#demo-root')).toHaveAttribute('data-demo-ready', 'true');
}
async function watchRequests(page) {
  await page.evaluate(() => {
    window.tagRequests = [];
    window.addEventListener('message', event => {
      if (event.data?.channel === 'essmt-demo:request' && event.data.method === 'lookupTags') window.tagRequests.push(event.data);
    });
  });
}
// This keeps li, title, link, badge and generation intact. Only the binding changes.
async function rebind(page, sn) {
  await page.evaluate(sn => {
    const item = document.querySelector('.mail_item');
    item.classList.remove(...[...item.classList].filter(c => c.startsWith('mail-')));
    item.classList.add(`mail-${sn}`);
    item.querySelector('.mail_title_link').setAttribute('href', `/v2/popup/read/0/${sn}`);
    item.querySelector('.text').textContent = `합성 연결 행 ${sn}`;
  }, sn);
}

test('installed extension inserts one safe container, batches unique IDs and distinguishes every result', async ({ page }) => {
  await page.goto('/');
  await expect(row(page, 'row-101').locator(badge)).toContainText('합성 분류 가');
  await expect(row(page, 'row-101').locator('.essmt-tag')).toHaveCount(2);
  for (const [id, state] of [['row-102', 'no-tags'], ['row-103', 'unmatched'], ['row-104', 'ambiguous'], ['row-missing', 'unidentified'], ['row-malformed', 'unidentified'], ['row-conflict', 'unidentified']]) {
    await expect(row(page, id)).toHaveAttribute('data-essmt-state', state);
    await expect(row(page, id).locator('.essmt-tag')).toHaveCount(0);
  }
  for (const id of ['row-105-a', 'row-105-b']) await expect(row(page, id).locator(badge)).toHaveCount(1);
  await watchRequests(page);
  await page.locator('#refresh').click();
  await expect(row(page, 'row-101').locator('.essmt-tag')).toHaveCount(2);
  const requests = await page.evaluate(() => window.tagRequests);
  expect(requests).toHaveLength(1);
  expect(requests[0].payload.messages.map(m => m.mail_sn)).toEqual(['101', '102', '103', '104', '105', '106']);
  await row(page, 'row-101').getByLabel('메일 선택').check();
  await row(page, 'row-101').getByLabel('읽음').check();
  await row(page, 'row-101').getByRole('button', { name: '중요 메일' }).click();
  await expect(row(page, 'row-101').locator(badge)).toHaveCount(1);
  await expect(row(page, 'row-101').getByLabel('메일 선택')).toBeChecked();
  expect(await row(page, 'row-101').locator(badge).evaluate(el => el.previousElementSibling.matches('a.mail_title_link'))).toBe(true);
  await row(page, 'row-101').locator('.mail_title_link').click();
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator(badge)).toHaveCount(0);
});

test('connected row mutation clears old badges without context events or child replacement', async ({ page }) => {
  await ready(page); await scenario(page, 'normal');
  await expect(page.locator('.essmt-tag')).toHaveCount(2);
  await page.evaluate(() => { window.savedRow = document.querySelector('.mail_item'); window.savedLink = window.savedRow.querySelector('a'); window.savedGeneration = document.querySelector('#demo-root').dataset.demoGeneration; });
  await rebind(page, '102');
  await expect(page.locator('.mail_item')).toHaveAttribute('data-essmt-state', 'no-tags');
  await expect(page.locator('.essmt-tag')).toHaveCount(0);
  expect(await page.evaluate(() => window.savedRow.isConnected && window.savedRow === document.querySelector('.mail_item') && window.savedLink === window.savedRow.querySelector('a') && window.savedGeneration === document.querySelector('#demo-root').dataset.demoGeneration)).toBe(true);
  await rebind(page, '101');
  await expect(page.locator('.essmt-tag')).toHaveCount(2);
  await page.evaluate(() => document.querySelector('a.mail_title_link').removeAttribute('href'));
  await expect(page.locator('.mail_item')).toHaveAttribute('data-essmt-state', 'unidentified');
  await expect(page.locator('.essmt-tag')).toHaveCount(0);
});

test('slow old reply cannot tag a connected reused row, even during A to B to A', async ({ page }) => {
  await ready(page); await scenario(page, 'normal');
  await page.locator('#fault').selectOption('slow');
  await expect(page.locator('.mail_item')).toHaveAttribute('data-essmt-state', 'loading');
  await watchRequests(page);
  await rebind(page, '102');
  await expect.poll(() => page.evaluate(() => window.tagRequests.length)).toBe(1);
  // Make the new request overlap the old one, and observe any incorrect insertion.
  await page.evaluate(() => {
    window.badTag = false;
    new MutationObserver(() => {
      const row = document.querySelector('.mail_item');
      if (row?.classList.contains('mail-102') && row.querySelector('.essmt-tag')) window.badTag = true;
    }).observe(document.querySelector('.mail_list'), { subtree: true, childList: true });
  });
  await expect(page.locator('.mail_item')).toHaveAttribute('data-essmt-state', 'no-tags', { timeout: 7000 });
  expect(await page.evaluate(() => window.badTag)).toBe(false);
  await rebind(page, '101');
  await expect(page.locator('.mail_item')).toHaveAttribute('data-essmt-state', 'loading');
  await rebind(page, '102');
  await expect.poll(() => page.evaluate(() => window.tagRequests.length)).toBe(3);
  await rebind(page, '101');
  await expect(page.locator('.essmt-tag')).toHaveCount(2, { timeout: 7000 });
  await expect(page.locator(badge)).toHaveCount(1);
});

test('detached reuse, search, pages, folders, account reset and repeated refresh stay consistent', async ({ page }) => {
  await ready(page); await scenario(page, 'reuse');
  await expect(page.locator('.essmt-tag')).toHaveCount(2);
  await page.locator('#reuse').click();
  await expect(page.locator('.mail_item')).toHaveAttribute('data-essmt-state', 'no-tags');
  await page.locator('#reuse').click();
  await expect(page.locator('.essmt-tag')).toHaveCount(2);
  await scenario(page, 'all');
  await page.locator('#page-size').selectOption('2');
  await expect(page.locator('.essmt-tag')).toHaveCount(2);
  await page.locator('#next').click();
  await expect(page.locator('.essmt-tag')).toHaveCount(0);
  await expect(page.locator('.mail_item').first()).toHaveAttribute('data-essmt-state', 'unmatched');
  await page.locator('#search').fill('중복'); await page.locator('#search-form').evaluate(el => el.requestSubmit());
  await expect(page.locator('.essmt-tag')).toHaveCount(2);
  await page.getByRole('button', { name: '보낸메일함', exact: true }).click();
  await expect(page.locator('.essmt-tag')).toHaveCount(1);
  await page.locator('#account').selectOption('demo:naver:account-b');
  await expect(page.locator(badge)).toHaveCount(0);
  await page.locator('#reset').click();
  await expect(row(page, 'row-101').locator('.essmt-tag')).toHaveCount(2);
  for (let i = 0; i < 3; i++) {
    await page.locator('#refresh').click();
    await expect(row(page, 'row-101').locator('.essmt-tag')).toHaveCount(2);
    await expect(row(page, 'row-101').locator(badge)).toHaveCount(1);
  }
});

for (const [fault, code] of [['401', 'UNAUTHORIZED'], ['403', 'FORBIDDEN'], ['500', 'SERVER_ERROR'], ['offline', 'OFFLINE'], ['timeout', 'TIMEOUT']]) {
  test(`extension ${fault} clears tags, preserves controls and recovers`, async ({ page }) => {
    await ready(page); await page.locator('#fault').selectOption(fault);
    await expect(row(page, 'row-101')).toHaveAttribute('data-essmt-state', 'error');
    await expect(row(page, 'row-101')).toHaveAttribute('data-essmt-error', code);
    await expect(page.locator('.essmt-tag')).toHaveCount(0);
    await row(page, 'row-101').getByLabel('메일 선택').check();
    await expect(row(page, 'row-101').getByLabel('메일 선택')).toBeChecked();
    await page.locator('#fault').selectOption('normal');
    await expect(row(page, 'row-101').locator('.essmt-tag')).toHaveCount(2);
    await expect(row(page, 'row-101')).not.toHaveAttribute('data-essmt-error');
  });
}

test('missing page bridge reaches client timeout without repeated requests', async ({ page }) => {
  await page.route('**/src/bridge.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export function installBridge() {}' }));
  await page.goto('/'); await watchRequests(page);
  await expect(row(page, 'row-101')).toHaveAttribute('data-essmt-error', 'BRIDGE_TIMEOUT', { timeout: 8000 });
  await expect(page.locator('.essmt-tag')).toHaveCount(0);
  await row(page, 'row-101').getByLabel('읽음').check();
  await expect(row(page, 'row-101')).toHaveAttribute('data-essmt-error', 'BRIDGE_TIMEOUT');
  expect((await page.evaluate(() => window.tagRequests)).length).toBeLessThanOrEqual(1);
});

test('slow response cannot cross account and reset boundaries', async ({ page }) => {
  await ready(page); await page.locator('#fault').selectOption('slow');
  await expect(row(page, 'row-101')).toHaveAttribute('data-essmt-state', 'loading');
  await page.locator('#account').selectOption('demo:naver:account-b');
  await expect(page.locator(badge)).toHaveCount(0);
  await page.locator('#reset').click();
  await expect(row(page, 'row-101').locator('.essmt-tag')).toHaveCount(2);
  await expect(page.locator('.mail_item[data-essmt-state="loading"]')).toHaveCount(0);
});

test('tag names are literal text and badge layout stays visible in the demo', async ({ page }) => {
  await page.route('**/fixtures/tags.json', async route => {
    const response = await route.fetch(); const data = await response.json();
    data.tags[0].name = '<img src=x onerror=alert(1)>';
    await route.fulfill({ json: data });
  });
  await page.goto('/');
  const tags = row(page, 'row-101').locator('.essmt-tag');
  await expect(tags.first()).toHaveText('<img src=x onerror=alert(1)>');
  await expect(row(page, 'row-101').locator(`${badge} img`)).toHaveCount(0);
  await expect(tags.first()).toBeVisible();
  expect(await tags.first().evaluate(el => {
    const bounds = el.getBoundingClientRect(); const parent = el.parentElement.getBoundingClientRect();
    const title = el.closest('.mail_title').getBoundingClientRect();
    return Math.min(bounds.right, parent.right, title.right) - Math.max(bounds.left, parent.left, title.left);
  })).toBeGreaterThan(10);
});

test('more than 100 new unique IDs are split into bounded batches', async ({ page }) => {
  await ready(page); await scenario(page, 'normal');
  await expect(page.locator('.mail_item')).toHaveAttribute('data-essmt-state', 'matched');
  await watchRequests(page);
  await page.evaluate(() => {
    const source = document.querySelector('.mail_item');
    const fragment = document.createDocumentFragment();
    for (let index = 1000; index < 1101; index++) {
      const clone = source.cloneNode(true);
      clone.className = `mail_item mail-${index}`;
      clone.dataset.demoRow = `batch-${index}`;
      clone.removeAttribute('data-essmt-state');
      clone.querySelector('[data-essmt-tags]')?.remove();
      clone.querySelector('a.mail_title_link').setAttribute('href', `/v2/popup/read/0/${index}`);
      fragment.append(clone);
    }
    source.parentElement.append(fragment);
  });
  await expect(page.locator('.mail_item[data-essmt-state="unmatched"]')).toHaveCount(101);
  const batches = await page.evaluate(() => window.tagRequests.map(req => req.payload.messages));
  expect(batches.map(batch => batch.length)).toEqual([100, 1]);
  expect(new Set(batches.flat().map(m => m.mail_sn)).size).toBe(101);
  await expect(page.locator('.essmt-tag')).toHaveCount(2);
});

test('removed rows ignore pending replies and reinserted nodes get a new binding', async ({ page }) => {
  await ready(page); await scenario(page, 'normal');
  await page.locator('#fault').selectOption('slow');
  await expect(page.locator('.mail_item')).toHaveAttribute('data-essmt-state', 'loading');
  await page.evaluate(() => {
    window.detached = document.querySelector('.mail_item');
    window.detached.remove();
  });
  await expect.poll(() => page.evaluate(() => window.detached.getAttribute('data-essmt-state'))).toBe(null);
  // Reinsert without context/generation changes; this must start a fresh binding.
  await watchRequests(page);
  await page.evaluate(() => document.querySelector('.mail_list').append(window.detached));
  await expect.poll(() => page.evaluate(() => window.tagRequests.length)).toBe(1);
  await expect(page.locator('.mail_item')).toHaveAttribute('data-essmt-state', 'loading');
  await expect(page.locator('.essmt-tag')).toHaveCount(0);
  await expect(page.locator('.essmt-tag')).toHaveCount(2, { timeout: 7000 });
  await expect(page.locator(badge)).toHaveCount(1);
});

test('same-ID title-link reinsertion repairs badge placement and duplicate containers', async ({ page }) => {
  await ready(page); await scenario(page, 'normal');
  await expect(page.locator('.essmt-tag')).toHaveCount(2);
  await watchRequests(page);
  await page.evaluate(() => {
    const link = document.querySelector('.mail_title_link');
    const parent = link.parentElement;
    link.remove(); parent.append(link);
  });
  await expect.poll(() => page.locator(badge).evaluate(el => el.previousElementSibling?.matches('a.mail_title_link') ?? false)).toBe(true);
  await page.evaluate(() => {
    const container = document.querySelector('[data-essmt-tags]');
    container.parentElement.append(container.cloneNode(true));
  });
  await expect(page.locator(badge)).toHaveCount(1);
  await expect(page.locator('.essmt-tag')).toHaveCount(2);
  expect(await page.evaluate(() => window.tagRequests)).toHaveLength(0);
});
