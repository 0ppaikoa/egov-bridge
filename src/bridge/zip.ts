// fflate ベースの ZIP 読み書き。
// ネイティブ実装（System.IO.Compression）と同じく deflate、ディレクトリエントリは「<dir>/」。
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

/** unzip の結果を「正規化パス → 中身」の Map で返す。ディレクトリエントリはスキップ。 */
export function unzipToMap(bytes: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const entries = unzipSync(bytes);
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('/')) continue; // directory entry
    const clean = name.replace(/\\/g, '/').replace(/^\/+/, '');
    out.set(clean, data);
  }
  return out;
}

/** 相対パス -> bytes の Map から ZIP を作る。paths must use forward slashes and live under rootPrefix (e.g. "{identifier}"). */
export function zipFromEntries(entries: Map<string, Uint8Array>, options?: { level?: 0 | 1 | 6 | 9 }): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [name, data] of entries) {
    files[name] = data;
  }
  return zipSync(files, { level: options?.level ?? 6 });
}

export { strToU8, strFromU8 };
