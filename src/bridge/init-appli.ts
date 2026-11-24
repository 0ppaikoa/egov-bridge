// F3egclInitAppli_initAppli / F3egclInitAppli_initDocumentDetails の再実装。
// 根拠: eGovClient.dll.decompiled.cs 12686–13030（initAppli）、12953（initDocumentDetails）、
//       13011（ApplyFormXml2UI）、75043（setApplyList）、87143（ControlTypeCode）
import { vfs } from './vfs.ts';
import { downloadAppliForm } from './download.ts';
import { transcribeConfInfo } from './tagmapping.ts';
import { parseXml, elementsByTag, textContent } from './xmlutil.ts';
import { state, type ApplyInfo } from './state.ts';
import { log } from './log.ts';

/** ネイティブ CommonCodes.ControlTypeCode（87143） */
export const CONTROL_TYPE = {
  INIT: '0',
  RELOAD: '1',
  RESTART: '2',
  BASIC_INFO_SET: '3',
  CHANGE_PROC: '4',
  CHANGE_FORM: '5',
  ADD_FORM: '6',
  ADD_COPY_FORM: '7',
  DEL_COPY_FORM: '8',
  API: '9',
} as const;

/** ネイティブ CommonCodes.ProcTypeCode（87180〜） */
export const PROC_TYPE = {
  NEW_APPLY: '001',
  JOIN_NAME: '002',
  SIGNATURE_AD: '003',
  SEND_ONLY: '004',
  STATE_REFERENCE: '005',
  PART_AMEND: '013',
  REAMEND: '014',
  CANCEL_REQUEST: '016',
  CHANGE_CONTACT: '018',
  CHANGE_USER: '019',
  THIRD_PARTY_VERIFY: '021',
  WRITE_APPLY: '022',
  SIGN_ATTACHED: '023',
  APPLY_SEND: '024',
} as const;

// ネイティブの区切り定数（75037–75041）
const SEP_RECORD = ';;;';
const SEP_FIELD = ':::';
const SEP_SUBFIELD = '___';

export type PageEval = (js: string) => unknown;

function defaultPageEval(): PageEval | null {
  const w = (globalThis as { window?: { eval?: unknown } }).window;
  if (w && typeof w.eval === 'function')
    return (js: string) => (w.eval as (s: string) => unknown)(js);
  return null;
}

/**
 * InitAppli.setApplyList（75043）の再実装。
 * レコード区切り ";;;"、フィールド区切り ":::"、サブフィールド区切り "___"。
 * フィールド順: [1]=procId, [2..8]=formInfo の7配列, [9]=applyDataMax, [10]=signType,
 *              [11]=dispProcName, [12]=actionType, [13]=fabFileName, [14]=tagMappingFileName,
 *              [15]=gbizIdSignOmitApplyFlag
 */
export function parseApplyList(procInfoListStr: string): ApplyInfo[] {
  if (!procInfoListStr) throw new Error('paramList:null');
  const out: ApplyInfo[] = [];
  for (const record of procInfoListStr.split(SEP_RECORD)) {
    if (record === '') continue;
    const f = record.split(SEP_FIELD);
    if (f.length < 16) throw new Error(`applyInfo のフィールド数が不足しています: ${f.length}`);
    const sub = (i: number) => (f[i] ?? '').split(SEP_SUBFIELD);
    const [
      procIds,
      formIds,
      formVersions,
      formNames,
      formFileNames,
      serverCheckNames,
      fabFormVersions,
    ] = [sub(2), sub(3), sub(4), sub(5), sub(6), sub(7), sub(8)];
    const formInfoList = [];
    for (let j = 0; j < procIds.length; j++) {
      formInfoList.push({
        procId: procIds[j] ?? '',
        formId: formIds[j] ?? '',
        formVersion: formVersions[j] ?? '',
        formName: formNames[j] ?? '',
        formFileName: formFileNames[j] ?? '',
        serverCheckFileName: serverCheckNames[j] ?? '',
        fabFormversion: fabFormVersions[j] ?? '',
      });
    }
    out.push({
      procId: f[1] ?? '',
      formInfoList,
      applyDataMax: f[9] ?? '',
      signType: f[10] ?? '',
      dispProcName: f[11] ?? '',
      actionType: f[12] ?? '',
      fabFileName: f[13] ?? '',
      tagMappingFileName: f[14] ?? '',
      gbizIdSignOmitApplyFlag: f[15] ?? '',
    });
  }
  return out;
}

function procFolder(identifier: string, procId: string): string {
  return `/work/${identifier}/${procId}`;
}

/**
 * ApplyFormXml2UI（13011）相当: 申請データXMLを読み、ページへ反映する。
 * ネイティブは callF3egclCallSetXMLDoc 経由で
 *   ・ページに F3egclSetXMLDoc があれば setXMLFormInfo(xmldoc, F3egclMappingInfo, ...) を内部呼び出し
 *   ・無ければ F3egclCallSetXMLDoc(xmldoc) を直接呼ぶ
 * ここでは後者（ページ関数呼び出し）を再現し、前者は注入コールバックで受ける。
 */
export interface ApplyFormDeps {
  pageEval?: PageEval;
  /** ページが F3egclSetXMLDoc を持つ場合の内部処理（forminfo.ts 実装後に接続） */
  setXmlFormInfo?: (
    xmlDoc: string,
    mappingXml: string,
    structureXml: string,
    repeatXml: string,
  ) => number;
}

export function applyFormXml2UI(
  identifier: string,
  procId: string,
  applyFormProcId: string,
  applyFormFileName: string,
  addSignFlag: boolean,
  deps: ApplyFormDeps = {},
): void {
  // ネイティブ: bAddSignFlag かつ actionType=="2" のとき applyFormProcId を procId に差し替える
  let targetProc = applyFormProcId;
  if (addSignFlag) {
    const bean = (state.applyInfo ?? []).find((x) => String(x.procId) === applyFormProcId);
    if (bean && String(bean.actionType) === '2') targetProc = procId;
  }
  const path = `${procFolder(identifier, targetProc)}/${applyFormFileName}`;
  const xmlDoc = vfs.readText(path);

  const pageEval = deps.pageEval ?? defaultPageEval();
  if (!pageEval) throw new Error('applyFormXml2UI: ページコンテキストがありません');

  const hasSetXmlDoc = Boolean(pageEval("typeof F3egclSetXMLDoc !== 'undefined'"));
  if (!hasSetXmlDoc) {
    const result = pageEval(
      `(function(){ try { return F3egclCallSetXMLDoc(${JSON.stringify(xmlDoc)}); } catch (e) { return -1; } })()`,
    );
    const code = Number(result);
    if (Number.isFinite(code) && code < 0) throw new Error(`F3egclCallSetXMLDoc():${code}`);
    return;
  }
  // ページ側 setXMLFormInfo 経路
  if (!deps.setXmlFormInfo) {
    throw new Error(
      '未確定: ページが F3egclSetXMLDoc を持つ場合の setXMLFormInfo 連携が未実装です',
    );
  }
  const mappingXml = String(pageEval('F3egclMappingInfo') ?? '');
  const structureXml = String(pageEval('F3egclDataStructure') ?? '');
  const repeatXml = String(pageEval('F3egclRepeatItem') ?? '');
  const code = deps.setXmlFormInfo(xmlDoc, mappingXml, structureXml, repeatXml);
  if (code < 0) throw new Error(`F3egclCallSetXMLDoc():${code}`);
}

export interface InitAppliDeps extends ApplyFormDeps {
  /** テスト用: downloadAppliForm の差し替え */
  download?: typeof downloadAppliForm;
}

/**
 * F3egclInitAppli_initAppli（12686）の再実装。
 * args: controlType, procType, identifier, procId, procFabFormFileName, applyFormProcId,
 *       applyFormFileName, applyFormFileNameListStr, tagMappingFileName, appliListStr,
 *       addSignFlag, addFormProcIdListStr, deleteFormProcIdListStr
 */
export async function initAppli(args: string[], deps: InitAppliDeps = {}): Promise<number> {
  const [
    controlType,
    procType,
    identifier,
    procId,
    procFabFormFileName,
    applyFormProcId,
    applyFormFileName,
    applyFormFileNameListStr,
    _tagMappingFileName,
    appliListStr,
    addSignFlag,
    addFormProcIdListStr,
    deleteFormProcIdListStr,
  ] = args;

  if (!identifier) throw new Error('identifier がありません');
  if (!procId) throw new Error('procId がありません');

  const addSign = String(addSignFlag) === 'true' || String(addSignFlag) === 'True';
  const pageEval = deps.pageEval ?? defaultPageEval();
  const download = deps.download ?? downloadAppliForm;

  // 1) setApplyList
  const applyList = parseApplyList(String(appliListStr ?? ''));
  state.applyInfo = applyList;

  // 2) partAmendSoapFlag をページから取得
  const soapFlag = pageEval
    ? Boolean(
        pageEval(
          "document.getElementsByName('partAmendSoapFlag') ? document.getElementsByName('partAmendSoapFlag')[0].value : ''",
        ),
      )
    : false;
  state.exeTagMappingFlag = procType !== PROC_TYPE.PART_AMEND || soapFlag;
  state.singlePartSignFlag = applyList.filter((x) => String(x.actionType) === '1').length === 0;

  // 3) controlType 分岐
  if (controlType === CONTROL_TYPE.INIT) {
    await download(identifier);
    state.dicAttachedDocFileNameStatus = new Map();
  } else if (controlType === CONTROL_TYPE.BASIC_INFO_SET) {
    await download(identifier, { overwrite: true, copyOnly: false });
    const folder = procFolder(identifier, procId);
    const src = `${folder}/kousei_riyousha.xml`;
    if (vfs.isFile(src)) {
      // replaceConfManageContent: 利用者情報の構成管理をコピー
      vfs.writeFile(`${folder}/${procFabFormFileName}`, vfs.readFile(src));
    }
    // 各サブフォルダの kousei_riyousha.xml を削除
    for (const p of vfs.listRecursive(`/work/${identifier}`)) {
      if (p.endsWith('/kousei_riyousha.xml')) vfs.remove(p);
    }
  } else if (controlType === CONTROL_TYPE.RESTART) {
    // setAttachedFileSize + 添付済み一覧の再構築 + 追加ダウンロード
    for (const bean of applyList) {
      if (String(bean.actionType) === '2') continue;
      const folder = procFolder(identifier, String(bean.procId));
      const kousei = `${folder}/${String(bean.fabFileName)}`;
      if (!vfs.isFile(kousei)) continue;
      try {
        const doc = parseXml(vfs.readText(kousei));
        const targetKey = state.singlePartSignFlag
          ? String(applyList.find((x) => String(x.actionType) === '4')?.procId ?? '')
          : String(bean.procId);
        let map = state.dicAttachedDocFileNameStatus.get(targetKey);
        if (!map) {
          map = new Map();
          state.dicAttachedDocFileNameStatus.set(targetKey, map);
        }
        for (const attrs of elementsByTag(doc, '添付書類属性情報')) {
          const nameEl = elementsByTag(attrs, '添付書類ファイル名称')[0];
          const name = nameEl ? textContent(nameEl) : '';
          if (name && !map.has(name)) map.set(name, true);
        }
      } catch (e) {
        log('restart: 添付情報の読み取りに失敗', kousei, e);
      }
    }
    if (!addSign) await download(identifier, { overwrite: false, copyOnly: true });
  }

  // 4) INIT/BASIC_INFO_SET かつ exeTagMappingFlag なら transcribeConfInfo
  if (
    (controlType === CONTROL_TYPE.INIT || controlType === CONTROL_TYPE.BASIC_INFO_SET) &&
    state.exeTagMappingFlag
  ) {
    let confInfoName = '';
    let kouseiProcId = '';
    for (const bean of applyList) {
      const actionType = String(bean.actionType);
      if (actionType === '1' || actionType === '4') {
        kouseiProcId = String(bean.procId);
        confInfoName = String(bean.fabFileName);
        if (actionType === '4') continue;
      }
      if (actionType === '3') continue;

      const formFiles = (bean.formInfoList as { formFileName?: string }[])
        .map((f) => f.formFileName ?? '')
        .filter((f) => f !== '');
      const folder = procFolder(identifier, String(bean.procId));
      const confPath = `${procFolder(identifier, kouseiProcId)}/${confInfoName}`;
      const mappingPath = `${folder}/${String(bean.tagMappingFileName)}`;
      if (!vfs.isFile(confPath) || !vfs.isFile(mappingPath)) {
        throw new Error(
          `transcribeConfInfo: 必要なファイルがありません (${confPath} / ${mappingPath})`,
        );
      }
      const appliFiles = new Map<string, string>();
      for (const f of formFiles) {
        const p = `${folder}/${f}`;
        if (vfs.isFile(p)) appliFiles.set(f, vfs.readText(p));
      }
      const res = transcribeConfInfo(vfs.readText(confPath), vfs.readText(mappingPath), appliFiles);
      if (res.ruleCount > 0) {
        for (const [name, xml] of res.files) vfs.writeFile(`${folder}/${name}`, xml);
      }
    }
  }

  // 5) ADD_FORM
  if (controlType === CONTROL_TYPE.ADD_FORM) {
    if (addFormProcIdListStr) await download(identifier, { overwrite: false, copyOnly: true });
    if (deleteFormProcIdListStr) {
      for (const proc of deleteFormProcIdListStr.split(SEP_FIELD)) {
        if (!proc) continue;
        // F3egclXMLDataAppli_deleteFormPartSign 相当（フォルダ削除）
        vfs.deletePrefix(procFolder(identifier, proc));
      }
    }
  }

  // 6) finally: ApplyFormXml2UI
  try {
    applyFormXml2UI(
      identifier,
      procId,
      String(applyFormProcId),
      String(applyFormFileName),
      addSign,
      deps,
    );
  } catch (e) {
    // ネイティブは失敗時に作業データを消して元の戻り値を優先する
    log('ApplyFormXml2UI に失敗:', e);
    throw e;
  }

  log('initAppli 完了', { controlType, procType, identifier, procId, applyFormFileNameListStr });
  return 0;
}

/**
 * F3egclInitAppli_initDocumentDetails（12953）の再実装。
 * initWorkData → 公文書ダウンロード（Koubunsho）→ 添付ファイル名一覧の処理。
 * 公文書ダウンロードはネットワークに出るため、URL解決に必要な情報が未確定な現状では明示エラーにする。
 */
export function initDocumentDetails(args: string[], deps: ApplyFormDeps = {}): number {
  const [strAttachedFileNames] = args;
  const pageEval = deps.pageEval ?? defaultPageEval();
  if (!pageEval) throw new Error('initDocumentDetails: ページコンテキストがありません');

  const html = String(
    pageEval(
      "var e=document.getElementsByName('strHtml'); (e && e.length>0 && e[0]) ? e[0].value : ''",
    ),
  );
  if (!html) throw new Error('initDocumentDetails: strHtml がページにありません');

  const names: string[] = JSON.parse(strAttachedFileNames || '[]');
  if (names.length === 0) return 0;

  // 各ファイル名の hidden input から値を読む（ネイティブ downloadFile("Koubunsho", ...) 相当）
  const collected: string[] = [];
  for (const name of names) {
    const value = String(
      pageEval(
        `var e=document.getElementsByName(${JSON.stringify(name)}); (e && e.length>0 && e[0]) ? e[0].value : ''`,
      ),
    );
    if (value) collected.push(name);
  }
  throw new Error(
    '未確定: 公文書ダウンロード（downloadFile("Koubunsho", ...)）の取得先URLと保存規則が未確定です。' +
      `対象: ${collected.join(', ') || '(なし)'}`,
  );
}
