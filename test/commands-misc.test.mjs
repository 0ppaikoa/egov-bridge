// commands-misc の単体テスト（ネットワーク・モック不要）。
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  cmdSetMinistRefInfo,
  cmdSetPresentationOrgInfo,
  cmdRestartLogin,
  cmdSelectCertificateUI,
  cmdSaveAppliDataPlaceholder,
} = await import('../src/bridge/commands-misc.ts');
const { vfs } = await import('../src/bridge/vfs.ts');

const ID = 'test-identifier';
const PROC = '20251';
const CONF = 'kousei.xml';
const CONF_PATH = `/work/${ID}/${PROC}/${CONF}`;

function kousei(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<DataRoot>\n\t<構成情報 Id="構成情報">\n${inner}\n\t</構成情報>\n</DataRoot>`;
}

function setup(xml) {
  vfs.clear();
  vfs.writeFile(CONF_PATH, xml);
}

test('SetMinistRefInfo: 府省照会情報/府省照会N/府省照会情報 を CSV 順に上書きし、0 を返す', () => {
  setup(
    kousei(
      '\t\t<府省照会情報>\n' +
        '\t\t\t<府省照会1><府省照会情報>旧1</府省照会情報><ダミー>x</ダミー></府省照会1>\n' +
        '\t\t\t<府省照会2><府省照会情報>旧2</府省照会情報></府省照会2>\n' +
        '\t\t</府省照会情報>',
    ),
  );

  const ret = cmdSetMinistRefInfo([ID, PROC, CONF, '値A,値B', '', '']);
  assert.equal(ret, 0);

  const out = vfs.readText(CONF_PATH);
  assert.match(out, /<府省照会1><府省照会情報>値A<\/府省照会情報><ダミー>x<\/ダミー><\/府省照会1>/);
  assert.match(out, /<府省照会2><府省照会情報>値B<\/府省照会情報><\/府省照会2>/);
  assert.doesNotMatch(out, /旧1|旧2/);
});

test('SetMinistRefInfo: 値が足りない分はネイティブ同様に触らない（上書きのみ・空タグ生成なし）', () => {
  setup(
    kousei(
      '\t\t<府省照会情報><府省照会1><府省照会情報>旧1</府省照会情報></府省照会1><府省照会2><府省照会情報>旧2</府省照会情報></府省照会2></府省照会情報>',
    ),
  );

  assert.equal(cmdSetMinistRefInfo([ID, PROC, CONF, '新1', '', '']), 0);
  const out = vfs.readText(CONF_PATH);
  assert.match(out, /<府省照会情報>新1<\/府省照会情報>/);
  assert.match(out, /<府省照会2><府省照会情報>旧2<\/府省照会情報><\/府省照会2>/);
});

test('SetMinistRefInfo: 府省照会N が無ければ要素名を明示して例外（推測でタグを作らない）', () => {
  setup(
    kousei(
      '\t\t<府省照会情報><府省照会1><府省照会情報>旧1</府省照会情報></府省照会1></府省照会情報>',
    ),
  );
  const before = vfs.readText(CONF_PATH);

  assert.throws(() => cmdSetMinistRefInfo([ID, PROC, CONF, '値A,値B', '', '']), /府省照会2/);
  assert.equal(vfs.readText(CONF_PATH), before, '失敗時は書き戻さない');
});

test('SetMinistRefInfo: 構成情報/府省照会情報 が無ければ例外', () => {
  setup(kousei('\t\t<管理情報><手続番号><手続ID>31751</手続ID></手続番号></管理情報>'));
  assert.throws(() => cmdSetMinistRefInfo([ID, PROC, CONF, '値A', '', '']), /府省照会情報/);
});

test('SetMinistRefInfo: applyFormFileData を Base64 復号し CRLF→LF で申請書XMLへ書き戻す', () => {
  setup(
    kousei(
      '\t\t<府省照会情報><府省照会1><府省照会情報>旧1</府省照会情報></府省照会1></府省照会情報>',
    ),
  );
  const applyName = 'form-01.xml';
  vfs.writeFile(`/work/${ID}/${PROC}/${applyName}`, '<Form>old</Form>');
  const payload = '<Form>\r\n  <A>1</A>\r\n</Form>';
  const b64 = Buffer.from(payload, 'utf8').toString('base64');

  assert.equal(cmdSetMinistRefInfo([ID, PROC, CONF, '値A', applyName, b64]), 0);
  assert.equal(vfs.readText(`/work/${ID}/${PROC}/${applyName}`), '<Form>\n  <A>1</A>\n</Form>');
});

test('SetMinistRefInfo: applyFormFileName だけ指定は例外（ネイティブの黙殺を踏襲しない）', () => {
  setup(
    kousei(
      '\t\t<府省照会情報><府省照会1><府省照会情報>旧1</府省照会情報></府省照会1></府省照会情報>',
    ),
  );
  assert.throws(() => cmdSetMinistRefInfo([ID, PROC, CONF, '値A', 'form-01.xml', '']), /両方指定/);
});

test('SetMinistRefInfo: 構成情報XMLが無ければ例外', () => {
  vfs.clear();
  assert.throws(
    () => cmdSetMinistRefInfo([ID, PROC, CONF, '値A', '', '']),
    /構成情報XMLがありません/,
  );
});

test('SetPresentationOrgInfo: 提出先識別子/名称を置換して 0 を返す', () => {
  setup(
    kousei(
      '\t\t<提出先情報>\n' +
        '\t\t\t<提出先識別子>001</提出先識別子>\n' +
        '\t\t\t<提出先名称>旧機関</提出先名称>\n' +
        '\t\t</提出先情報>',
    ),
  );

  const ret = cmdSetPresentationOrgInfo([ID, PROC, CONF, '11111', 'kousei.xml', '999', '新機関']);
  assert.equal(ret, 0);

  const out = vfs.readText(CONF_PATH);
  assert.match(out, /<提出先識別子>999<\/提出先識別子>/);
  assert.match(out, /<提出先名称>新機関<\/提出先名称>/);
  assert.doesNotMatch(out, /001|旧機関/);
});

test('SetPresentationOrgInfo: 提出先情報と配下要素が無ければ生成する', () => {
  setup(kousei('\t\t<管理情報><手続番号><手続ID>31751</手続ID></手続番号></管理情報>'));

  assert.equal(
    cmdSetPresentationOrgInfo([ID, PROC, CONF, '11111', 'kousei.xml', '123', '機関X']),
    0,
  );
  const out = vfs.readText(CONF_PATH);
  assert.match(
    out,
    /<提出先情報><提出先識別子>123<\/提出先識別子><提出先名称>機関X<\/提出先名称><\/提出先情報>/,
  );
});

test('SetPresentationOrgInfo: 構成情報XMLが無ければ例外', () => {
  vfs.clear();
  assert.throws(
    () => cmdSetPresentationOrgInfo([ID, PROC, CONF, '11111', 'kousei.xml', '1', 'x']),
    /構成情報XMLがありません/,
  );
});

test('restartLogin: globalThis.location.assign に url を渡し 0 を返す', () => {
  const calls = [];
  const original = globalThis.location;
  globalThis.location = { assign: (u) => calls.push(u) };
  try {
    assert.equal(cmdRestartLogin(['https://shinsei.e-gov.go.jp/recept/startup/']), 0);
    assert.deepEqual(calls, ['https://shinsei.e-gov.go.jp/recept/startup/']);
  } finally {
    if (original === undefined) delete globalThis.location;
    else globalThis.location = original;
  }
});

test('restartLogin: url が無ければ例外', () => {
  assert.throws(() => cmdRestartLogin([]), /url/);
});

test('SelectCertificateUI: 何もせず 0 を返す', () => {
  assert.equal(cmdSelectCertificateUI(), 0);
});

test('saveAppliData プレースホルダ: getXMLFormInfo 依存である旨の例外', () => {
  assert.throws(() => cmdSaveAppliDataPlaceholder(), /未実装（getXMLFormInfo 依存）/);
});
