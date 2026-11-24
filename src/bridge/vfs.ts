// インメモリ仮想ファイルシステム。
// ネイティブアプリの CLIENT_WORK_FOLDER ({APPLY_FOLDER}/work) 構造を模倣する。
// パスはすべて POSIX 形式の絶対パス（先頭 /）。ディレクトリは暗黙に存在するものとみなす（明示的な空dirは無し）。
// ファイル内容は Uint8Array。テキスト操作には helper を用いる。

export interface VfsEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
}

export class VFS {
  private files = new Map<string, Uint8Array>();

  // パス正規化: 区切りを / に統一し、.. と . を解決。末尾スラッシュ除去。
  normalize(p: string): string {
    const raw = String(p).replace(/\\/g, '/');
    const parts = raw.split('/');
    const out: string[] = [];
    for (const part of parts) {
      if (part === '' || part === '.') continue;
      if (part === '..') {
        if (out.length) out.pop();
        continue;
      }
      out.push(part);
    }
    return '/' + out.join('/');
  }

  writeFile(path: string, data: Uint8Array | string): void {
    const p = this.normalize(path);
    if (typeof data === 'string') {
      this.files.set(p, new TextEncoder().encode(data));
    } else {
      this.files.set(p, new Uint8Array(data));
    }
  }

  readFile(path: string): Uint8Array {
    const p = this.normalize(path);
    const f = this.files.get(p);
    if (!f) throw new Error(`ENOENT: ${p}`);
    return f;
  }

  readText(path: string): string {
    return new TextDecoder('utf-8').decode(this.readFile(path));
  }

  exists(path: string): boolean {
    const p = this.normalize(path);
    if (this.files.has(p)) return true;
    // ディレクトリとして存在するか
    const prefix = p === '/' ? '/' : p + '/';
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }

  isFile(path: string): boolean {
    return this.files.has(this.normalize(path));
  }

  /** dir 直下（再帰なし・ディレクトリも列挙）のエントリ */
  list(dir: string): VfsEntry[] {
    const p = this.normalize(dir);
    const prefix = p === '/' ? '/' : p + '/';
    const seenDirs = new Set<string>();
    const out: VfsEntry[] = [];
    for (const [key, val] of this.files) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (rest === '') continue;
      const slash = rest.indexOf('/');
      if (slash === -1) {
        out.push({ path: key, name: rest, isDirectory: false, size: val.length });
      } else {
        const dirName = rest.slice(0, slash);
        if (!seenDirs.has(dirName)) {
          seenDirs.add(dirName);
          out.push({ path: prefix + dirName, name: dirName, isDirectory: true, size: 0 });
        }
      }
    }
    return out;
  }

  /** dir 配下を再帰的に列挙（ファイルのみ、正規化パスを返す） */
  listRecursive(dir: string): string[] {
    const p = this.normalize(dir);
    const prefix = p === '/' ? '/' : p + '/';
    const out: string[] = [];
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) out.push(key);
    }
    return out.sort();
  }

  remove(path: string): void {
    const p = this.normalize(path);
    if (this.files.delete(p)) return;
    const prefix = p + '/';
    let removed = 0;
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(prefix)) {
        this.files.delete(key);
        removed++;
      }
    }
    if (removed === 0) throw new Error(`ENOENT: ${p}`);
  }

  /** ファイルを rename/copy。dest がディレクトリ的ならその配下に入れる（ネイティブの Path.Combine 相当の最小実装） */
  rename(from: string, to: string): void {
    const src = this.normalize(from);
    const data = this.readFile(src);
    this.files.delete(src);
    this.writeFile(to, data);
  }

  /** 指定ディレクトリ以下をサフィックス一致で削除（.egovForm 等の掃除用） */
  deletePrefix(prefix: string): number {
    const p = this.normalize(prefix);
    let n = 0;
    for (const key of [...this.files.keys()]) {
      if (key === p || key.startsWith(p + '/') || key.startsWith(p + '_')) {
        this.files.delete(key);
        n++;
      }
    }
    return n;
  }

  clear(): void {
    this.files.clear();
  }
}

export const vfs = new VFS();
