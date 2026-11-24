// 添付ファイル系ブリッジコマンド（docs/command-catalog.md #1 / #40 / #54 / #58）。
//
// ページ（DOM）依存はすべて `PageEval` 注入に閉じ込める。未指定なら window.eval を使い、
// window が無い環境（node:test 等）では「ページ依存の処理だけ」を no-op / 明示エラーにする。
// これにより attach.ts はページ無しでテストできる。
import { vfs } from './vfs.ts';
import { base64ToBytes } from './bytes.ts';
import {
  ATTACHED_TYPE_ATTACHED,
  appendAttachedAttributesXml,
  addAttachDoneFileName,
  baseName,
  fileSizeKb,
  stageAttachment,
  type AttachedAttributeEntry,
} from './attach.ts';

/** ページ内 JS を評価する関数（ブラウザでは window.eval、テストではスタブ） */
export type PageEval = (js: string) => unknown;

function defaultPageEval(): PageEval | null {
  const w = (globalThis as { window?: { eval?: unknown } }).window;
  if (w && typeof w.eval === 'function') {
    return (js: string) => (w.eval as (s: string) => unknown)(js);
  }
  return null;
}

function resolvePageEval(pageEval?: PageEval): PageEval | null {
  return pageEval ?? defaultPageEval();
}

function evalString(fn: PageEval, js: string): string {
  const v = fn(js);
  return v == null ? '' : String(v);
}

function evalTruthy(fn: PageEval, js: string): boolean {
  const v = fn(js);
  return v === true || v === 1 || String(v).toLowerCase() === 'true';
}

/** JS の文字列リテラルにする（JSON 文字列は JS の式としてもそのまま有効） */
function jsStr(s: string): string {
  return JSON.stringify(String(s));
}

/**
 * SetAttachedFile2UIClass.setAttachedFile2UI（77418）の DOM 反映部分。
 * ファイル名・パス・サイズ（KB, 小数1桁切り上げ）を書き、チェックボックスと合計サイズを更新する。
 */
function applyAttachedFileToPage(
  fn: PageEval,
  index: string,
  name: string,
  path: string,
  sizeBytes: number,
): void {
  fn(`$('#file-upload-${index}').val(${jsStr(name)});`);
  fn(`$('#file-upload-path-${index}').val(${jsStr(path)});`);
  fn(`$('#file-size-${index}').text(${fileSizeKb(sizeBytes)});`);
  fn(
    `if (document.getElementById('checbox-${index}') != null) { $('#checbox-${index}').prop('checked', true); }`,
  );
  fn('sumFileSize();');
}

function parseIndex(value: string | undefined, label: string): string {
  const s = String(value ?? '').trim();
  if (!/^\d+$/.test(s)) throw new Error(`${label} が数値ではありません: ${value}`);
  return s;
}

// ---------------------------------------------------------------------------
// #1 AddAttachedFile_DragEnter
// ---------------------------------------------------------------------------

/**
 * ネイティブ実装（16171）は dragAndDropAppli.dragEnter(index) → dropflg/paramValue を立てるだけで、
 * 画面演出のための状態更新しかしない。bridge では Drop が index を引数で受け取るので不要 → no-op。
 * 引数: [index]
 */
export function cmdAddAttachedFileDragEnter(args: string[]): number {
  void args;
  return 0;
}

// ---------------------------------------------------------------------------
// #54 AddAttachedFile_Drop
// ---------------------------------------------------------------------------

/**
 * ネイティブ実装（16176）:
 *   1) eval "getDragDropFile(index)"        → base64 バイト列
 *   2) eval "$('#file-upload-index').val()" → ファイル名
 *   3) attachmenttemp/<yyyyMMddHHmmssfffffff>/<name> に書き出し
 *   4) dragAndDropAppli.drop() 相当（添付種別が「添付」の行か確認 → 添付に固定 → setAttachedFile2UI）
 * 引数: [index]
 * eval する JS 断片はネイティブのまま使う（window.eval 経由）。
 */
export function cmdAddAttachedFileDrop(args: string[], pageEval?: PageEval): number {
  const index = parseIndex(args[0], 'index');
  const fn = resolvePageEval(pageEval);
  if (!fn) {
    throw new Error('window.eval が使えない環境ではドラッグ&ドロップ添付を処理できません');
  }

  const base64 = evalString(fn, `getDragDropFile(${index})`);
  if (!base64) throw new Error(`getDragDropFile(${index}) の実行に失敗しました。`);

  const name = baseName(evalString(fn, `$('#file-upload-${index}').val();`));
  if (!name) throw new Error(`ファイル名を取得できませんでした: #file-upload-${index}`);

  // dragAndDropAppli.drop() 相当: 添付できない添付書類の行ならエラー（ネイティブ 69901-69911）
  const typeLabel = evalString(fn, `$('input[name=file-type-${index}]').next().text();`);
  if (!typeLabel.includes(ATTACHED_TYPE_ATTACHED)) {
    throw new Error('ファイルは添付できません。');
  }
  fn(`$('input[name=file-type-${index}]:eq(0)').prop('checked', true);`);
  // ネイティブは InvokeScript("selectSendType", index)。PageEval は JS 文字列のみ扱うので等価な呼び出しにする
  fn(`selectSendType(${index});`);

  const bytes = base64ToBytes(base64);
  const path = stageAttachment(name, bytes);
  applyAttachedFileToPage(fn, index, name, path, bytes.length);
  addAttachDoneFileName(name);
  return 0;
}

// ---------------------------------------------------------------------------
// #58 F3egclFileManageAppli_AppendAttachedAttribute
// ---------------------------------------------------------------------------

/**
 * ネイティブ F3egclFileManageAppli_AppendAttachedAttribute（14778）の中核部分。
 * 引数: [identifier, fabFormProcId, fabFormFileName, attachedLastIndex]
 *  - attachedLastIndex はページから渡る「生の文字列」（ネイティブは int.Parse する）。
 *    ここでも数値として解釈するが、検証は文字列のまま行い、行番号は 1..lastIndex で走査する。
 *  - 行ごとのチェック（SignatureAppli.setAttachedInfo: 79295-79301）:
 *      #area-add-file-<i> が存在する かつ (#checbox-<i> が無い、または checked)
 *  - 追記内容: 添付種別=行の file-type ラベル（既定 '添付'）, 添付書類名称=#file-name-<i>,
 *    添付書類ファイル名称=#file-upload-path-<i> のベース名, 提出情報='1'
 *  - ネイティブは backupAppliData → transcribeConfInfo → tagMapping 再実行（exeTagMappingFlag, 14825-14853）
 *    まで行うが、**ここでは tagMapping 再実行は行わない**（バックアップ/復元も未実装）。
 */
export function cmdAppendAttachedAttribute(args: string[], pageEval?: PageEval): number {
  const [identifier, fabFormProcId, fabFormFileName, attachedLastIndexRaw] = args;
  if (!identifier) throw new Error('identifier がありません');
  if (!fabFormProcId) throw new Error('fabFormProcId がありません');
  if (!fabFormFileName) throw new Error('fabFormFileName がありません');

  const raw = String(attachedLastIndexRaw ?? '').trim();
  const lastIndex = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isInteger(lastIndex)) {
    throw new Error(`attachedLastIndex が数値ではありません: ${attachedLastIndexRaw}`);
  }

  const koseiPath = `/work/${identifier}/${fabFormProcId}/${fabFormFileName}`;
  if (!vfs.isFile(koseiPath)) throw new Error(`構成情報ファイルが見つかりません: ${koseiPath}`);

  const fn = resolvePageEval(pageEval);
  if (lastIndex > 0 && !fn) {
    throw new Error(
      'pageEval が無いため添付属性を組み立てられません（添付行の読み取りが必要です）',
    );
  }

  const entries: AttachedAttributeEntry[] = [];
  if (fn) {
    const evalFn = fn;
    for (let i = 1; i <= lastIndex; i++) {
      const hasRow = evalTruthy(evalFn, `$('#area-add-file-${i}').length > 0`);
      if (!hasRow) continue;
      const checked = evalTruthy(
        evalFn,
        `$('#checbox-${i}').length == 0 || ($('#checbox-${i}').length > 0 && $('#checbox-${i}').prop('checked'))`,
      );
      if (!checked) continue;

      const attachType =
        evalString(evalFn, `$('input[name=file-type-${i}]:checked').next().text();`) ||
        ATTACHED_TYPE_ATTACHED;
      const docName = evalString(evalFn, `document.getElementById('file-name-${i}').value`);
      const sourcePath = evalString(evalFn, `$('#file-upload-path-${i}').val();`);
      const fileName = baseName(sourcePath) || docName;
      if (!fileName) continue;

      // ブリッジ側の適応: 参照先が仮想FS上にあるならプロセスフォルダへ複製する
      // （ネイティブはフルパスを属性に書くだけだが、collectProcFiles はファイル名で読む）
      if (sourcePath && vfs.isFile(sourcePath)) {
        vfs.writeFile(`/work/${identifier}/${fabFormProcId}/${fileName}`, vfs.readFile(sourcePath));
      }
      entries.push({ attachType, docName: docName || fileName, fileName, submit: '1' });
    }
  }

  vfs.writeFile(koseiPath, appendAttachedAttributesXml(vfs.readText(koseiPath), entries));
  for (const e of entries) addAttachDoneFileName(e.fileName);
  return 0;
}

// ---------------------------------------------------------------------------
// #40 F3egclFileManageAppli_SetAttachedFileSize
// ---------------------------------------------------------------------------

/**
 * ネイティブ（15030）は SetAttachedFile2UI を呼び直してサイズ表示・チェック状態・合計を更新する。
 * ここは骨組み: filePath が仮想FS上にあればサイズを計算し、pageEval で #file-size-<index> 等を更新する。
 * pageEval が無い場合は何もせず 0 を返す（no-op）。
 * 引数: [index, filePath]
 */
export function cmdSetAttachedFileSize(args: string[], pageEval?: PageEval): number {
  const index = parseIndex(args[0], 'index');
  const filePath = String(args[1] ?? '');
  if (!filePath) throw new Error('filePath がありません');

  const fn = resolvePageEval(pageEval);
  if (!fn) return 0;

  const name = baseName(filePath);
  if (!name) throw new Error(`ファイル名を取得できません: ${filePath}`);
  if (!vfs.isFile(filePath)) throw new Error(`ファイルが見つかりません: ${filePath}`);
  const size = vfs.readFile(filePath).length;
  applyAttachedFileToPage(fn, index, name, filePath, size);
  return 0;
}
