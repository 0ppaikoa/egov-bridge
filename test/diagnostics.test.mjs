// 診断情報のサニタイズ検証（個人情報が混ざらないこと）
import test from 'node:test';
import assert from 'node:assert/strict';
// 実装から直接 import（.ts を node が型除去して読む）
const { collectDiagnostics, hexToDecimal, census, mappingItems } =
  await import('../src/bridge/diagnostics.ts');

const SECRET = '山田太郎の個人情報';
const WORK_XML = `<申請書情報><申請者><氏名>${SECRET}</氏名><住所>東京都千代田区1-1</住所></申請者></申請書情報>`;
const MAPPING = `<mapping>
  <map><itemName>氏名</itemName><xpath>申請書情報/申請者/氏名</xpath></map>
  <map><itemName>明細</itemName><xpath>申請書情報/明細</xpath><repeat/></map>
</mapping>`;

test('census: タグ名と属性名だけを数え、テキストは含めない', () => {
  const c = census(WORK_XML);
  assert.equal(c.present, true);
  assert.equal(c.root, '申請書情報');
  assert.equal(c.tags['申請者'], 1);
  assert.equal(c.tags['氏名'], 1);
  const json = JSON.stringify(c);
  assert.ok(!json.includes(SECRET), '値が出力に含まれてはいけない');
  assert.ok(!json.includes('東京都'), '住所が出力に含まれてはいけない');
});

test('census: 空文字は present:false', () => {
  assert.deepEqual(census(''), { present: false, tags: {}, attrs: {} });
});

test('mappingItems: itemName / xpath / repeat だけを取り出す', () => {
  const items = mappingItems(MAPPING);
  assert.equal(items.length, 2);
  assert.equal(items[0].itemName, '氏名');
  assert.equal(items[0].xpath, '申請書情報/申請者/氏名');
  assert.equal(items[0].isRepeat, false);
  assert.equal(items[1].isRepeat, true);
});

test('hexToDecimal: &#xHEX; 形式を復元する', () => {
  const hex = [...WORK_XML]
    .map((ch) => `&#x${ch.charCodeAt(0).toString(16).toUpperCase()};`)
    .join('');
  assert.equal(hexToDecimal(hex), WORK_XML);
});

test('collectDiagnostics: ページの値を含まず、構造だけを返す', () => {
  globalThis.location = { pathname: '/recept/foo' };
  globalThis.window = {
    __egovBridgeInstalled: true,
    __egovCmdLog: ['F3egclInitAppli_initAppli', 'F3egclXMLDataAppli_getXMLFormInfo'],
    F3egclMappingInfo: MAPPING,
    F3egclDataStructure: [...WORK_XML]
      .map((ch) => `&#x${ch.charCodeAt(0).toString(16).toUpperCase()};`)
      .join(''),
    F3egclRepeatItem: '',
  };

  const dump = collectDiagnostics();
  assert.equal(dump.bridgeInstalled, true);
  assert.deepEqual(dump.commandLog, [
    'F3egclInitAppli_initAppli',
    'F3egclXMLDataAppli_getXMLFormInfo',
  ]);
  assert.equal(dump.mapping.items?.[0].itemName, '氏名');
  assert.equal(dump.structure.tags['氏名'], 1);

  const json = JSON.stringify(dump);
  assert.ok(!json.includes(SECRET), '氏名の値が含まれてはいけない');
  assert.ok(!json.includes('東京都'), '住所が含まれてはいけない');
});

test('collectDiagnostics: グローバルが無くても落ちない', () => {
  globalThis.location = { pathname: '/x' };
  globalThis.window = {};
  const dump = collectDiagnostics();
  assert.equal(dump.bridgeInstalled, false);
  assert.deepEqual(dump.commandLog, []);
  assert.equal(dump.structure.present, false);
});
