import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#demo-root')).toHaveAttribute('data-demo-ready', 'true');
}
async function scenario(page, name) {
  const old = await page.locator('#demo-root').getAttribute('data-demo-generation');
  await page.getByLabel('데이터 시나리오').selectOption(name);
  await expect(page.locator('#demo-root')).not.toHaveAttribute('data-demo-generation', old);
  await expect(page.locator('#demo-root')).toHaveAttribute('data-demo-ready', 'true');
}
async function bridge(page, method, payload = {}) {
  return page.evaluate(({ method, payload }) => new Promise(resolve => {
    const id = crypto.randomUUID();
    const listener = event => {
      if (event.data?.channel === 'essmt-demo:response' && event.data.id === id) {
        window.removeEventListener('message', listener); resolve(event.data);
      }
    };
    window.addEventListener('message', listener);
    window.postMessage({ channel: 'essmt-demo:request', version: 1, id, method, payload }, location.origin);
  }), { method, payload });
}

test('synthetic DOM retains observed identity clues, safe text and no preinserted badges', async ({ page }) => {
  const external = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173')) external.push(request.url()); });
  await ready(page);
  await expect(page.locator('.mail_item')).toHaveCount(10);
  await expect(page.locator('[data-demo-row="row-101"] .mail_title_link')).toHaveAttribute('href', '/v2/popup/read/0/101');
  await expect(page.locator('[data-demo-row="row-106"] .text')).toHaveText('문자열 <em>합성</em>');
  await expect(page.locator('.mail_title em')).toHaveCount(0);
  await expect(page.locator('.mail_item [data-essmt-tags], .mail_item .essmt-tag')).toHaveCount(0);
  await page.getByRole('button', { name: '현재 메일 태그 조회' }).click();
  await expect(page.locator('#lookup-output')).toContainText('합성 분류 가');
  await expect(page.locator('#lookup-output')).toContainText('unmatched');
  await expect(page.locator('#lookup-output')).toContainText('ambiguous');
  await expect(page.locator('.mail_list')).not.toContainText('합성 분류 가');
  expect(external).toEqual([]);
});

test('search, pagination, folders and detail remain usable', async ({ page }) => {
  await ready(page);
  await page.getByLabel('페이지당 메일').selectOption('2');
  await expect(page.locator('.mail_item')).toHaveCount(2);
  await expect(page.locator('.mail_item').first()).toHaveClass(/mail-101/);
  await page.getByRole('button', { name: '다음 페이지' }).click();
  await expect(page.locator('.mail_item').first()).toHaveClass(/mail-103/);
  await page.getByLabel('메일 검색').fill('중복');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.locator('.mail_item')).toHaveCount(2);
  await expect(page.locator('.mail_item').first()).toHaveClass(/mail-105/);
  await page.getByRole('button', { name: '보낸메일함', exact: true }).click();
  await expect(page.locator('.mail_item')).toHaveCount(1);
  await expect(page.locator('.mail_title_link')).toHaveAttribute('href', '/v2/popup/read/1/105');
  await page.locator('.mail_title_link').click();
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('#detail')).toContainText('합성 중복 행');
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
  await page.getByRole('button', { name: '목록으로' }).click();
  await expect(page.locator('#detail')).toBeHidden();
  await page.getByLabel('메일 검색').fill('없는 검색어');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.locator('#empty')).toBeVisible();
});

test('selection/read/bookmark controls and invalid links do not navigate', async ({ page }) => {
  await ready(page);
  const row = page.locator('[data-demo-row="row-101"]');
  await row.getByLabel('메일 선택').check();
  await expect(row.getByLabel('메일 선택')).toBeChecked();
  await row.getByRole('button', { name: '중요 메일' }).click();
  await expect(row.getByRole('button', { name: '중요 메일' })).toHaveAttribute('aria-pressed', 'true');
  await row.getByLabel('읽음').check();
  await expect(row).toHaveClass(/read/);
  await page.locator('[data-demo-row="row-conflict"] .mail_title_link').click();
  await expect(page.locator('#detail')).toBeHidden();
  await expect(page.locator('#mail-status')).toContainText('식별');
});

test('bridge provides batch lookup, validation and serializable failures', async ({ page }) => {
  await ready(page);
  const context = await bridge(page, 'getContext');
  expect(context.ok).toBe(true);
  expect(context.result.namespace).toBe('demo:naver:account-a');
  const payload = { namespace: context.result.namespace, messages: [{ mail_sn: '101', folder_sn: '0' }, { mail_sn: '102', folder_sn: '0' }] };
  const response = await bridge(page, 'lookupTags', payload);
  expect(response.result.results[0].tags.map(t => t.id)).toEqual(['tag-1', 'tag-2']);
  expect(response.result.results[1].tags).toEqual([]);
  expect((await bridge(page, 'not-allowed')).error.code).toBe('INVALID_REQUEST');
  expect((await bridge(page, 'lookupTags', { ...payload, messages: [{ mail_sn: 101 }] })).error.code).toBe('INVALID_REQUEST');
  await page.getByLabel('Mock 응답').selectOption('403');
  const failed = await bridge(page, 'lookupTags', payload);
  expect(failed.error).toMatchObject({ code: 'FORBIDDEN', status: 403 });
});

for (const fault of ['401', '403', '500', 'offline', 'timeout']) {
  test(`diagnostic ${fault} leaves mail usable and recovers with retry`, async ({ page }) => {
    await ready(page);
    await page.getByLabel('Mock 응답').selectOption(fault);
    await page.getByRole('button', { name: '현재 메일 태그 조회' }).click();
    await expect(page.locator('#lookup-status')).toContainText('실패');
    await expect(page.locator('.mail_item')).toHaveCount(10);
    await page.getByLabel('Mock 응답').selectOption('normal');
    await page.getByRole('button', { name: '현재 메일 태그 조회' }).click();
    await expect(page.locator('#lookup-output')).toContainText('합성 분류 가');
  });
}

test('node reuse preserves the actual li and clears old extension children', async ({ page }) => {
  await ready(page);
  await scenario(page, 'reuse');
  await page.evaluate(() => {
    window.savedRow = document.querySelector('.mail_item');
    const child = document.createElement('span'); child.className = 'test-extension-owned';
    window.savedRow.querySelector('.mail_title').append(child);
  });
  const old = await page.locator('#demo-root').getAttribute('data-demo-generation');
  await page.getByRole('button', { name: '행 재사용 101 ↔ 102' }).click();
  await expect(page.locator('.mail_item')).toHaveClass(/mail-102/);
  expect(await page.evaluate(() => window.savedRow === document.querySelector('.mail_item'))).toBe(true);
  await expect(page.locator('.test-extension-owned')).toHaveCount(0);
  await expect(page.locator('#demo-root')).not.toHaveAttribute('data-demo-generation', old);
  await page.getByRole('button', { name: '현재 메일 태그 조회' }).click();
  await expect(page.locator('#lookup-output')).toContainText('"tags": []');
});

test('late diagnostics and bridge responses cannot cross reset/account boundaries', async ({ page }) => {
  await ready(page);
  await page.getByLabel('Mock 응답').selectOption('slow');
  await page.getByRole('button', { name: '현재 메일 태그 조회' }).click();
  const response = bridge(page, 'lookupTags', { namespace: 'demo:naver:account-a', messages: [{ mail_sn: '101', folder_sn: '0' }] });
  await expect(page.locator('#lookup-status')).toContainText('조회 중');
  await page.getByLabel('데모 계정').selectOption('demo:naver:account-b');
  expect((await response).error.code).toBe('STALE_CONTEXT');
  await expect(page.locator('#lookup-output')).toHaveText('');
  await expect(page.locator('.mail_item')).toHaveCount(0);
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await expect(page.locator('.mail_item')).toHaveCount(10);
  await expect(page.getByLabel('Mock 응답')).toHaveValue('normal');
});

test('existing fragment remains consistent with fixture identity expectations', async ({ page, request }) => {
  const fragment = await (await request.get('/fixtures/mail-list.fragment.html')).text();
  const fixture = await (await request.get('/fixtures/mails.json')).json();
  await ready(page);
  const identities = await page.evaluate(async html => {
    const { identifyRow } = await import('/src/identity.js');
    const document = new DOMParser().parseFromString(html, 'text/html');
    return [...document.querySelectorAll('.mail_item')].map(row => ({
      row_id: row.dataset.demoRow, mail_sn: identifyRow(row)?.mail_sn ?? null
    }));
  }, fragment);
  expect(identities).toEqual(fixture.dom_rows.map(row => ({ row_id: row.row_id, mail_sn: row.expected_mail_sn })));
});

test('bridge works from an isolated JavaScript world without access to page globals', async ({ page }) => {
  await ready(page);
  const cdp = await page.context().newCDPSession(page);
  const { frameTree } = await cdp.send('Page.getFrameTree');
  const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'extension-contract-test' });
  const { result } = await cdp.send('Runtime.evaluate', {
    contextId: executionContextId, awaitPromise: true, returnByValue: true,
    expression: `new Promise(resolve => {
      const id = 'isolated-world-request';
      const timer = setTimeout(() => resolve({ timeout: true }), 3000);
      window.addEventListener('message', function listener(event) {
        if (event.data?.channel === 'essmt-demo:response' && event.data.id === id) {
          clearTimeout(timer); window.removeEventListener('message', listener);
          resolve({ globalVisible: typeof window.essmtDemo !== 'undefined', response: event.data });
        }
      });
      window.postMessage({channel:'essmt-demo:request',version:1,id,method:'lookupTags',payload:{namespace:'demo:naver:account-a',messages:[{mail_sn:'101',folder_sn:'0'}]}}, location.origin);
    })`
  });
  expect(result.value.globalVisible).toBe(false);
  expect(result.value.response.ok).toBe(true);
  expect(result.value.response.result.results[0].tags[0].id).toBe('tag-1');
  await cdp.detach();
});

for (const transition of ['page', 'search', 'reset', 'reuse']) {
  test(`pending lookup is invalidated by ${transition}`, async ({ page }) => {
    await ready(page);
    if (transition === 'page') await page.getByLabel('페이지당 메일').selectOption('2');
    if (transition === 'reuse') await scenario(page, 'reuse');
    await page.getByLabel('Mock 응답').selectOption('slow');
    await expect(page.locator('#demo-root')).toHaveAttribute('data-demo-ready', 'true');
    await page.getByRole('button', { name: '현재 메일 태그 조회' }).click();
    const oldGeneration = await page.locator('#demo-root').getAttribute('data-demo-generation');
    // Install the pending request before triggering the transition to avoid a test race.
    await page.evaluate(() => {
      window.pendingReply = new Promise(resolve => {
        window.addEventListener('message', function listener(event) {
          if (event.data?.channel === 'essmt-demo:response' && event.data.id === 'pending') {
            window.removeEventListener('message', listener); resolve(event.data);
          }
        });
      });
      window.postMessage({ channel: 'essmt-demo:request', version: 1, id: 'pending', method: 'lookupTags', payload: { namespace: 'demo:naver:account-a', messages: [{ mail_sn: '101', folder_sn: '0' }] } }, location.origin);
    });
    if (transition === 'page') await page.getByRole('button', { name: '다음 페이지' }).click();
    if (transition === 'search') {
      await page.getByLabel('메일 검색').fill('중복');
      await page.getByRole('button', { name: '검색', exact: true }).click();
    }
    if (transition === 'reset') await page.getByRole('button', { name: '초기화', exact: true }).click();
    if (transition === 'reuse') await page.getByRole('button', { name: '행 재사용 101 ↔ 102' }).click();
    const reply = await page.evaluate(() => window.pendingReply);
    expect(reply.error.code).toBe('STALE_CONTEXT');
    await expect(page.locator('#demo-root')).not.toHaveAttribute('data-demo-generation', oldGeneration);
    await expect(page.locator('#lookup-output')).toHaveText('');
    await expect(page.locator('#lookup-status')).toHaveText('조회 대기');
  });
}

test('search filters the currently reused message rather than its original binding', async ({ page }) => {
  await ready(page);
  await scenario(page, 'reuse');
  await page.getByRole('button', { name: '행 재사용 101 ↔ 102' }).click();
  await expect(page.locator('.mail_item')).toHaveClass(/mail-102/);
  await page.getByLabel('메일 검색').fill('둘');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.locator('.mail_item')).toHaveCount(1);
  await expect(page.locator('.mail_title .text')).toHaveText('합성 메일 둘');
  await page.getByLabel('메일 검색').fill('하나');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.locator('.mail_item')).toHaveCount(0);
  await expect(page.locator('#empty')).toBeVisible();
});
