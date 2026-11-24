// initAppli / initDocumentDetails の単体テスト（ネットワークはモック）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseApplyList,
  initAppli,
  initDocumentDetails,
  CONTROL_TYPE,
} from '../src/bridge/init-appli.ts';
import { vfs } from '../src/bridge/vfs.ts';
import { state } from '../src/bridge/state.ts';

const SEP_RECORD = ';;;';
const SEP_FIELD = ':::';

// 16 フィールドのレコードを組み立てる（[0] は未使用）
function record({
  procId = '20251',
  formFile = 'form-01.xml',
  actionType = '4',
  fabFileName = 'kousei.xml',
  tagMapping = 'tagMapping.xml',
  signType = '1',
  dispProcName = '労働保険料等還付請求',
} = {}) {
  return [
    '0',
    procId,
    procId, // formInfo.procId
    'F001', // formId
    '1', // formVersion
    '様式1', // formName
    formFile, // formFileName
    'check.xml', // serverCheckFileName
    '1', // fabFormversion
    '10', // applyDataMax
    signType, // signType
    dispProcName, // dispProcName
    actionType, // actionType
    fabFileName, // fabFileName
    tagMapping, // tagMappingFileName
    '0', // gbizIdSignOmitApplyFlag
  ].join(SEP_FIELD);
}

test('parseApplyList: 区切り文字とフィールド順をネイティブどおりに解釈する', () => {
  const list = parseApplyList(record());
  assert.equal(list.length, 1);
  assert.equal(list[0].procId, '20251');
  assert.equal(list[0].actionType, '4');
  assert.equal(list[0].signType, '1');
  assert.equal(list[0].dispProcName, '労働保険料等還付請求');
  assert.equal(list[0].fabFileName, 'kousei.xml');
  assert.equal(list[0].tagMappingFileName, 'tagMapping.xml');
  assert.equal(list[0].gbizIdSignOmitApplyFlag, '0');
  const forms = list[0].formInfoList;
  assert.equal(forms.length, 1);
  assert.equal(forms[0].formFileName, 'form-01.xml');
});

test('parseApplyList: 複数レコードを ;;; で分割する', () => {
  const list = parseApplyList([record(), record({ procId: '20252' })].join(SEP_RECORD));
  assert.equal(list.length, 2);
  assert.equal(list[1].procId, '20252');
});

test('parseApplyList: 空文字は例外', () => {
  assert.throws(() => parseApplyList(''), /paramList:null/);
});

test('initAppli: INIT でダウンロードし、state.applyInfo を設定し、ページへXMLを渡す', async () => {
  vfs.clear();
  state.applyInfo = null;

  const downloaded = [];
  const pageCalls = [];
  const pageEval = (js) => {
    pageCalls.push(js);
    if (js.includes('partAmendSoapFlag')) return '';
    if (js.includes('typeof F3egclSetXMLDoc')) return false;
    return 0;
  };

  const result = await initAppli(
    [
      CONTROL_TYPE.INIT,
      '001',
      'id-1',
      '20251',
      'kousei.xml',
      '20251',
      'form-01.xml',
      '',
      'tagMapping.xml',
      record(),
      'false',
      '',
      '',
    ],
    {
      pageEval,
      download: async (identifier) => {
        downloaded.push(identifier);
        vfs.writeFile(
          `/work/${identifier}/20251/kousei.xml`,
          '<DataRoot><構成情報 ID="構成情報"/></DataRoot>',
        );
        vfs.writeFile(
          `/work/${identifier}/20251/form-01.xml`,
          '<申請書情報><A>old</A></申請書情報>',
        );
        vfs.writeFile(`/work/${identifier}/20251/tagMapping.xml`, '<タグマッピング/>');
        return { folder: `/work/${identifier}`, entries: [], written: 0, skipped: 0 };
      },
    },
  );

  assert.equal(result, 0);
  assert.deepEqual(downloaded, ['id-1']);
  assert.equal(state.applyInfo?.length, 1);
  assert.equal(state.applyInfo?.[0].procId, '20251');
  // ApplyFormXml2UI がページ関数を呼んでいる
  assert.ok(pageCalls.some((js) => js.includes('F3egclCallSetXMLDoc')));
});

test('initAppli: identifier が無ければ例外', async () => {
  await assert.rejects(
    () =>
      initAppli([
        '0',
        '001',
        '',
        '20251',
        'k',
        '20251',
        'f.xml',
        '',
        't.xml',
        record(),
        'false',
        '',
        '',
      ]),
    /identifier/,
  );
});

test('initDocumentDetails: strHtml が無ければ例外', () => {
  assert.throws(() => initDocumentDetails(['[]'], { pageEval: () => '' }), /strHtml/);
});

test('initDocumentDetails: 添付ファイル名が空なら 0', () => {
  const code = initDocumentDetails(['[]'], { pageEval: () => '<html/>' });
  assert.equal(code, 0);
});

test('initDocumentDetails: 添付ファイル名がある場合は未確定エラー（推測でダウンロードしない）', () => {
  const pageEval = (js) => (js.includes('strHtml') ? '<html/>' : 'value');
  assert.throws(() => initDocumentDetails(['["attach1"]'], { pageEval }), /未確定/);
});
