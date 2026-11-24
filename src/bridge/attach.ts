// 添付ファイル処理の本体（ネイティブの AddAttachedFile_* / F3egclFileManageAppli_*Attached* 相当）。
//
// ネイティブ側の流れ（eGovClient.dll.decompiled.cs）:
//   - AddAttachedFile_Drop (16176): window.eval で getDragDropFile(index) の base64 と
//     $('#file-upload-<index>').val() のファイル名を読み、
//     CLIENT_WORK_TEMP_FOLDER(= {work}/attachmenttemp)/<yyyyMMddHHmmssfffffff>/<name> に書き出す（16190-16210）。
//   - SetAttachedFile2UIClass.setAttachedFile2UI (77418): サイズ・ファイル名文字種・拡張子を検証し、
//     attachDoneFileNameList にファイル名を積む。
//   - SignatureAppli.setAttachedInfo (79279): kousei.xml の <添付書類属性情報> を全削除してから、
//     画面の行 (1..attachedLastIndex) ごとに 添付種別/添付書類名称/添付書類ファイル名称/提出情報 を追記して保存する。
//
// このモジュールは DOM/ページに一切依存しない（ページ依存は commands-attach.ts 側の pageEval 注入に閉じ込める）。
import { vfs } from './vfs.ts';
import { childElements, firstElementByTag, parseXml, serializeXml } from './xmlutil.ts';

export const WORK_ROOT = '/work';
/** ネイティブの CLIENT_WORK_TEMP_FOLDER（D&D の一時展開先） */
export const ATTACH_TEMP_ROOT = '/work/attachmenttemp';

export const TAG_ATTACH_ATTRIBUTE = '添付書類属性情報';
export const TAG_ATTACH_TYPE = '添付種別';
export const TAG_ATTACH_DOCNAME = '添付書類名称';
export const TAG_ATTACH_FILENAME = '添付書類ファイル名称';
export const TAG_ATTACH_SUBMIT = '提出情報';

/** 添付種別の既定値（ネイティブ ConfInfoFile.ATTACHED_TYPE_ATTACHED） */
export const ATTACHED_TYPE_ATTACHED = '添付';
/** 提出情報の値（ネイティブ ConfInfoFile.ATTACHED_CHECK） */
export const ATTACHED_CHECK = '1';

/** ページから受け取って attachmenttemp に置いたファイル */
export interface StagedAttachment {
  /** ファイル名（プロセスフォルダに置くときの名前） */
  name: string;
  /** attachmenttemp 配下の仮想パス */
  path: string;
}

/** kousei.xml の <添付書類属性情報> 1件分 */
export interface AttachedAttributeEntry {
  attachType: string;
  docName: string;
  fileName: string;
  submit: string;
}

// ---------------------------------------------------------------------------
// attachDoneFileNameList 相当
//
// ネイティブは FileManageAppli のインスタンスフィールド List<string> attachDoneFileNameList（12541）で、
// initAttachList() で初期化される（17417）。bridge では state.ts を編集しない方針のため、
// このモジュール内の module-level 配列で管理する（ブラウザではバンドルごとに1つ）。
// ---------------------------------------------------------------------------
let attachDoneFileNameList: string[] = [];

/** 添付済みファイル名のスナップショット（呼び出し側で書き換えられないようコピーを返す） */
export function getAttachDoneFileNames(): string[] {
  return attachDoneFileNameList.slice();
}

/** 添付済みファイル名を登録する。既に登録済みなら false（ネイティブの Contains ガード相当） */
export function addAttachDoneFileName(name: string): boolean {
  const n = String(name ?? '').trim();
  if (!n || attachDoneFileNameList.includes(n)) return false;
  attachDoneFileNameList.push(n);
  return true;
}

/** 添付済みファイル名リストの初期化（F3egclFileManageAppli_initAttachList 相当） */
export function resetAttachDoneFileNames(): void {
  attachDoneFileNameList = [];
}

// ---------------------------------------------------------------------------
// パス・ファイル名ヘルパ
// ---------------------------------------------------------------------------

/** パスからファイル名部分を取り出す（ネイティブ Path.GetFileName 相当。区切りは / と \ の両方） */
export function baseName(p: string): string {
  const s = String(p ?? '').replace(/\\/g, '/');
  const i = s.lastIndexOf('/');
  return i === -1 ? s : s.slice(i + 1);
}

function procDirPath(identifier: string, procId: string): string {
  return `${WORK_ROOT}/${identifier}/${procId}`;
}

/** ディレクトリに置いてよいファイル名か（区切り文字・親参照を含まない単一セグメント） */
function assertPlainFileName(name: string): string {
  const n = String(name ?? '');
  if (!n) throw new Error('ファイル名が空です');
  if (n !== baseName(n) || n === '.' || n === '..') {
    throw new Error(`ファイル名にパス区切りは使用できません: ${n}`);
  }
  return n;
}

/**
 * ネイティブの `DateAndTime.Now.ToString("yyyyMMddHHmmssfffffff")` 相当。
 * f は秒の小数部（100ns 単位）なので、ミリ秒3桁 + 0 埋め4桁で表現する。
 */
export function formatTempDirName(now: Date = new Date()): string {
  const p = (v: number, w = 2) => String(v).padStart(w, '0');
  const base =
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return base + p(now.getMilliseconds(), 3) + '0000';
}

/** ネイティブの `Math.Ceiling(bytes / 1024 * 10) / 10`（KB、小数1桁切り上げ）相当 */
export function fileSizeKb(sizeBytes: number): number {
  return Math.ceil((sizeBytes / 1024) * 10) / 10;
}

// ---------------------------------------------------------------------------
// ステージング（ページから受け取った bytes を attachmenttemp に置く）
// ---------------------------------------------------------------------------

/**
 * bytes を `/work/attachmenttemp/<タイムスタンプ>/<name>` に保存し、その仮想パスを返す。
 * タイムスタンプディレクトリはネイティブ同様に一意になるまで 1ms ずつ進める。
 * 既存の attachmenttemp の中身には触れない（呼び出し側で掃除する）。
 */
export function stageAttachment(
  name: string,
  bytes: Uint8Array | string,
  now: Date = new Date(),
): string {
  const fileName = assertPlainFileName(name);
  let cursor = new Date(now.getTime());
  let dir = `${ATTACH_TEMP_ROOT}/${formatTempDirName(cursor)}`;
  for (let guard = 0; vfs.exists(dir); guard++) {
    if (guard > 10000) throw new Error('attachmenttemp の一時フォルダ名を確保できません');
    cursor = new Date(cursor.getTime() + 1);
    dir = `${ATTACH_TEMP_ROOT}/${formatTempDirName(cursor)}`;
  }
  const path = `${dir}/${fileName}`;
  vfs.writeFile(path, bytes);
  return path;
}

/** Base64 文字列を attachmenttemp に保存する（AddAttachedFile_Drop の取り込み部分） */
export function stageAttachmentFromBase64(
  name: string,
  base64: string,
  now: Date = new Date(),
): string {
  const bytes = Uint8Array.from(atob(String(base64).replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  return stageAttachment(name, bytes, now);
}

// ---------------------------------------------------------------------------
// kousei.xml（構成情報）への添付書類属性情報の追記
// ---------------------------------------------------------------------------

function setTextElement(doc: Document, tag: string, value: string): Element {
  const el = doc.createElement(tag);
  el.appendChild(doc.createTextNode(value));
  return el;
}

/**
 * 構成情報XML（kousei.xml）の <添付書類属性情報> を全削除してから entries を追記した文字列を返す。
 * ネイティブは setAttachedInfo（79279）で `removeAttachedAttributeAll()` → `appendAttachedAttribute()`
 * を繰り返す。子要素の順序も 添付種別 / 添付書類名称 / 添付書類ファイル名称 / 提出情報（67724-67743）。
 * entries が空の場合は全削除だけを行う（ネイティブは attachedLastIndex=0 のとき何も保存しないが、
 * ここでは「添付なし」の状態を明示できるよう削除結果を返す）。
 */
export function appendAttachedAttributesXml(
  koseiXml: string,
  entries: AttachedAttributeEntry[],
): string {
  const doc = parseXml(koseiXml);
  const comp = firstElementByTag(doc, '構成情報');
  if (!comp) throw new Error('構成情報要素が見つかりません');

  // removeAttachedAttributeAll 相当（構成情報の直下のみ）
  for (const el of childElements(comp)) {
    if (el.tagName === TAG_ATTACH_ATTRIBUTE) comp.removeChild(el);
  }

  for (const e of entries) {
    const attr = doc.createElement(TAG_ATTACH_ATTRIBUTE);
    attr.appendChild(setTextElement(doc, TAG_ATTACH_TYPE, e.attachType));
    attr.appendChild(setTextElement(doc, TAG_ATTACH_DOCNAME, e.docName));
    attr.appendChild(setTextElement(doc, TAG_ATTACH_FILENAME, e.fileName));
    attr.appendChild(setTextElement(doc, TAG_ATTACH_SUBMIT, e.submit));
    comp.appendChild(attr);
  }

  const out = serializeXml(doc);
  // xmldom は宣言を保持するが、落ちた場合に備えて元の宣言を付け直す
  if (!/^\s*<\?xml/.test(out)) {
    const decl = /^\s*(<\?xml[^>]*\?>)/.exec(koseiXml);
    if (decl?.[1]) return `${decl[1]}\n${out}`;
  }
  return out;
}

/** 構成情報XMLから <添付書類属性情報> を読み出す（テスト・検証用） */
export function readAttachedAttributeEntries(koseiXml: string): AttachedAttributeEntry[] {
  const doc = parseXml(koseiXml);
  const comp = firstElementByTag(doc, '構成情報');
  if (!comp) throw new Error('構成情報要素が見つかりません');
  const text = (parent: Element, tag: string) => {
    for (const el of childElements(parent)) {
      if (el.tagName === tag) return el.textContent?.trim() ?? '';
    }
    return '';
  };
  const out: AttachedAttributeEntry[] = [];
  for (const el of childElements(comp)) {
    if (el.tagName !== TAG_ATTACH_ATTRIBUTE) continue;
    out.push({
      attachType: text(el, TAG_ATTACH_TYPE),
      docName: text(el, TAG_ATTACH_DOCNAME),
      fileName: text(el, TAG_ATTACH_FILENAME),
      submit: text(el, TAG_ATTACH_SUBMIT),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 添付の確定
// ---------------------------------------------------------------------------

/**
 * 添付確定処理。ステージ済みファイルを `/work/{identifier}/{procId}/` にコピーし、
 * kousei.xml の <添付書類属性情報> を「現在の添付一覧」で書き直して保存する。
 *
 * ネイティブとの差異（重要）:
 *  - ネイティブの 添付書類ファイル名称 には画面の `#file-upload-path-<n>` の値（OS のフルパス）が入る（79299）。
 *    bridge の作業フォルダは仮想FSで完結するため、プロセスフォルダへコピーした上でファイル名のみを書く
 *    （procfiles.ts の collectProcFiles がファイル名で読む前提と一致させる）。
 *  - ネイティブは添付属性の追記後に exeTagMappingFlag による tagMapping 再実行を行うが、ここでは行わない。
 *  - attachmenttemp 側は削除しない（ネイティブも Drop の一時ファイルは明示削除しない）。
 *
 * @returns 0（成功。失敗は throw。dispatcher が reject に変換する）
 */
export function attachFiles(
  identifier: string,
  procId: string,
  confInfoName: string,
  staged: StagedAttachment[],
): number {
  if (!identifier) throw new Error('identifier がありません');
  if (!procId) throw new Error('procId がありません');
  if (!confInfoName) throw new Error('confInfoName がありません');

  const dir = procDirPath(identifier, procId);
  const koseiPath = `${dir}/${assertPlainFileName(confInfoName)}`;
  if (!vfs.isFile(koseiPath)) throw new Error(`構成情報ファイルが見つかりません: ${koseiPath}`);

  const list = Array.isArray(staged) ? staged : [];
  const entries: AttachedAttributeEntry[] = [];
  // 1) 先に全ファイルをコピーする（途中で失敗しても kousei.xml を壊さないため）
  for (const item of list) {
    const name = assertPlainFileName(item?.name);
    if (!item.path) throw new Error(`ステージ済みファイルのパスがありません: ${name}`);
    if (!vfs.isFile(item.path))
      throw new Error(`ステージ済みファイルが見つかりません: ${item.path}`);
    vfs.writeFile(`${dir}/${name}`, vfs.readFile(item.path));
    entries.push({
      attachType: ATTACHED_TYPE_ATTACHED,
      docName: name,
      fileName: name,
      submit: ATTACHED_CHECK,
    });
  }

  // 2) kousei.xml を書き直す（添付が0件でも既存の属性は消して「添付なし」にする）
  const koseiXml = vfs.readText(koseiPath);
  vfs.writeFile(koseiPath, appendAttachedAttributesXml(koseiXml, entries));

  // 3) attachDoneFileNameList に登録
  for (const e of entries) addAttachDoneFileName(e.fileName);
  return 0;
}
