import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function syntheticRepository(run) {
  const repository = await mkdtemp(path.join(tmpdir(), 'essmt-build-guard-'));
  try {
    await mkdir(path.join(repository, 'scripts'));
    await mkdir(path.join(repository, 'extension'));
    await writeFile(path.join(repository, 'package.json'), '{"type":"module"}');
    await writeFile(path.join(repository, 'extension', 'manifest.json'), JSON.stringify({ background: { service_worker: 'worker.js' }, options_page: 'options.html', permissions: ['storage'], host_permissions: ['https://example.test/*'], content_scripts: [{ matches: ['http://localhost/*'] }] }));
    await cp(new URL('../scripts/build-experimental.js', import.meta.url), path.join(repository, 'scripts', 'build-experimental.js'));
    const { buildExperimental } = await import(pathToFileURL(path.join(repository, 'scripts', 'build-experimental.js')));
    await run({ repository, buildExperimental });
  } finally { await rm(repository, { recursive: true, force: true }); }
}

test('experimental build rejects repository root and descendants before writing', async () => {
  await syntheticRepository(async ({ repository, buildExperimental }) => {
    await assert.rejects(buildExperimental(repository), /outside repository/);
    await assert.rejects(stat(path.join(repository, 'manifest.json')), { code: 'ENOENT' });
    const child = path.join(repository, 'generated');
    await assert.rejects(buildExperimental(child), /outside repository/);
    await assert.rejects(stat(child), { code: 'ENOENT' });
  });
});

test('default experimental artifact is outside repository and preserves source manifest', async () => {
  await syntheticRepository(async ({ repository, buildExperimental }) => {
    const artifact = await buildExperimental();
    try {
      assert.notEqual(path.resolve(artifact), path.resolve(repository));
      assert.equal(path.resolve(artifact).startsWith(path.resolve(repository) + path.sep), false);
      const output = JSON.parse(await readFile(path.join(artifact, 'manifest.json')));
      assert.deepEqual(output.content_scripts[0].matches, ['http://localhost/*', 'https://mail.naver.com/*']);
      assert.equal(output.background, undefined);
      assert.equal(output.options_page, undefined);
      assert.equal(output.permissions, undefined);
      assert.equal(output.host_permissions, undefined);
      const source = JSON.parse(await readFile(path.join(repository, 'extension', 'manifest.json')));
      assert.deepEqual(source.content_scripts[0].matches, ['http://localhost/*']);
    } finally { await rm(path.dirname(artifact), { recursive: true, force: true }); }
  });
});
