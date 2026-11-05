import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMockApi } from '../demo/src/mock-api.js';
import { identifyMail } from '../demo/src/identity.js';

const mails = JSON.parse(await readFile(new URL('../demo/fixtures/mails.json', import.meta.url)));
const tags = JSON.parse(await readFile(new URL('../demo/fixtures/tags.json', import.meta.url)));
const namespace = 'demo:naver:account-a';
const api = () => createMockApi({ mails, tags });
const request = (...ids) => ({ namespace, messages: ids.map(mail_sn => ({ mail_sn, folder_sn: '0' })) });

test('fixtures have unique IDs, valid references and consistent identity expectations', () => {
  assert.equal(new Set(mails.messages.map(m => m.mail_sn)).size, 6);
  assert.equal(new Set(mails.dom_rows.map(r => r.row_id)).size, 10);
  assert.equal(tags.namespace, mails.namespace);
  for (const m of mails.messages) {
    assert.ok(m.tag_ids.every(id => tags.tags.some(t => t.id === id)));
    assert.ok(m.status === 'matched' ? m.candidate_count === 1 : m.tag_ids.length === 0);
  }
  for (const row of mails.dom_rows) {
    assert.equal(identifyMail(row.link_path, row.class_mail_sn)?.mail_sn ?? null, row.expected_mail_sn);
  }
});

test('identity rejects partial, conflicting, external and imprecise identifiers', () => {
  for (const [path, cls] of [[null, '101'], ['/v2/popup/read/0/101', '102'], ['/v2/popup/read/0/01', '01'], ['https://evil.test/v2/popup/read/0/101', '101'], ['/v2/popup/read/0/101?x=1', '101']]) {
    assert.equal(identifyMail(path, cls), null);
  }
  assert.deepEqual(identifyMail('/v2/popup/read/1/9007199254740993123', '9007199254740993123'), { folder_sn: '1', mail_sn: '9007199254740993123' });
});

test('batch lookup separates matched-empty, unmatched and ambiguous and deduplicates SN', async () => {
  const response = await api().lookupTags(request('101', '102', '103', '104', '105', '105', '999'));
  assert.equal(response.namespace, namespace);
  assert.deepEqual(response.results.map(r => [r.mail_sn, r.status, r.candidate_count, r.tags.map(t => t.id)]), [
    ['101', 'matched', 1, ['tag-1', 'tag-2']], ['102', 'matched', 1, []], ['103', 'unmatched', 0, []],
    ['104', 'ambiguous', 2, []], ['105', 'matched', 1, ['tag-3']], ['999', 'unmatched', 0, []]
  ]);
});

test('list searches text, pages, preserves duplicates and folder context', async () => {
  const service = api();
  const first = await service.listMails({ namespace, page: 1, page_size: 2 });
  assert.equal(first.total, 10);
  assert.deepEqual(first.rows.map(r => r.row_id), ['row-101', 'row-102']);
  const second = await service.listMails({ namespace, page: 2, page_size: 2 });
  assert.deepEqual(second.rows.map(r => r.row_id), ['row-103', 'row-104']);
  const search = await service.listMails({ namespace, query: '중복' });
  assert.deepEqual(search.rows.map(r => r.row_id), ['row-105-a', 'row-105-b']);
  const sent = await service.listMails({ namespace, folder: 'sent' });
  assert.deepEqual(sent.rows.map(r => r.link_path), ['/v2/popup/read/1/105']);
  assert.equal((await service.listMails({ namespace, query: 'no-result' })).total, 0);
  assert.equal((await service.listMails({ namespace, page: 999, page_size: 2 })).page, 5);
});

test('scenario filters expose fixture states without modifying originals', async () => {
  const service = api();
  for (const [scenario, ids] of [['normal', ['row-101']], ['no-tags', ['row-102']], ['unmatched', ['row-103']], ['ambiguous', ['row-104']], ['duplicate', ['row-105-a', 'row-105-b']], ['unidentified', ['row-missing', 'row-malformed', 'row-conflict']], ['safe-title', ['row-106']], ['reuse', ['row-101']], ['thread', ['row-101', 'row-102']]]) {
    const result = await service.listMails({ namespace, scenario });
    assert.deepEqual(result.rows.map(r => r.row_id), ids);
  }
  const result = await service.lookupTags(request('101'));
  result.results[0].tags[0].name = 'changed';
  assert.equal((await service.lookupTags(request('101'))).results[0].tags[0].name, '합성 분류 가');
});

test('account B is isolated and unknown namespaces rejected', async () => {
  const service = api();
  const other = { ...request('101'), namespace: 'demo:naver:account-b' };
  assert.equal((await service.lookupTags(other)).results[0].status, 'unmatched');
  assert.equal((await service.listMails(other)).total, 0);
  await assert.rejects(service.lookupTags({ ...other, namespace: 'production' }), { code: 'INVALID_REQUEST' });
});

test('malformed requests reject rather than normalize identifiers or silently truncate batches', async () => {
  const service = api();
  for (const messages of [[{ mail_sn: 101, folder_sn: '0' }], [{ mail_sn: '01', folder_sn: '0' }], [{ mail_sn: '101', folder_sn: 0 }], Array.from({ length: 101 }, () => ({ mail_sn: '101', folder_sn: '0' })), null]) {
    await assert.rejects(service.lookupTags({ namespace, messages }), { code: 'INVALID_REQUEST' });
  }
  for (const options of [{ page: 0 }, { page_size: 0 }, { scenario: 'unknown' }, { folder: 'unknown' }]) {
    await assert.rejects(service.listMails({ namespace, ...options }), { code: 'INVALID_REQUEST' });
  }
  assert.deepEqual((await service.lookupTags(request())).results, []);
});

for (const [fault, code, status] of [['401', 'UNAUTHORIZED', 401], ['403', 'FORBIDDEN', 403], ['500', 'SERVER_ERROR', 500], ['offline', 'OFFLINE', 0], ['timeout', 'TIMEOUT', 0]]) {
  test(`lookup simulates ${fault} and retry succeeds`, async () => {
    const service = api();
    await assert.rejects(service.lookupTags(request('101'), { fault, delay_ms: 5, timeout_ms: 10 }), { code, status });
    assert.equal((await service.lookupTags(request('101'))).results[0].status, 'matched');
  });
}

test('slow lookup is asynchronous, cancellable and keeps its request snapshot', async () => {
  const service = api();
  const input = request('101');
  const start = performance.now();
  const pending = service.lookupTags(input, { fault: 'slow', delay_ms: 35 });
  input.messages[0].mail_sn = '102';
  assert.equal((await pending).results[0].mail_sn, '101');
  assert.ok(performance.now() - start >= 25);
  const controller = new AbortController();
  const aborted = service.lookupTags(request('101'), { fault: 'slow', delay_ms: 1000, signal: controller.signal });
  controller.abort();
  await assert.rejects(aborted, { name: 'AbortError' });
});

test('invalid top-level list inputs and sparse batches produce contract errors', async () => {
  const service = api();
  for (const input of [null, 'not-an-object', []]) {
    await assert.rejects(service.listMails(input), { code: 'INVALID_REQUEST' });
  }
  await assert.rejects(service.lookupTags({ namespace, messages: new Array(1) }), { code: 'INVALID_REQUEST' });
});
