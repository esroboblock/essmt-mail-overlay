// Only local build-time configuration can select the destination. No secrets needed.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import '../extension/identity.js';
import '../extension/bridge.js';
import '../extension/adapters.js';
import '../extension/worker-core.js';
import path from 'node:path';

export async function buildExtension({ origin, namespace, naver = false, destination } = {}) {
  const config = { origin, namespace, demoNamespace: 'demo:naver:account-a', ...(naver ? { naver: true } : {}) };
  globalThis.ESSMTOverlay.validateConfig(config);
  const root = new URL('../', import.meta.url);
  const output = destination ?? fileURLToPath(new URL(naver ? 'dist/naver-essmt/' : 'dist/extension/', root));
  await mkdir(output, { recursive: true });
  await cp(new URL('extension/', root), output, { recursive: true });
  const manifestPath = path.join(output, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath));
  manifest.host_permissions = [config.origin + '/*'];
  if (naver) {
    manifest.name = 'ESSMT Mail Overlay — Naver ESSMT Development';
    manifest.description = 'Read-only Naver mail list overlay for ESSMT development.';
    manifest.content_scripts[0].matches = ['https://mail.naver.com/*'];
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(output, 'config.js'), 'globalThis.ESSMT_CONFIG = ' + JSON.stringify(config) + ';\n');
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const naver = process.argv[2] === '--naver';
  if (naver && process.env.ESSMT_NAVER_PROFILE_CONFIRMED !== '1') {
    throw new Error('Confirm the Naver account and ESSMT dataset match with ESSMT_NAVER_PROFILE_CONFIRMED=1');
  }
  const output = await buildExtension({ origin: process.env.ESSMT_ORIGIN, namespace: process.env.ESSMT_NAMESPACE, naver });
  console.log('Configured extension created in ' + output);
}
