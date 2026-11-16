import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/identity.js';
import '../extension/bridge.js';
import '../extension/adapters.js';
import '../extension/worker-core.js';
import '../extension/detail-core.js';

const { detailRoute, requestDetail } = globalThis.ESSMTOverlay;
const origin = 'http://localhost:4173';
const config = { origin: 'https://localhost:8443', namespace: 'synthetic:naver:team', demoNamespace: 'demo:naver:account-a', detailFixture: true };

test('detail route is exact and shares the server SN bounds', () => {
  assert.deepEqual(detailRoute(new URL(origin + '/v2/read/-1/101'), origin), { folder_sn: '-1', mail_sn: '101' });
  for (const path of ['/v2/popup/read/-1/101', '/v2/read/-1/01', '/v2/read/01/101', '/v2/read/-1/2147483648', '/v2/read/-1/101#x', '/v2/read/-1/101?x', '/v2/read/-1/101/']) {
    assert.equal(detailRoute(new URL(origin + path), origin), null, path);
  }
});

test('detail transport follows merged ESSMT shapes and fixed namespace', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push([url, JSON.parse(options.body), options]);
    return Response.json(url.endsWith('suggestions')
      ? { tags: [{ id: '7', name: '<tag>' }], target_token: 'opaque' }
      : url.endsWith('attach') ? { tag: { id: '7', name: '<tag>' }, changed: false } : { changed: true });
  };
  const target = { mail_sn: '101', folder_sn: '-1' };
  const suggestion = await requestDetail(config, target, 'suggestions', { query: '' }, fetcher);
  await requestDetail(config, target, 'attach', { tag_id: '7', target_token: suggestion.target_token }, fetcher);
  await requestDetail(config, target, 'attach', { name: 'new', target_token: 'opaque' }, fetcher);
  await requestDetail(config, target, 'detach', { tag_id: '7', target_token: 'opaque' }, fetcher);
  assert.deepEqual(calls.map(([url, body]) => [url.split('/').at(-1), body]), [
    ['suggestions', { namespace: config.namespace, mail_sn: '101', query: '' }],
    ['attach', { namespace: config.namespace, mail_sn: '101', tag_id: '7', target_token: 'opaque' }],
    ['attach', { namespace: config.namespace, mail_sn: '101', name: 'new', target_token: 'opaque' }],
    ['detach', { namespace: config.namespace, mail_sn: '101', tag_id: '7', target_token: 'opaque' }]
  ]);
  assert.ok(calls.every(([url, , options]) => url.startsWith(config.origin + '/api/browser-overlay/email-tags/') &&
    options.credentials === 'include' && options.redirect === 'error' && options.headers['X-ESSMT-Overlay'] === '1'));
  await assert.rejects(requestDetail(config, target, 'attach', { tag_id: '7', name: 'bad', target_token: 'opaque' }, fetcher), { code: 'INVALID_REQUEST' });
  await assert.rejects(requestDetail(config, target, 'suggestions', { namespace: 'other' }, fetcher), { code: 'INVALID_REQUEST' });
  await assert.rejects(requestDetail(config, target, 'suggestions', {}, async () => Response.json({ tags: [], target_token: '' })), { code: 'INVALID_RESPONSE' });
});
