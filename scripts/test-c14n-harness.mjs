// c14n の検証: lxml (reference) と JS 実装の出力を比較する
// 使い方: node scripts/test-c14n.mjs <case.xml> [more.xml...]
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DOMParser } from '@xmldom/xmldom';
import { c14n } from '../src/c14n.js';

const args = process.argv.slice(2);
const subtreeIdx = args[0] === '--subtree' ? parseInt(args[1], 10) : -1;
const files = args.filter(a => !a.startsWith('--') && a !== String(subtreeIdx));
let failed = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const dom = new DOMParser().parseFromString(src, 'application/xml');
  const node = subtreeIdx >= 0 ? dom.documentElement.childNodes[subtreeIdx] : dom;
  if (subtreeIdx >= 0) {
    // lxml 側: Document ではなくその要素を c14n する
    const py = `import sys,lxml.etree as ET\nraw=sys.stdin.buffer.read()\ndoc=ET.fromstring(raw)\nel=list(doc)[${subtreeIdx}]\nsys.stdout.buffer.write(ET.tostring(el, method='c14n'))\n`;
    const mine = Buffer.from(c14n(node), 'utf8');
    const ref = execFileSync('python3', ['-c', py], { input: src, env: { ...process.env, PYTHONPATH: '/data/profiles/aok/cache/scratch/pylibs' } });
    const ok = mine.equals(ref);
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + f + ' [subtree ' + subtreeIdx + ']');
    if (!ok) { failed++; console.log('--- mine ---\n' + mine + '\n--- lxml ---\n' + ref); }
    continue;
  }
  const mine = Buffer.from(c14n(dom), 'utf8');
  const ref = execFileSync('python3', ['/data/profiles/aok/cache/scratch/lxml_c14n.py'], { input: src, env: { ...process.env, PYTHONPATH: '/data/profiles/aok/cache/scratch/pylibs' } });
  const ok = mine.equals(ref);
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + f);
  if (!ok) {
    failed++;
    console.log('--- mine ---');
    console.log(mine.toString());
    console.log('--- lxml ---');
    console.log(ref.toString());
  }
}
process.exit(failed ? 1 : 0);
