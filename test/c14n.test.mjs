// c14n の単体テスト。期待値は lxml (etree.etree.tostring(method='c14n')) で生成したものを固定。
import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { c14n } from '../src/c14n.ts';

const doc = (s) => new DOMParser().parseFromString(s, 'application/xml');

const cases = [
  [
    '属性ソートとエスケープ、空要素',
    '<DataRoot xmlns="http://example.jp/test"><構成情報 Id="構成情報" z="last" a="first"><name>青木&amp;Co &lt;&gt;</name><空></空></構成情報></DataRoot>',
    '<DataRoot xmlns="http://example.jp/test"><構成情報 Id="構成情報" a="first" z="last"><name>青木&amp;Co &lt;&gt;</name><空></空></構成情報></DataRoot>',
  ],
  [
    'xmldsig 既定名前空間・SignedInfo',
    '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><Reference URI="#%E6%A7%8B%E6%88%90%E6%83%85%E5%A0%B1"><Transforms><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><DigestValue>AAAA</DigestValue></Reference></SignedInfo></Signature>',
    '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod><Reference URI="#%E6%A7%8B%E6%88%90%E6%83%85%E5%A0%B1"><Transforms><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod><DigestValue>AAAA</DigestValue></Reference></SignedInfo></Signature>',
  ],
  [
    '名前空間付き属性・CDATA・PI・&#xD;',
    '<r xmlns:p="urn:p"><p:a b="1" p:a2="2">text &lt;ok&gt; &amp; &#xD; rest</p:a><c><![CDATA[raw <cdata>]]></c><?pi some data?></r>',
    '<r xmlns:p="urn:p"><p:a b="1" p:a2="2">text &lt;ok&gt; &amp; &#xD; rest</p:a><c>raw &lt;cdata&gt;</c><?pi some data?></r>',
  ],
  [
    '素通し文字（tab/LF）と属性3つ',
    '<x><empty/><multi a="1" b="2" c="3"/><t>tab\tand\nnewline</t></x>',
    '<x><empty></empty><multi a="1" b="2" c="3"></multi><t>tab\tand\nnewline</t></x>',
  ],
  [
    '既定nsと接頭辞付きnsの混在',
    '<Mix xmlns="urn:def" xmlns:q="urn:q"><a xmlns="urn:other"><b q:attr="v" plain="p">t</b></a><c/></Mix>',
    '<Mix xmlns="urn:def" xmlns:q="urn:q"><a xmlns="urn:other"><b plain="p" q:attr="v">t</b></a><c></c></Mix>',
  ],
];

for (const [name, input, expected] of cases) {
  test(`c14n: ${name}`, () => {
    assert.equal(c14n(doc(input)), expected);
  });
}

test('部分木 c14n は祖先の名前空間を apex に集約する', () => {
  const src =
    '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/></SignedInfo></Signature>';
  const si = doc(src).documentElement.firstChild;
  assert.equal(
    c14n(si),
    '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod></SignedInfo>',
  );
});
