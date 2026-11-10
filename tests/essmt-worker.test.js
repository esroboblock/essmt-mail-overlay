import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../extension/identity.js';
import '../extension/bridge.js';
import '../extension/worker-core.js';
const config = { origin: 'https://essmt.example.test', namespace: 'synthetic:naver:team', demoNamespace: 'demo:naver:account-a' };
const sender = { id: 'extension-id', url: 'http://127.0.0.1:4173/', tab: { id: 1 } };
const message = () => ({ type: 'essmt:lookup', context: { namespace: config.demoNamespace, generation: 1 }, messages: [{ mail_sn: '101', folder_sn: '0' }] });
const result = () => ({ schema_version: 1, namespace: config.namespace, results: [{ mail_sn: '101', status: 'matched', candidate_count: 1, tags: [{ id: '7', name: '합성 태그' }] }] });
const call = (msg = message(), send = sender, cfg = config, fetcher = async () => new Response(JSON.stringify(result()))) => globalThis.ESSMTOverlay.lookupESSMT(cfg, msg, send, 'extension-id', fetcher);

test('worker sends fixed credentialed JSON POST and normalizes only validated server namespace', async () => {
  const reply = await call(message(), sender, config, async (url, init) => {
    assert.equal(url, config.origin + '/api/browser-overlay/email-tags/lookup');
    assert.equal(init.credentials, 'include'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    assert.equal(init.method, 'POST'); assert.equal(init.headers['X-ESSMT-Overlay'], '1');
    assert.deepEqual(JSON.parse(init.body), { namespace: config.namespace, messages: message().messages });
    return new Response(JSON.stringify(result()));
  });
  assert.equal(reply.namespace, config.demoNamespace);
  assert.equal(reply.results[0].tags[0].name, '합성 태그');
});
test('worker rejects proxy fields, foreign senders/accounts, malformed IDs/config before network', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw Error('must not fetch'); };
  for (const patch of [{ url: 'https://evil.test' }, { headers: {} }, { namespace: 'other' }, { context: { namespace: 'demo:naver:account-b', generation: 1 } }, { messages: [{ mail_sn: '2147483648' }] }, { messages: [{ mail_sn: '01' }] }, { messages: [{ mail_sn: '101', extra: true }] }, { messages: Array(101).fill({ mail_sn: '101' }) }]) {
    await assert.rejects(call({ ...message(), ...patch }, sender, config, fetcher));
  }
  for (const bad of [{ ...sender, id: 'other' }, { ...sender, url: 'http://localhost:9999/' }, { ...sender, url: 'https://evil.test/' }, { ...sender, tab: undefined }]) await assert.rejects(call(message(), bad, config, fetcher));
  for (const origin of ['http://essmt.example.test', 'https://essmt.example.test/path', 'https://user:pass@essmt.example.test', 'https://essmt.example.test/?x=1']) await assert.rejects(call(message(), sender, { ...config, origin }, fetcher));
  assert.equal(calls, 0);
});
for (const status of [401, 403, 413, 415, 422, 500, 503]) test(`worker preserves HTTP ${status} without returning server error body`, async () => {
  await assert.rejects(call(message(), sender, config, async () => new Response('private diagnostic', { status })), { code: `HTTP_${status}` });
});
test('worker rejects malformed, partial and foreign results and generalizes network errors', async () => {
  for (const mutate of [r => r.namespace = 'other', r => r.results = [], r => r.results[0].tags[0].name = null]) {
    const body = result(); mutate(body);
    await assert.rejects(call(message(), sender, config, async () => new Response(JSON.stringify(body))), { code: 'INVALID_RESPONSE' });
  }
  await assert.rejects(call(message(), sender, config, async () => { throw Error('private host'); }), { code: 'NETWORK_ERROR' });
});

test('build configuration requires an explicit namespace and canonical HTTPS origin', () => {
  for (const namespace of [undefined, null, 1, '', 'bad namespace']) assert.throws(() => globalThis.ESSMTOverlay.validateConfig({ ...config, namespace }), { code: 'NOT_CONFIGURED' });
});
