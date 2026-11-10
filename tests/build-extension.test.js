import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('local build grants one HTTPS host and keeps source installation Mock-only', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'overlay-build-'));
  try {
    await cp(new URL('../extension', import.meta.url), path.join(dir, 'extension'), { recursive: true });
    await mkdir(path.join(dir, 'scripts'));
    await cp(new URL('../scripts/build-extension.mjs', import.meta.url), path.join(dir, 'scripts/build-extension.mjs'));
    await writeFile(path.join(dir, 'package.json'), '{"type":"module"}');
    const env = { ...process.env, ESSMT_ORIGIN: 'https://essmt.example.test', ESSMT_NAMESPACE: 'synthetic:naver:team' };
    execFileSync(process.execPath, [path.join(dir, 'scripts/build-extension.mjs')], { env });
    const manifest = JSON.parse(await readFile(path.join(dir, 'dist/extension/manifest.json')));
    assert.deepEqual(manifest.host_permissions, ['https://essmt.example.test/*']);
    assert.deepEqual(manifest.permissions, ['storage']);
    assert.deepEqual(manifest.content_scripts.flatMap(script => script.matches), ['http://127.0.0.1/*', 'http://localhost/*']);
    assert.match(await readFile(path.join(dir, 'dist/extension/config.js'), 'utf8'), /synthetic:naver:team/);
    const source = JSON.parse(await readFile(path.join(dir, 'extension/manifest.json')));
    assert.equal(source.host_permissions, undefined);
    assert.throws(() => execFileSync(process.execPath, [path.join(dir, 'scripts/build-extension.mjs')], { env: { ...env, ESSMT_ORIGIN: 'http://essmt.example.test' }, stdio: 'pipe' }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
