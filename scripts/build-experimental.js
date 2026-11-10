import { cp, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
export async function buildExperimental(destination) {
  const source = fileURLToPath(new URL('../extension/', import.meta.url));
  const output = destination ?? path.join(await mkdtemp(path.join(tmpdir(), 'essmt-naver-mock-')), 'extension');
  const repository = fileURLToPath(new URL('../', import.meta.url));
  if (path.resolve(output) === path.resolve(repository) || path.resolve(output).startsWith(path.resolve(repository) + path.sep)) throw new Error('Experimental output must be outside repository');
  await cp(source, output, { recursive: true, errorOnExist: true, force: false });
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json')));
  manifest.name = 'ESSMT Mail Overlay — Experimental Naver Mock';
  manifest.description = 'Experimental synthetic local Mock only. No production tag lookup.';
  delete manifest.background;
  delete manifest.options_page;
  delete manifest.permissions;
  delete manifest.host_permissions;
  manifest.content_scripts[0].matches.push('https://mail.naver.com/*');
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return output;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(await buildExperimental());
