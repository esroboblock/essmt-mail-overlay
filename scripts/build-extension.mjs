// Only local build-time configuration can select the destination. No secrets needed.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import '../extension/identity.js';
import '../extension/bridge.js';
import '../extension/worker-core.js';
const config = { origin: process.env.ESSMT_ORIGIN, namespace: process.env.ESSMT_NAMESPACE, demoNamespace: 'demo:naver:account-a' };
globalThis.ESSMTOverlay.validateConfig(config);
const root = new URL('../', import.meta.url);
const output = new URL('dist/extension/', root);
await mkdir(output, { recursive: true });
await cp(new URL('extension/', root), output, { recursive: true });
const manifest = JSON.parse(await readFile(new URL('manifest.json', output)));
manifest.host_permissions = [config.origin + '/*'];
await writeFile(new URL('manifest.json', output), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(new URL('config.js', output), 'globalThis.ESSMT_CONFIG = ' + JSON.stringify(config) + ';\n');
console.log('Configured extension created in ' + fileURLToPath(output));
