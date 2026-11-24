// downloadAppliForm（申請フォーム一式ダウンロード）のオフラインテスト。
// fetch をモックし、ZIP は fflate の zipSync でテスト内生成する。実ネットワークには触れない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';

// http.ts は CSRF トークンを document から読む（ネイティブの EvaluateJavaScript 相当）
globalThis.document = { getElementsByName: () => [{ value: 'test-csrf-token' }] };

const { downloadAppliForm, copyFileIfExists, APP_FORM_DOC_DIST_PATH } =
  await import('../src/bridge/download.ts');
const { vfs } = await import('../src/bridge/vfs.ts');

/** 申請フォーム一式のダミー ZIP（ルート直下 + サブフォルダ） */
function makeFormZip() {
  return zipSync({
    'kousei.xml': strToU8('<DataRoot><構成情報 Id="構成情報"/></DataRoot>'),
    'form-01.xml': strToU8('<Form>申請書</Form>'),
    'tagMapping/0001.xml': strToU8('<TagMapping/>'),
    'tagMapping/': new Uint8Array(0), // ディレクトリエントリ（無視されること）
  });
}

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({
      url: String(url),
      method: (opts.method || 'GET').toUpperCase(),
      headers: opts.headers ?? {},
    });
    return handler(url, opts);
  };
  return calls;
}

test('downloadAppliForm: 200 + octet-stream の ZIP を VFS に展開する', async () => {
  vfs.clear();
  const calls = stubFetch(
    () =>
      new Response(makeFormZip(), {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
  );

  const result = await downloadAppliForm('id-001');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, APP_FORM_DOC_DIST_PATH);
  assert.equal(calls[0].headers['X-CSRF-Token'], 'test-csrf-token');

  assert.equal(result.folder, '/work/id-001');
  assert.equal(
    vfs.readText('/work/id-001/kousei.xml'),
    '<DataRoot><構成情報 Id="構成情報"/></DataRoot>',
  );
  assert.equal(vfs.readText('/work/id-001/form-01.xml'), '<Form>申請書</Form>');
  assert.equal(vfs.readText('/work/id-001/tagMapping/0001.xml'), '<TagMapping/>');
  // ディレクトリエントリは書き込み対象にならない
  assert.deepEqual(result.entries.sort(), ['form-01.xml', 'kousei.xml', 'tagMapping/0001.xml']);
  assert.equal(result.written.length, 3);
  assert.equal(result.skipped.length, 0);
  // ディスクには何も作らない（VFS 上のみ）
  assert.equal(vfs.listRecursive('/work/id-001').length, 3);
});

test('downloadAppliForm: Content-Type が octet-stream でなければ例外', async () => {
  vfs.clear();
  stubFetch(
    () =>
      new Response('<html>login</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
  );

  await assert.rejects(() => downloadAppliForm('id-002'), /Content-type:text\/html/);
  assert.equal(vfs.exists('/work/id-002'), false);
});

test('downloadAppliForm: HTTP 500 で例外', async () => {
  vfs.clear();
  stubFetch(
    () =>
      new Response(new Uint8Array([0]), {
        status: 500,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
  );

  await assert.rejects(() => downloadAppliForm('id-003'), /HTTP 500/);
  assert.equal(vfs.exists('/work/id-003'), false);
});

test('downloadAppliForm: 既存フォルダがあるとき overwrite:false で例外、既存内容は保持', async () => {
  vfs.clear();
  vfs.writeFile('/work/id-004/kousei.xml', 'OLD');
  const calls = stubFetch(
    () =>
      new Response(makeFormZip(), {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream;charset=binary' },
      }),
  );

  await assert.rejects(() => downloadAppliForm('id-004'), /既に存在します/);
  assert.equal(calls.length, 0, '既存チェックは POST より前に行う');
  assert.equal(vfs.readText('/work/id-004/kousei.xml'), 'OLD');
});

test('downloadAppliForm: overwrite:true は既存を置き換える', async () => {
  vfs.clear();
  vfs.writeFile('/work/id-005/kousei.xml', 'OLD');
  stubFetch(
    () =>
      new Response(makeFormZip(), {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
  );

  await downloadAppliForm('id-005', { overwrite: true });
  assert.equal(
    vfs.readText('/work/id-005/kousei.xml'),
    '<DataRoot><構成情報 Id="構成情報"/></DataRoot>',
  );
});

test('downloadAppliForm: copyOnly:true は既存ファイルを残し、新規だけ書く', async () => {
  vfs.clear();
  vfs.writeFile('/work/id-006/kousei.xml', 'OLD');
  stubFetch(
    () =>
      new Response(makeFormZip(), {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
  );

  const result = await downloadAppliForm('id-006', { copyOnly: true });
  assert.equal(vfs.readText('/work/id-006/kousei.xml'), 'OLD');
  assert.deepEqual(result.skipped, ['/work/id-006/kousei.xml']);
  assert.equal(vfs.readText('/work/id-006/form-01.xml'), '<Form>申請書</Form>');
  assert.equal(result.written.length, 2);
});

test('downloadAppliForm: ZIP エントリの .. によるフォルダ外書き込みを拒否する', async () => {
  vfs.clear();
  const evil = zipSync({ '../escape.xml': strToU8('x') });
  stubFetch(
    () =>
      new Response(evil, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } }),
  );

  await assert.rejects(() => downloadAppliForm('id-007'), /展開先の外/);
  assert.equal(vfs.exists('/work/escape.xml'), false, '/work 直下に書き込まれていないこと');
  assert.equal(vfs.exists('/work/id-007'), false, '失敗時は作成したフォルダを残さない');
});

test('copyFileIfExists: コピー元が無ければ false、あればコピーする', () => {
  vfs.clear();
  vfs.writeFile('/work/id-008/kousei_riyousha.xml', '<DataRoot/>');

  assert.equal(
    copyFileIfExists('/work/id-008/kousei_riyousha.xml', '/work/id-008/20251/fab.xml'),
    true,
  );
  assert.equal(vfs.readText('/work/id-008/20251/fab.xml'), '<DataRoot/>');

  assert.equal(copyFileIfExists('/work/id-008/missing.xml', '/work/id-008/x.xml'), false);
  assert.equal(vfs.exists('/work/id-008/x.xml'), false);

  // overwrite=false はコピー先既存ならスキップ
  vfs.writeFile('/work/id-008/20251/fab.xml', 'KEEP');
  assert.equal(
    copyFileIfExists('/work/id-008/kousei_riyousha.xml', '/work/id-008/20251/fab.xml', false),
    false,
  );
  assert.equal(vfs.readText('/work/id-008/20251/fab.xml'), 'KEEP');
});
