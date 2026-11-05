import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../extension/identity.js';
import '../extension/bridge.js';
const { identifyMail, identifyRow, validateResults, requestTags } = globalThis.ESSMTOverlay;
const context = { namespace: 'demo:naver:account-a', generation: 7 };
const messages = [{ mail_sn: '101', folder_sn: '0' }];
const response = () => ({ schema_version: 1, namespace: context.namespace, results: [
  { mail_sn: '101', status: 'matched', candidate_count: 1, tags: [{ id: 't', name: '<img src=x onerror=alert(1)>' }] }
] });

test('extension identity uses existing fixture and preserves large IDs', async () => {
  const fixture = JSON.parse(await readFile(new URL('../demo/fixtures/mails.json', import.meta.url)));
  for (const row of fixture.dom_rows) assert.equal(identifyMail(row.link_path, row.class_mail_sn)?.mail_sn ?? null, row.expected_mail_sn);
  assert.deepEqual(identifyMail('/v2/popup/read/0/9007199254740993123', '9007199254740993123'), { folder_sn: '0', mail_sn: '9007199254740993123' });
  for (const path of ['/v2/read/0/101', 'https://mail.naver.com/v2/popup/read/0/101', '/v2/popup/read/0/101?x=1', '/v2/popup/read/00/101', '/v2/popup/read/0/0101']) assert.equal(identifyMail(path, '101'), null);
});

test('row identity requires exactly one title link and one matching class', () => {
  const link = { getAttribute: () => '/v2/popup/read/0/101' };
  const row = (links, classes) => ({ querySelectorAll: () => links, classList: classes });
  assert.deepEqual(identifyRow(row([link], ['mail_item', 'mail-101', 'read'])), { folder_sn: '0', mail_sn: '101' });
  for (const input of [row([], ['mail-101']), row([link, link], ['mail-101']), row([link], ['mail-101', 'mail-102']), row([link], ['mail-102'])]) assert.equal(identifyRow(input), null);
});

test('response validation keeps empty, unmatched and ambiguous distinct and fails closed', () => {
  assert.equal(validateResults(response(), context, messages).get('101').tags[0].name, '<img src=x onerror=alert(1)>');
  for (const [status, candidate_count] of [['matched', 1], ['unmatched', 0], ['ambiguous', 2]]) {
    const input = response(); Object.assign(input.results[0], { status, candidate_count, tags: [] });
    assert.equal(validateResults(input, context, messages).get('101').status, status);
  }
  for (const mutate of [r => r.namespace = 'other', r => r.schema_version = 2, r => r.results = [], r => r.results.push(r.results[0]), r => r.results[0].mail_sn = '102', r => r.results[0].status = 'unknown', r => r.results[0].candidate_count = 2, r => r.results[0].tags[0].name = null, r => r.results[0].tags.push(r.results[0].tags[0]), r => Object.assign(r.results[0], { status: 'ambiguous', candidate_count: 2 })]) {
    const input = response(); mutate(input);
    assert.throws(() => validateResults(input, context, messages), { code: 'INVALID_RESPONSE' });
  }
});

// A minimal same-window transport exercises our listener/timeout lifecycle.
function transport(reply) {
  const listeners = new Set();
  const target = {
    location: { origin: 'http://127.0.0.1:4173' },
    addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn),
    postMessage(message) { queueMicrotask(() => reply?.(message, (data, overrides = {}) => {
      for (const fn of [...listeners]) fn({ source: target, origin: target.location.origin, data, ...overrides });
    })); }
  };
  return { target, listeners };
}
const envelope = req => ({ channel: 'essmt-demo:response', version: 1, id: req.id, ok: true, context, result: response() });

test('bridge ignores other origins, sources, IDs and versions, then cleans its listener', async () => {
  const { target, listeners } = transport((req, send) => {
    assert.equal(req.method, 'lookupTags'); assert.deepEqual(req.payload.messages, messages);
    send(envelope(req), { origin: 'https://evil.test' });
    send(envelope(req), { source: {} });
    send({ ...envelope(req), id: 'unrelated' });
    send({ ...envelope(req), version: 2 });
    send(envelope(req));
  });
  assert.equal((await requestTags(target, context, messages)).get('101').status, 'matched');
  assert.equal(listeners.size, 0);
});

test('bridge rejects stale context, failures and malformed results and cleans up', async () => {
  for (const [change, code] of [
    [r => r.context = { ...context, generation: 8 }, 'STALE_CONTEXT'],
    [r => r.context = { ...context, namespace: 'other' }, 'STALE_CONTEXT'],
    [r => Object.assign(r, { ok: false, error: { code: 'UNAUTHORIZED', status: 401 } }), 'UNAUTHORIZED'],
    [r => r.result.results = [], 'INVALID_RESPONSE']
  ]) {
    const { target, listeners } = transport((req, send) => { const r = envelope(req); change(r); send(r); });
    await assert.rejects(requestTags(target, context, messages), { code }); assert.equal(listeners.size, 0);
  }
});

test('missing bridge times out and cancelled calls release listeners', async () => {
  const { target, listeners } = transport();
  await assert.rejects(requestTags(target, context, messages, { timeoutMs: 10 }), { code: 'BRIDGE_TIMEOUT' });
  assert.equal(listeners.size, 0);
  const controller = new AbortController();
  const pending = requestTags(target, context, messages, { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' }); assert.equal(listeners.size, 0);
  await assert.rejects(requestTags(target, context, messages, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(listeners.size, 0);
});
