import { test as base, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildExperimental } from '../../scripts/build-experimental.js';
const item = sn => `<li class="mail_item mail-${sn}" data-row="${sn}"><input type="checkbox" aria-label="Select ${sn}"><button type="button" aria-pressed="false" onclick="this.setAttribute('aria-pressed',this.getAttribute('aria-pressed')!=='true')">Star</button><input type="checkbox" aria-label="Read ${sn}"><div class="mail_title"><a class="mail_title_link" href="/v2/popup/read/0/${sn}"><span class="text">Synthetic long mail title with attachment</span></a><span class="attachment">📎</span></div></li>`;
const fixture = `<!doctype html><style>body{margin:0}.mail_list{padding:0}.mail_item{display:flex;width:100%;align-items:center}.mail_title{display:flex;min-width:0;flex:1;align-items:center}.mail_title_link{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0;flex:1}.attachment{flex:none}</style><ul class="mail_list">${item('101')}${item('102')}${item('103')}${item('101')}${item('104').replace('mail-104','mail-invalid')}</ul><script>window.messages=[];window.addEventListener('message',e=>messages.push(e.data));</script>`;
const test = base.extend({
  context: async ({}, use) => {
    const temp = await mkdtemp(path.join(tmpdir(), 'essmt-naver-'));
    const extension = await buildExperimental(path.join(temp, 'extension'));
    const context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { channel:'chromium', headless:true, args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`] });
    await context.route('**/*', route => route.request().url().startsWith('https://mail.naver.com/') ? route.fulfill({ contentType:'text/html', body:fixture }) : route.abort());
    try { await use(context); } finally { await context.close(); await rm(temp,{recursive:true,force:true}); }
  },
  page: async ({context}, use) => { const page=await context.newPage();await use(page); }
});
const inbox='https://mail.naver.com/v2/folders/0/all';
const tagged=page=>page.locator('[data-row="101"]');
test('installed Naver adapter uses visibly synthetic local results and preserves controls/layout',async({page})=>{
  const requests=[]; page.on('request',r=>requests.push(r.url()));
  await page.setViewportSize({width:360,height:640});await page.goto(inbox);
  await expect(tagged(page).first().locator('.essmt-tag')).toHaveText('Mock · 합성 태그');
  await expect(tagged(page).locator('[data-essmt-tags]')).toHaveCount(2);
  for(const [sn,state] of [['102','no-tags'],['103','unmatched'],['104','unidentified']]) await expect(page.locator(`[data-row="${sn}"]`)).toHaveAttribute('data-essmt-state',state);
  await page.getByLabel('Select 101').first().check();await expect(page.getByLabel('Select 101').first()).toBeChecked();
  await tagged(page).first().getByRole('button').click();
  await expect(tagged(page).first().getByRole('button')).toHaveAttribute('aria-pressed','true');
  await page.getByLabel('Read 101').first().check();await expect(page.getByLabel('Read 101').first()).toBeChecked();
  await expect(tagged(page).first().locator('a')).toHaveAttribute('href','/v2/popup/read/0/101');
  expect(await tagged(page).first().evaluate(el=>{ const title=el.querySelector('.mail_title_link').getBoundingClientRect(),tag=el.querySelector('[data-essmt-tags]').getBoundingClientRect(),attach=el.querySelector('.attachment').getBoundingClientRect(); return title.width>20&&tag.width>20&&title.right<=tag.left&&tag.right<=attach.left&&attach.right<=360; })).toBe(true);
  expect(await page.evaluate(()=>window.messages)).toEqual([]);
  expect(requests).toEqual([inbox]);
  await tagged(page).first().locator('a').click();
  await expect(page).toHaveURL('https://mail.naver.com/v2/popup/read/0/101');
  await expect(page.locator('[data-essmt-tags]')).toHaveCount(0);
});
test('row rebinding, root replacement and unsupported route leave/return invalidate delayed results',async({page})=>{
  await page.goto(inbox);
  await expect(page.locator('[data-row="102"]')).toHaveAttribute('data-essmt-state','loading');
  await page.evaluate(()=>{const el=document.querySelector('[data-row="101"]');el.className='mail_item mail-102';el.querySelector('a').setAttribute('href','/v2/popup/read/0/102');});
  await expect(tagged(page).first()).toHaveAttribute('data-essmt-state','no-tags');
  await expect(tagged(page).first().locator('[data-essmt-tags]')).toHaveCount(0);
  await page.evaluate(()=>{const root=document.querySelector('.mail_list');root.replaceWith(root.cloneNode(true));});
  await expect(page.locator('[data-row="101"]').last().locator('[data-essmt-tags]')).toHaveCount(1);
  await page.evaluate(()=>history.pushState({},'', '/v2/folders/1/all'));
  await expect(page.locator('[data-essmt-tags]')).toHaveCount(0);
  await expect(page.locator('[data-essmt-state]')).toHaveCount(0);
  await page.evaluate(()=>history.pushState({},'', '/v2/folders/0/all'));
  await expect(page.locator('[data-row="101"]').last().locator('[data-essmt-tags]')).toHaveCount(1);
  await page.evaluate(()=>{history.pushState({},'', '/v2/folders/0/all?page=2');document.querySelector('.mail_list').replaceChildren();});
  await expect(page.locator('[data-essmt-tags]')).toHaveCount(0);
});

test('a rapid leave and return resets pending context even when the root survives', async ({ page }) => {
  await page.goto(inbox);
  await expect(tagged(page).first()).toHaveAttribute('data-essmt-state','loading');
  await page.evaluate(() => {
    window.sawCleared = false;
    history.pushState({}, '', '/v2/folders/1/all');
    window.sawCleared = !document.querySelector('[data-essmt-state]');
    history.pushState({}, '', '/v2/folders/0/all');
  });
  expect(await page.evaluate(() => window.sawCleared)).toBe(true);
  await expect(tagged(page).first().locator('[data-essmt-tags]')).toHaveCount(1);
});

test('root replacement clears cloned badges when its identity changes', async ({ page }) => {
  await page.goto(inbox);
  await expect(tagged(page).first().locator('[data-essmt-tags]')).toHaveCount(1);
  const staleAtCheckpoint = await page.evaluate(async () => {
    const old = document.querySelector('.mail_list');
    const replacement = old.cloneNode(true);
    for (const row of replacement.querySelectorAll('[data-row="101"]')) {
      row.className = 'mail_item mail-102';
      row.querySelector('a').setAttribute('href', '/v2/popup/read/0/102');
    }
    old.replaceWith(replacement);
    await new Promise(resolve => queueMicrotask(resolve));
    return replacement.querySelectorAll('[data-essmt-tags]').length;
  });
  expect(staleAtCheckpoint).toBe(0);
  await expect(tagged(page).first()).toHaveAttribute('data-essmt-state', 'no-tags');
});
