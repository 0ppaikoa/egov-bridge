// タグマッピングエンジンのテスト（仕様書 docs/tag-mapping-spec.md §2〜§3 に準拠）
import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribeConfInfo, parseConfInfoRules } from '../src/bridge/tagmapping.ts';
import {
  splitPath,
  getNodesByRelativeOrderXPath,
  getValueByNode,
  isLeafElement,
  buildTagIndex,
} from '../src/bridge/pathx.ts';
import { parseXml, elementsByTag } from '../src/bridge/xmlutil.ts';

const CONF = `<?xml version="1.0" encoding="UTF-8"?>
<DataRoot>
  <構成情報 ID="構成情報">
    <管理情報>
      <手続番号><手続ID>31751</手続ID></手続番号>
      <!-- ネイティブの XPath 定数 XPATH_APPLICANT_CONTACT は
           "DataRoot/構成情報/管理情報/申請者連絡先情報"。
           申請者連絡先情報は 管理情報 の下にある。 -->
      <申請者連絡先情報>
        <申請者情報>
          <氏名>青木 勇樹</氏名>
          <氏名カナ>アオキ ユウキ</氏名カナ>
        </申請者情報>
        <連絡先>03-1234-5678</連絡先>
      </申請者連絡先情報>
    </管理情報>
  </構成情報>
</DataRoot>`;

const MAPPING = `<?xml version="1.0" encoding="UTF-8"?>
<タグマッピング>
  <対応規則>
    <申請書タグ名>申請書情報/申請者/氏名</申請書タグ名>
    <構成管理情報タグ名>DataRoot/構成情報/管理情報/申請者連絡先情報/申請者情報/氏名</構成管理情報タグ名>
  </対応規則>
  <対応規則>
    <申請書タグ名>申請書情報/申請者/氏名カナ</申請書タグ名>
    <構成管理情報タグ名>DataRoot/構成情報/管理情報/申請者連絡先情報/申請者情報/氏名カナ</構成管理情報タグ名>
  </対応規則>
  <対応規則>
    <申請書タグ名>申請書情報/連絡先/値</申請書タグ名>
    <構成管理情報タグ名>DataRoot/構成情報/管理情報/申請者連絡先情報/申請者情報/氏名</構成管理情報タグ名>
    <仕切り>（</仕切り>
    <構成管理情報タグ名>DataRoot/構成情報/管理情報/申請者連絡先情報/申請者情報/氏名カナ</構成管理情報タグ名>
    <仕切り>）</仕切り>
  </対応規則>
</タグマッピング>`;

// 申請データXMLのルートは <申請書情報>（DataRoot を持たない）。
// 構成情報XMLのみ <DataRoot> をルートに持つ。これはネイティブの XPath 定義
// （構成情報は "DataRoot/構成情報/..."、申請側は "申請書情報/..."）と一致する。
const APPLI = `<?xml version="1.0" encoding="UTF-8"?>
<申請書情報>
  <申請者>
    <氏名>（未入力）</氏名>
    <氏名カナ>（未入力）</氏名カナ>
  </申請者>
  <連絡先>
    <値>（未入力）</値>
  </連絡先>
</申請書情報>`;

test('splitPath: 空セグメントを無視する', () => {
  assert.deepEqual(splitPath('/a/b/c/'), ['a', 'b', 'c']);
  assert.deepEqual(splitPath('a//b'), ['a', 'b']);
  assert.deepEqual(splitPath(''), []);
});

test('getNodesByRelativeOrderXPath: 基点ノード自身は含めず子から辿る', () => {
  const doc = parseXml(CONF);
  const nodes = getNodesByRelativeOrderXPath(doc, 'DataRoot/構成情報/管理情報/手続番号/手続ID');
  assert.ok(nodes && nodes.length === 1);
  assert.equal(getValueByNode(nodes[0]), '31751');
});

test('getNodesByRelativeOrderXPath: [n] は1始まり', () => {
  const xml = '<R><A><B>1</B><B>2</B><B>3</B></A></R>';
  const doc = parseXml(xml);
  const n2 = getNodesByRelativeOrderXPath(doc, 'R/A/B[2]');
  assert.ok(n2 && n2.length === 1);
  assert.equal(getValueByNode(n2[0]), '2');
  // 範囲外は null
  assert.equal(getNodesByRelativeOrderXPath(doc, 'R/A/B[4]'), null);
});

test('一致なしは null（例外ではない）', () => {
  const doc = parseXml(CONF);
  assert.equal(getNodesByRelativeOrderXPath(doc, 'DataRoot/存在しない'), null);
});

test('isLeafElement / buildTagIndex', () => {
  const doc = parseXml('<R><A><B>x</B></A><B>y</B></R>');
  const index = buildTagIndex(doc); // ネイティブ同様、Document を渡す
  const bs = index.get('/R/B') ?? [];
  assert.equal(bs.length, 1); // ルート直下の B のみ
  const nested = index.get('/R/A/B') ?? [];
  assert.equal(nested.length, 1);
  assert.equal(isLeafElement(nested[0]), true);
  assert.equal(isLeafElement(doc.documentElement), false);
});

test('parseConfInfoRules: 型番号を正しく解釈する', () => {
  const rules = parseConfInfoRules(MAPPING);
  assert.equal(rules.length, 3);
  assert.deepEqual(
    rules[0].elements.map((e) => e.type),
    [1, 3],
  );
  assert.deepEqual(
    rules[2].elements.map((e) => e.type),
    [1, 3, 4, 3, 4],
  );
});

test('transcribeConfInfo: 構成情報の値が申請データへ転記される', () => {
  const appli = new Map([['form-01.xml', APPLI]]);
  const result = transcribeConfInfo(CONF, MAPPING, appli);
  assert.equal(result.ruleCount, 3);
  assert.equal(result.warnings.length, 0);

  const out = result.files.get('form-01.xml');
  assert.ok(out);
  assert.match(out, /<氏名>青木 勇樹<\/氏名>/);
  assert.match(out, /<氏名カナ>アオキ ユウキ<\/氏名カナ>/);
  // 仕切りによる連結
  assert.match(out, /<値>青木 勇樹（アオキ ユウキ）<\/値>/);
});

test('transcribeConfInfo: 値が引けない規則は飛ばし、その規則では書き込まない', () => {
  const mapping = `<タグマッピング>
  <対応規則>
    <申請書タグ名>申請書情報/申請者/氏名</申請書タグ名>
    <構成管理情報タグ名>DataRoot/構成情報/存在しない/パス</構成管理情報タグ名>
  </対応規則>
</タグマッピング>`;
  const appli = new Map([['form-01.xml', APPLI]]);
  const result = transcribeConfInfo(CONF, mapping, appli);
  assert.equal(result.ruleCount, 0);
  assert.equal(result.warnings.length, 1);
  // ruleCount==0 なので書き戻し自体が起きない（ネイティブ同様）
  assert.equal(result.files.size, 0);
});

test('transcribeConfInfo: 一致した全ノードに書く', () => {
  const xml = '<申請書情報><A><B>old</B><B>old</B></A></申請書情報>';
  const mapping = `<タグマッピング><対応規則>
    <申請書タグ名>申請書情報/A/B</申請書タグ名>
    <構成管理情報タグ名>DataRoot/構成情報/管理情報/手続番号/手続ID</構成管理情報タグ名>
  </対応規則></タグマッピング>`;
  const result = transcribeConfInfo(CONF, mapping, new Map([['f.xml', xml]]));
  const out = result.files.get('f.xml');
  assert.ok(out);
  const matches = out.match(/<B>31751<\/B>/g) ?? [];
  assert.equal(matches.length, 2);
});

test('transcribeConfInfo: 子申請書タグ名は葉要素のみ書き換える', () => {
  const xml = '<申請書情報><明細名称><内側>x</内側></明細名称><明細名称>y</明細名称></申請書情報>';
  const mapping = `<タグマッピング><対応規則>
    <子申請書タグ名>明細名称</子申請書タグ名>
    <構成管理情報タグ名>DataRoot/構成情報/管理情報/手続番号/手続ID</構成管理情報タグ名>
  </対応規則></タグマッピング>`;
  const result = transcribeConfInfo(CONF, mapping, new Map([['f.xml', xml]]));
  const out = result.files.get('f.xml');
  assert.ok(out);
  const parsed = parseXml(out);
  const names = elementsByTag(parsed, '明細名称');
  // 親（子要素を持つ）は書き換えられず、葉だけ 31751 になる
  assert.equal(names[0].getElementsByTagName('内側')[0].textContent, 'x');
  assert.equal(names[1].textContent, '31751');
});
