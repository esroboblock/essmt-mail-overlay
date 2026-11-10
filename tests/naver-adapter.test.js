import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../extension/identity.js';
import '../extension/adapters.js';
const api = globalThis.ESSMTOverlay;
test('Naver context is restricted to the observed exact inbox route', () => {
  for (const href of ['https://mail.naver.com/v2/folders/0/all', 'https://mail.naver.com/v2/folders/0/all?page=2']) assert.equal(api.isNaverInbox(new URL(href)), true);
  for (const href of ['https://mail.naver.com/v2/folders/1/all', 'https://mail.naver.com/v2/folders/0/all/', 'https://evil.test/v2/folders/0/all', 'http://mail.naver.com/v2/folders/0/all']) assert.equal(api.isNaverInbox(new URL(href)), false);
});
test('local synthetic results distinguish tags, empty and unmatched without transport or retained mappings', async () => {
  const messages = ['101', '102', '103', '101'].map(mail_sn => ({ mail_sn, folder_sn: '0' }));
  const lookup = api.createLocalMock({ delayMs: 1 });
  const result = await lookup({}, messages);
  assert.equal(result.size, 3);
  assert.equal(result.get('101').tags[0].name, 'Mock · 합성 태그');
  assert.deepEqual(result.get('102').tags, []);
  assert.equal(result.get('102').status, 'matched');
  assert.equal(result.get('103').status, 'unmatched');
  const controller = new AbortController();
  const pending = lookup({}, messages, { signal: controller.signal }); controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('unrelated localhost does not attach any mutation observer', async () => {
  const { readFile } = await import('node:fs/promises');
  const { runInNewContext } = await import('node:vm');
  const observed = [], timers = [];
  const sandbox = {
    ESSMTOverlay: { identifyRow() {}, requestTags() {}, isNaverInbox: () => false, createLocalMock: () => () => {} },
    MutationObserver: class { observe(target) { observed.push(target); } disconnect() {} },
    location: new URL('http://localhost:4173/unrelated'),
    document: { querySelector: () => null },
    window: { addEventListener() {} },
    setInterval: callback => timers.push(callback)
  };
  runInNewContext(await readFile(new URL('../extension/content.js', import.meta.url), 'utf8'), sandbox);
  for (const tick of timers) tick();
  assert.deepEqual(observed, []);
});
