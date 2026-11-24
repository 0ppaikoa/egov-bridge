// dist/ の中身を dist/egov-bridge-<version>.zip に固める（ストア提出用）
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import archiver from 'archiver';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const out = `dist/egov-bridge-${pkg.version}.zip`;
mkdirSync('dist', { recursive: true });

const output = createWriteStream(out);
const archive = archiver('zip', { zlib: { level: 9 } });
archive.pipe(output);

// manifest.json など dist 直下の必須ファイル + 再帰
archive.directory('dist/', false, (entry) => {
  // zip 自身は入れない
  if (entry.name.endsWith('.zip')) return false;
  return entry;
});

await archive.finalize();
await new Promise((res, rej) => {
  output.on('close', res);
  output.on('error', rej);
});
console.log('wrote', out, `(${archive.pointer()} bytes)`);
