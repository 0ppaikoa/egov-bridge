// setXMLFormInfo / getXMLFormInfo の単体テスト
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setXMLFormInfo,
  getXMLFormInfo,
  parseItemMapping,
  decimalToHex,
  hexToDecimal,
} from '../src/bridge/forminfo.ts';

const MAPPING = `<mapping>
  <map><itemName>氏名</itemName><xpath>申請書情報/申請者/氏名</xpath></map>
  <map><itemName>電話番号</itemName><xpath>申請書情報/連絡先/電話番号</xpath></map>
</mapping>`;

const WORK_XML = `<申請書情報><申請者><氏名>青木 勇樹</氏名></申請者><連絡先><電話番号>03-1234-5678</電話番号></連絡先></申請書情報>`;

test('decimalToHex / hexToDecimal: 日本語を含めて往復できる', () => {
  const hex = decimalToHex(WORK_XML);
  assert.match(hex, /^&#x3C;/); // '<' = 0x3C
  assert.equal(hexToDecimal(hex), WORK_XML);
});

test('parseItemMapping: itemName / xpath / repeat を読む', () => {
  const items = parseItemMapping(MAPPING);
  assert.equal(items.length, 2);
  assert.equal(items[0].name, '氏名');
  assert.equal(items[0].xpath, '申請書情報/申請者/氏名');
  assert.equal(items[0].isRepeat, false);
});

test('parseItemMapping: repeat 要素があれば isRepeat', () => {
  const items = parseItemMapping(
    '<mapping><map><itemName>明細</itemName><xpath>申請書情報/明細</xpath><repeat/></map></mapping>',
  );
  assert.equal(items[0].isRepeat, true);
});

test('setXMLFormInfo: XML の値をページへ渡し、更新後XMLを hex でページへ戻す', () => {
  const calls = [];
  const pageEval = (js) => {
    calls.push(js);
    return 0;
  };
  const code = setXMLFormInfo([WORK_XML, MAPPING, decimalToHex(WORK_XML), ''], pageEval);
  assert.equal(code, 0);

  assert.ok(
    calls.some((js) => js.includes('F3egclSetValueForXml("氏名", "青木 勇樹")')),
    calls.join('\n'),
  );
  assert.ok(calls.some((js) => js.includes('F3egclSetValueForXml("電話番号", "03-1234-5678")')));
  const setData = calls.find((js) => js.includes('F3egclSetDataStructure('));
  assert.ok(setData, 'F3egclSetDataStructure が呼ばれること');
  // hex 化された XML が渡っている
  assert.ok(setData.includes('&#x3C;'));
});

test('setXMLFormInfo: 繰り返し項目は明示エラー（黙って落とさない）', () => {
  const mapping =
    '<mapping><map><itemName>明細</itemName><xpath>申請書情報/明細</xpath><repeat/></map></mapping>';
  assert.throws(
    () => setXMLFormInfo([WORK_XML, mapping, decimalToHex(WORK_XML), ''], () => 0),
    /未対応: 繰り返し項目/,
  );
});

test('setXMLFormInfo: 必須引数が空なら例外', () => {
  assert.throws(() => setXMLFormInfo(['', MAPPING, 'x', ''], () => 0), /xmlDoc:null/);
  assert.throws(() => setXMLFormInfo([WORK_XML, '', 'x', ''], () => 0), /mappingXMLDoc:null/);
});

test('getXMLFormInfo: ページの値を XML に取り込んで返す', () => {
  const values = { 氏名: '新しい名前', 電話番号: '090-0000-0000' };
  const pageEval = (js) => {
    const m = /F3egclGetValue\("(.+?)"\)/.exec(js);
    if (m) return values[m[1]];
    return '';
  };
  const out = getXMLFormInfo([decimalToHex(WORK_XML), MAPPING, ''], pageEval);
  assert.match(out, /<氏名>新しい名前<\/氏名>/);
  assert.match(out, /<電話番号>090-0000-0000<\/電話番号>/);
});

test('getXMLFormInfo: structureXMLDoc が空なら例外', () => {
  assert.throws(() => getXMLFormInfo(['', MAPPING, ''], () => ''), /structureXMLDoc:null/);
});
