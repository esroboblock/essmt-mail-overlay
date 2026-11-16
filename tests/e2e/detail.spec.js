import { test, expect, chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import https from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildExtension } from '../../scripts/build-extension.mjs';
import { detailURL, routeDetail, detailUI, go } from './detail-fixture.js';

const namespace = 'synthetic:naver:team';
const confirm = '이 화면의 네이버 계정과 ESSMT 데이터셋 일치 확인';
const tagged = { id: '7', name: '<기존 태그>' };

test('detail editor uses real MV3 requests and invalidates stale views', async () => {
  test.setTimeout(90000);
  const dir = await mkdtemp(path.join(tmpdir(), 'overlay-detail-'));
  const key = path.join(dir, 'key.pem'), cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key,
    '-out', cert, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  const definitions = new Map([[tagged.id, tagged]]);
  const assignments = new Map([['101', new Set(['7'])], ['102', new Set()]]);
  const requests = [];
  const tokens = new Map();
  let failNext = 0;
  let delayLookup = false;
  const server = https.createServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
    if (req.url === '/login') {
      res.setHeader('Set-Cookie', 'synthetic_employee=yes; Secure; HttpOnly; SameSite=Lax; Path=/');
      return res.end('signed in');
    }
    const action = req.url.split('/').at(-1);
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    const sn = input.mail_sn ?? input.messages?.[0].mail_sn;
    requests.push({ action, input, origin: req.headers.origin, cookie: req.headers.cookie });
    const reply = (status, payload) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
    if (!req.headers.cookie?.includes('synthetic_employee=yes')) return reply(401, {});
    const ids = assignments.get(sn);
    if (action === 'lookup') {
      if (delayLookup) { delayLookup = false; await new Promise(resolve => setTimeout(resolve, 700)); }
      const count = sn === '104' ? 2 : ids ? 1 : 0;
      return reply(200, { schema_version: 1, namespace, results: [{
        mail_sn: sn, status: ['unmatched', 'matched', 'ambiguous'][count], candidate_count: count,
        tags: ids ? [...ids].map(id => definitions.get(id)) : []
      }] });
    }
    if (action === 'suggestions') {
      if (!ids) return reply(409, {});
      const token = 'opaque-' + requests.length;
      tokens.set(token, sn);
      return reply(200, {
        tags: [...definitions.values()].filter(tag => !ids.has(tag.id) && tag.name.includes(input.query ?? '')),
        target_token: token
      });
    }
    if (tokens.get(input.target_token) !== sn) return reply(409, {});
    const fault = failNext;
    failNext = 0;
    if (fault > 0) return reply(fault, {});
    if (action === 'detach') return reply(200, { changed: ids.delete(input.tag_id) });
    let tag = input.tag_id ? definitions.get(input.tag_id) : [...definitions.values()].find(tag => tag.name === input.name);
    if (!tag && input.tag_id) return reply(404, {});
    if (!tag) {
      tag = { id: String(definitions.size + 20), name: input.name };
      definitions.set(tag.id, tag);
    }
    const changed = !ids.has(tag.id);
    ids.add(tag.id);
    if (fault === -1) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': 1024 });
      res.write('{');
      setTimeout(() => res.destroy(), 25);
      return;
    }
    return reply(200, { changed, tag });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'https://localhost:' + server.address().port;
  let context;
  try {
    const extension = await buildExtension({ origin, namespace, detailFixture: true, destination: path.join(dir, 'extension') });
    context = await chromium.launchPersistentContext(path.join(dir, 'profile'), {
      channel: 'chromium', headless: true,
      args: ['--ignore-certificate-errors', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const workerOrigin = worker.url().replace('/worker.js', '');
    await routeDetail(context);
    const login = await context.newPage();
    await login.goto(origin + '/login');
    const options = await context.newPage();
    await options.goto(worker.url().replace('/worker.js', '/options.html'));
    await options.locator('#mode').selectOption('essmt');

    const page = await context.newPage();
    await page.goto(detailURL('102'));
    const ui = await detailUI(context, page);
    const button = name => expect.poll(() => ui.enabled(name)).toBe(true);
    const status = pattern => expect.poll(() => ui.find('StaticText', pattern)).toBeTruthy();
    const bind = async () => { await button(confirm); await ui.click(confirm); };
    const mutations = () => requests.filter(r => ['attach', 'detach'].includes(r.action));
    await bind();
    await status(/공유 태그 없음/);
    await expect(page.locator('.mail_toolbar + [data-essmt-detail] + article')).toHaveCount(1);
    await ui.fill('기존 태그 검색', '없는 검색', true);
    await status(/추천 태그 없음/);
    await ui.fill('기존 태그 검색', '기존', true);
    await button(tagged.name + ' 부착');
    expect(await page.locator('[data-essmt-detail]').evaluate(host => {
      host.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return host.shadowRoot;
    })).toBeNull();
    expect(mutations()).toHaveLength(0);
    await ui.click(tagged.name + ' 부착');
    await button(tagged.name + ' 해제');
    await ui.fill('새 태그 이름', '<새 태그>', true);
    await button('<새 태그> 해제');
    await ui.fill('새 태그 이름', '<새 태그>', true);
    await status(/변경 사항이 없습니다/);
    await button('<새 태그> 해제');
    await ui.click('<새 태그> 해제');
    await expect.poll(() => ui.find('button', '<새 태그> 해제')).toBeUndefined();

    for (const fault of [404, 409, 422, 503, -1]) {
      await button('생성 및 부착');
      failNext = fault;
      const before = mutations().length;
      await ui.fill('새 태그 이름', 'fault-' + fault, true);
      await status(fault === -1 ? /INVALID_RESPONSE/ : new RegExp('HTTP_' + fault));
      await expect.poll(() => requests.at(-1)?.action).toBe('suggestions');
      await button('생성 및 부착');
      expect(mutations()).toHaveLength(before + 1);
    }
    await button('fault--1 해제');
    expect(mutations().every(r => r.origin === workerOrigin && r.cookie.includes('synthetic_employee=yes') &&
      r.input.namespace === namespace && r.input.mail_sn === '102')).toBe(true);

    const before = requests.length;
    await go(page, '101', false);
    await expect(page.locator('[data-essmt-detail]')).toHaveCount(0);
    expect(requests).toHaveLength(before);
    delayLookup = true;
    await go(page, null);
    await expect.poll(() => requests.at(-1)?.input.messages?.[0].mail_sn).toBe('101');
    await go(page, '102');
    await go(page, '101');
    await button(tagged.name + ' 해제');
    await go(page, '104');
    await status(/여러 건/);
    await go(page, '103');
    await status(/찾지 못했습니다/);
    await page.goBack();
    await expect(page.locator('[data-essmt-detail]')).toHaveCount(0);
    await go(page, null);
    await status(/여러 건/);

    const other = await context.newPage();
    await other.goto(detailURL('101'));
    const otherUI = await detailUI(context, other);
    await expect.poll(() => otherUI.find('button', confirm)).toBeTruthy();
    await otherUI.click(confirm);
    await expect.poll(() => otherUI.enabled(tagged.name + ' 해제')).toBe(true);
    await page.locator('#gnb_name1').evaluate(node => {
      node.textContent = 'Different account';
      node.textContent = 'Synthetic account';
    });
    await button(confirm);
    await expect.poll(() => otherUI.enabled(tagged.name + ' 해제')).toBe(true);

    // Stop the actual service worker with a live token. The next write must
    // recover with lookup + suggestions and never reach the server as a write.
    const cdp = await context.newCDPSession(other);
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.stopAllWorkers');
    const beforeRestart = mutations().length;
    await otherUI.click(tagged.name + ' 해제');
    await expect.poll(() => otherUI.find('StaticText', /VIEW_CHANGED|COMMUNICATION_ERROR/)).toBeTruthy();
    await expect.poll(() => otherUI.enabled(tagged.name + ' 해제')).toBe(true);
    expect(mutations()).toHaveLength(beforeRestart);

    await page.reload();
    await button(confirm);
    await go(page, '102');
    await bind();
    for (const fault of [401, 403]) {
      await button('생성 및 부착');
      failNext = fault;
      await ui.fill('새 태그 이름', 'unauthorized', true);
      await status(new RegExp('HTTP_' + fault));
      await button(confirm);
      await bind();
      await button(tagged.name + ' 해제');
    }
    await page.evaluate(() => history.pushState({}, '', '/v2/folders/-1'));
    await expect(page.locator('[data-essmt-detail]')).toHaveCount(0);
  } finally {
    await context?.close();
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test('Naver build offers read-only detail after same-document list navigation', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'overlay-naver-detail-'));
  const origin = 'https://mail.naver.com';
  const extension = await buildExtension({
    origin: 'https://localhost:1', namespace, naver: true, destination: path.join(dir, 'extension')
  });
  const context = await chromium.launchPersistentContext(path.join(dir, 'profile'), {
    channel: 'chromium', headless: true,
    args: ['--host-resolver-rules=MAP mail.naver.com ~NOTFOUND',
      `--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  try {
    await routeDetail(context, origin);
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const calls = [];
    await worker.evaluate(() => {
      globalThis.detailRequests = [];
      globalThis.fetch = async (url, { body }) => {
        globalThis.detailRequests.push(url);
        const { messages, namespace } = JSON.parse(body);
        return Response.json({ schema_version: 1, namespace, results: [{
          mail_sn: messages[0].mail_sn, status: 'matched', candidate_count: 1,
          tags: [{ id: '7', name: '<공유 태그>' }]
        }] });
      };
    });
    const options = await context.newPage();
    await options.goto(worker.url().replace('/worker.js', '/options.html'));
    await options.locator('#mode').selectOption('essmt');
    const page = await context.newPage();
    await page.goto(detailURL('101', origin));
    await expect(page.locator('[data-essmt-detail]')).toHaveCount(0);
    await page.goto(origin + '/v2/folders/-1');
    await page.evaluate(() => {
      history.pushState({}, '', '/v2/read/-1/101');
      document.querySelector('main').innerHTML = '<div class="mail_toolbar type_read"></div><article class="contents_area is_read">Synthetic body</article>';
    });
    const ui = await detailUI(context, page);
    await expect.poll(() => ui.enabled(confirm)).toBe(true);
    await ui.click(confirm);
    await expect.poll(() => ui.find('StaticText', '<공유 태그>')).toBeTruthy();
    await expect.poll(() => ui.find('StaticText', /읽기 전용/)).toBeTruthy();
    expect(await ui.find('button', /부착|해제/)).toBeUndefined();
    await page.locator('.contents_area.is_read').evaluate(body => {
      const next = body.cloneNode();
      next.textContent = 'Next message before URL update';
      body.replaceWith(next);
    });
    await expect(page.locator('[data-essmt-detail]')).toHaveCount(0);
    await go(page, '102', false);
    await expect(page.locator('[data-essmt-detail]')).toHaveCount(0);
    calls.push(...await worker.evaluate(() => globalThis.detailRequests));
    expect(calls).toEqual(['https://localhost:1/api/browser-overlay/email-tags/lookup']);
  } finally {
    await context.close();
    await rm(dir, { recursive: true, force: true });
  }
});
