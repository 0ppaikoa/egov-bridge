// ネットワークを伴わない小〜中規模コマンド群。
// 移植元（デコンパイル: /tmp/aok/egov-recon/decomp/eGovClient.dll.decompiled.cs）:
//   SetMinistRefInfo                       15358
//   SetPresentationOrgInfo                 15243
//   F3egclInitAppli_restartLogin           17648（呼び出し）/ RaiseRestartFromLogout 23862
//   F3egclXMLDataAppli_SelectCertificateUI 17345
// 保存形式は既存モジュール（signature.ts 等）と同じく parseXml → serializeXml →
// vfs.writeFile 経由。ネイティブの AppliCommonUtility.SaveXml（タブインデント / LF /
// BOM なし）とは字面が一致しないが、ブリッジ内の他コマンドと同一の直列化器を使う
// （XML のバイト一致性が要求される署名経路は signature.ts 側で扱う）。
import { vfs } from './vfs.ts';
import { parseXml, serializeXml, childElements } from './xmlutil.ts';
import { log } from './log.ts';

const WORK_ROOT = '/work';

function requireArg(value: string | undefined, name: string): string {
  if (value == null || value === '') throw new Error(`${name} がありません`);
  return value;
}

/** {CLIENT_WORK_FOLDER}/{identifier}/{procId}/{fileName} 相当 */
function procFilePath(identifier: string, procId: string, fileName: string): string {
  return `${WORK_ROOT}/${identifier}/${procId}/${fileName}`;
}

/** 構成情報XMLを読み込む（ネイティブの XDocument.Load 相当。存在しなければエラー） */
function loadConfXml(path: string): Document {
  if (!vfs.isFile(path)) throw new Error(`構成情報XMLがありません: ${path}`);
  return parseXml(vfs.readText(path));
}

/** XDocument.Element("DataRoot") 相当。無ければネイティブでは NullReferenceException になる */
function dataRoot(doc: Document): Element {
  const root = doc.documentElement as unknown as Element | null;
  if (!root) throw new Error('構成情報XMLのルート要素がありません');
  if (root.nodeName !== 'DataRoot') {
    throw new Error(`構成情報XMLのルート要素が DataRoot ではありません: ${root.nodeName}`);
  }
  return root;
}

/** XElement.Element(tag) 相当（直下の子要素のみ）。無ければ例外 */
function requireChild(parent: Element, tag: string, pathLabel: string): Element {
  for (const child of childElements(parent)) {
    if (child.nodeName === tag) return child;
  }
  throw new Error(`構成情報XMLの要素がありません: ${pathLabel}/${tag}`);
}

/** XElement.Element(tag) に相当するが、無ければ生成して末尾に追加する（SetPresentationOrgInfo 専用） */
function ensureChild(doc: Document, parent: Element, tag: string, pathLabel: string): Element {
  for (const child of childElements(parent)) {
    if (child.nodeName === tag) return child;
  }
  const created = doc.createElement(tag) as unknown as Element;
  parent.appendChild(created as unknown as Node);
  log(`構成情報XMLに要素を追加しました: ${pathLabel}/${tag}`);
  return created;
}

/** XElement.SetValue(string) 相当: 子ノードを捨ててテキストノード1個だけにする */
function setElementValue(doc: Document, el: Element, value: string): void {
  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(doc.createTextNode(value) as unknown as Node);
}

function decodeBase64Utf8(b64: string): string {
  const atobFn = (globalThis as { atob?: (s: string) => string }).atob;
  if (typeof atobFn !== 'function') throw new Error('この環境では Base64 デコードができません');
  let binary: string;
  try {
    binary = atobFn(b64);
  } catch {
    throw new Error('applyFormFileData が Base64 として不正です');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * ネイティブ `SetMinistRefInfo`（15358）の移植。
 *
 * 引数: identifier, fabFormProcId, fabFormFileName, ministRefInfoListStr,
 *       applyFormFileName, applyFormFileData
 *
 * ネイティブの動作（15380〜15423）:
 *   1. identifier / fabFormProcId / fabFormFileName が空なら 4001 で失敗。
 *   2. applyFormFileName と applyFormFileData が「両方」非空のときだけ、
 *      Base64(UTF-8) を復号し `{proc}/{applyFormFileName}` を上書き保存する
 *      （FileManageAppli.saveXmlData → save() は CRLF を LF に正規化して UTF-8 で書く）。
 *   3. `{proc}/{fabFormFileName}`（= kousei.xml）を XDocument.Load。
 *   4. ministRefInfoListStr を ',' で分割し、i = 1..n について
 *        DataRoot/構成情報/府省照会情報/府省照会{i}/府省照会情報
 *      の値を i 番目の要素で **上書き**する（.SetValue = 既存テキストの置換。
 *      空タグの生成も、府省照会N 要素の追加もしない）。
 *   5. 保存して procStatus 0 を返す。
 *
 * 相違点（意図的）:
 *   - `eGovClientCommonResources.FilePathMaxLength` の実値が未展開のため、
 *     ネイティブのパス長チェック（15400）は行わない。
 *   - applyFormFileName / applyFormFileData の片方だけが指定された場合、
 *     ネイティブは黙って無視するが、本実装は取り違えを防ぐため例外にする。
 *   - 府省照会情報 / 府省照会{i} / 府省照会情報 のいずれかが欠けている場合、
 *     ネイティブは NullReferenceException で落ちる。本実装は要素名を明示した
 *     例外を投げる（推測でタグを作らない）。
 */
export function cmdSetMinistRefInfo(args: string[]): number {
  const [
    identifierRaw,
    fabFormProcIdRaw,
    fabFormFileNameRaw,
    ministRefInfoListStr,
    applyFormFileName,
    applyFormFileData,
  ] = args;
  const identifier = requireArg(identifierRaw, 'identifier');
  const fabFormProcId = requireArg(fabFormProcIdRaw, 'fabFormProcId');
  const fabFormFileName = requireArg(fabFormFileNameRaw, 'fabFormFileName');
  if (ministRefInfoListStr == null) throw new Error('ministRefInfoListStr がありません');

  const hasApplyFileName = applyFormFileName != null && applyFormFileName !== '';
  const hasApplyFileData = applyFormFileData != null && applyFormFileData !== '';
  if (hasApplyFileName !== hasApplyFileData) {
    throw new Error(
      'applyFormFileName と applyFormFileData は両方指定するか、両方省略してください（ネイティブは片方のみの場合を黙殺する）',
    );
  }

  if (hasApplyFileName && hasApplyFileData) {
    const applyPath = procFilePath(identifier, fabFormProcId, applyFormFileName as string);
    if (!vfs.isFile(applyPath)) throw new Error(`申請書XMLがありません: ${applyPath}`);
    // save() 相当: UTF-8 / BOMなし / CRLF → LF
    const text = decodeBase64Utf8(applyFormFileData as string).replace(/\r\n/g, '\n');
    vfs.writeFile(applyPath, text);
    log('SetMinistRefInfo: 申請書XMLを書き戻しました', applyPath);
  }

  const confPath = procFilePath(identifier, fabFormProcId, fabFormFileName);
  const doc = loadConfXml(confPath);

  const kousei = requireChild(dataRoot(doc), '構成情報', 'DataRoot');
  const container = requireChild(kousei, '府省照会情報', 'DataRoot/構成情報');

  const values = ministRefInfoListStr.split(',');
  for (let i = 0; i < values.length; i++) {
    const index = i + 1;
    const row = requireChild(container, `府省照会${index}`, 'DataRoot/構成情報/府省照会情報');
    const target = requireChild(
      row,
      '府省照会情報',
      `DataRoot/構成情報/府省照会情報/府省照会${index}`,
    );
    setElementValue(doc, target, values[i] as string);
  }

  vfs.writeFile(confPath, serializeXml(doc));
  return 0;
}

/**
 * ネイティブ `SetPresentationOrgInfo`（15243）の移植。
 *
 * 引数: identifier, fabFormProcId, fabFormFileName, applyFormProcId,
 *       applyFormFileName, presentationOrgId, presentationOrgName
 *
 * 実装範囲（重要）:
 *   ネイティブは 15277 で `F3egclXMLDataAppli_saveAppliData(identifier, applyFormProcId,
 *   applyFormFileName, addStylesheetFlag: false)` を先に呼び、ページ（WebView）の入力値を
 *   XML へ同期してから 提出先情報 を書き換える。その後 15294〜15346 で
 *   `exeTagMappingFlag` が真なら applyInfoBeanList を走査して transcribeConfInfo /
 *   callF3egclCallSetXMLDoc（= tagMapping 再実行）を行う。
 *
 *   本実装はそのうち **(b) 提出先情報の書き換えと保存のみ** を行う。
 *   - 「ページ→XML 同期（saveAppliData）」は別タスク。ここでは呼ばない。
 *   - 「tagMapping 再実行（transcribeConfInfo / 画面反映）」も別タスク。ここでは呼ばない。
 *   - applyInfoBeanList（= コンテキスト依存の申請情報一覧）には触れない。
 *   したがって applyFormProcId / applyFormFileName は受け取るが未使用。
 *
 * 書き換え規則（15284〜15292）:
 *   DataRoot/構成情報/提出先情報/提出先識別子 ← presentationOrgId（SetValue）
 *   DataRoot/構成情報/提出先情報/提出先名称   ← presentationOrgName（SetValue）
 *   SetValue なので既存テキストの置換（子ノードは破棄）。
 *
 * 相違点（意図的・推測を含む）:
 *   - ネイティブは `.Element("提出先識別子")` を null チェック無しで呼ぶため、要素が無ければ
 *     NullReferenceException になる。タスク指示に従い、本実装は 提出先情報 /
 *     提出先識別子 / 提出先名称 が無ければ **生成する**。生成位置（兄弟の末尾）は
 *     スキーマ順を確認できていないための推測であり、ネイティブの挙動からは導けない。
 *   - presentationOrgId / presentationOrgName が undefined の場合は空文字として扱う
 *     （.NET の SetValue(null) 相当）。
 *   - FilePathMaxLength チェックは行わない（SetMinistRefInfo と同じ理由）。
 */
export function cmdSetPresentationOrgInfo(args: string[]): number {
  const [
    identifierRaw,
    fabFormProcIdRaw,
    fabFormFileNameRaw,
    applyFormProcId,
    applyFormFileName,
    presentationOrgId,
    presentationOrgName,
  ] = args;
  const identifier = requireArg(identifierRaw, 'identifier');
  const fabFormProcId = requireArg(fabFormProcIdRaw, 'fabFormProcId');
  const fabFormFileName = requireArg(fabFormFileNameRaw, 'fabFormFileName');
  void applyFormProcId;
  void applyFormFileName;

  const confPath = procFilePath(identifier, fabFormProcId, fabFormFileName);
  const doc = loadConfXml(confPath);

  const kousei = requireChild(dataRoot(doc), '構成情報', 'DataRoot');
  const presentation = ensureChild(doc, kousei, '提出先情報', 'DataRoot/構成情報');
  const idEl = ensureChild(doc, presentation, '提出先識別子', 'DataRoot/構成情報/提出先情報');
  const nameEl = ensureChild(doc, presentation, '提出先名称', 'DataRoot/構成情報/提出先情報');

  setElementValue(doc, idEl, presentationOrgId ?? '');
  setElementValue(doc, nameEl, presentationOrgName ?? '');

  vfs.writeFile(confPath, serializeXml(doc));
  log('SetPresentationOrgInfo: 提出先情報を更新しました', confPath);
  return 0;
}

/**
 * ネイティブ `F3egclInitAppli_restartLogin(url)`（17648）の移植。
 *
 * ネイティブは `Main.GetMainPage()?.RaiseRestartFromLogout(url)` を呼び、そこで
 * procId / groupId を破棄して `Navigate(InitialUrl)` する（23862〜23870）。
 * つまり **引数 url は実際には使われず、初期URLへ戻る**。ブリッジには初期URLの
 * 概念が無いため、呼び出し元が渡した url へ location.assign で遷移する
 * （タスク指示による簡略化）。
 *
 * テストから差し替えられるよう、`globalThis.location` を呼び出し時に読む
 * （ブラウザでは window.location と同一）。
 */
export function cmdRestartLogin(args: string[]): number {
  const url = requireArg(args[0], 'url');
  const loc = (globalThis as { location?: { assign?: (u: string) => void } }).location;
  if (!loc || typeof loc.assign !== 'function') {
    throw new Error('restartLogin: location.assign が利用できません');
  }
  loc.assign(url);
  return 0;
}

/**
 * ネイティブ `F3egclXMLDataAppli_SelectCertificateUI()`（17345）の移植（意図的スタブ）。
 *
 * ネイティブは PKCS#11（JPKI 等のローカル証明書）を列挙するダイアログを出し、
 * 選択結果を `getCertInfo(cert, caCert, "", "", "", "", serial)` でページへ返す。
 * ブリッジはデジタル認証（スマホ署名）経路のみを実装しており、ローカル証明書で
 * 署名する経路を持たないため、このコマンドは **何もせず 0 を返す**。
 * ページ側が getCertInfo の応答を待つ実装でも、署名へ進まなければ実害は無い。
 */
export function cmdSelectCertificateUI(): number {
  log('SelectCertificateUI: デジタル認証経路では不要なため何もしません（0 を返します）');
  return 0;
}

/**
 * `F3egclXMLDataAppli_saveAppliData`（= ページ入力値 → XML 同期）の経路。
 *
 * 未実装。ネイティブ実装はページ側 JS（F3egclGetValue / getXMLFormInfo）から
 * 画面の入力値を読み出して XML に反映するため、ブリッジ単体では再現できない。
 * dispatch への登録は呼び出し側（commands-index.ts）が行う。
 *
 * @throws 常に例外（黙って成功を返さない）
 */
export function cmdSaveAppliDataPlaceholder(): number {
  throw new Error('この経路は未実装（getXMLFormInfo 依存）');
}
