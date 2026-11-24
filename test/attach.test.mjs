// 添付ファイル処理（attach.ts / commands-attach.ts）のオフラインテスト。
// VFS に構成情報とダミー添付を作り、ファイル入出力と kousei.xml の書き換えだけを検証する。
// ネットワーク（署名・送信）には一切触れない。
import test from 'node:test';
import assert from 'node:assert/strict';

const { vfs } = await import('../src/bridge/vfs.ts');
const {
  attachFiles,
  stageAttachment,
  getAttachDoneFileNames,
  resetAttachDoneFileNames,
  readAttachedAttributeEntries,
  ATTACH_TEMP_ROOT,
} = await import('../src/bridge/attach.ts');
const {
  cmdAddAttachedFileDragEnter,
  cmdAddAttachedFileDrop,
  cmdAppendAttachedAttribute,
  cmdSetAttachedFileSize,
} = await import('../src/bridge/commands-attach.ts');

const ID = 'attach-test-id';
const PROC = '20251';

// 既存の添付属性（1件）と申請書属性を持つ構成情報。追記後に「全削除→作り直し」されることを確認する。
const KOUSEI = `<?xml version="1.0" encoding="UTF-8"?>
<DataRoot>
  <構成情報 Id="構成情報">
    <管理情報><手続番号><手続ID>${PROC}</手続ID></手続番号></管理情報>
    <申請書属性情報>
      <申請書様式ID>000000000000000001</申請書様式ID>
      <申請書ファイル名称>form-01.xml</申請書ファイル名称>
    </申請書属性情報>
    <添付書類属性情報>
      <添付種別>添付</添付種別>
      <添付書類名称>古い添付</添付書類名称>
      <添付書類ファイル名称>old.pdf</添付書類ファイル名称>
      <提出情報>1</提出情報>
    </添付書類属性情報>
  </構成情報>
</DataRoot>`;

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder('utf-8').decode(b);

function setup() {
  vfs.clear();
  resetAttachDoneFileNames();
  vfs.writeFile(`/work/${ID}/${PROC}/kousei.xml`, KOUSEI);
  vfs.writeFile(`/work/${ID}/${PROC}/form-01.xml`, '<Form>dummy</Form>');
}

test('attachFiles: kousei.xml に添付書類属性情報が入り、再パースできる', () => {
  setup();
  const staged = [
    { name: 'shoumei.pdf', path: stageAttachment('shoumei.pdf', enc('PDF-BODY-A')) },
    { name: 'zu-01.png', path: stageAttachment('zu-01.png', enc('PNG-BODY-B')) },
  ];

  const ret = attachFiles(ID, PROC, 'kousei.xml', staged);
  assert.equal(ret, 0);

  const xml = vfs.readText(`/work/${ID}/${PROC}/kousei.xml`);
  // (a) 再パースできること
  assert.doesNotThrow(() => readAttachedAttributeEntries(xml));
  const entries = readAttachedAttributeEntries(xml);
  assert.equal(entries.length, 2, '既存1件は消え、今回の2件だけになる');
  assert.deepEqual(entries[0], {
    attachType: '添付',
    docName: 'shoumei.pdf',
    fileName: 'shoumei.pdf',
    submit: '1',
  });
  assert.deepEqual(entries[1], {
    attachType: '添付',
    docName: 'zu-01.png',
    fileName: 'zu-01.png',
    submit: '1',
  });
  assert.equal(
    entries.some((e) => e.fileName === 'old.pdf'),
    false,
    '旧属性は残らない',
  );
  // 元の構造（宣言・管理情報・申請書属性情報）が壊れていない
  assert.match(xml, /^<\?xml/);
  assert.match(xml, /<手続ID>20251<\/手続ID>/);
  assert.match(xml, /<申請書ファイル名称>form-01.xml<\/申請書ファイル名称>/);

  // (b) コピー先にファイルが存在し、中身が一致する
  for (const s of staged) {
    const dest = `/work/${ID}/${PROC}/${s.name}`;
    assert.ok(vfs.exists(dest), `コピー先が存在する: ${dest}`);
    assert.equal(dec(vfs.readFile(dest)), dec(vfs.readFile(s.path)));
  }

  // (c) attachmenttemp に元が残る
  for (const s of staged) {
    assert.ok(s.path.startsWith(`${ATTACH_TEMP_ROOT}/`), `ステージ先: ${s.path}`);
    assert.ok(vfs.exists(s.path), 'attachmenttemp の元ファイルが残る');
    assert.ok(vfs.list(`${ATTACH_TEMP_ROOT}/${s.path.split('/')[3]}`).length >= 1);
  }

  assert.deepEqual(getAttachDoneFileNames().sort(), ['shoumei.pdf', 'zu-01.png']);
});

test('stageAttachment: タイムスタンプが衝突しても別ディレクトリになる', () => {
  vfs.clear();
  const now = new Date(2026, 10, 24, 13, 5, 6, 789);
  const a = stageAttachment('a.txt', enc('a'), now);
  const b = stageAttachment('a.txt', enc('b'), now);
  assert.notEqual(a, b);
  assert.equal(a, '/work/attachmenttemp/202611241305067890000/a.txt');
  assert.equal(dec(vfs.readFile(a)), 'a');
  assert.equal(dec(vfs.readFile(b)), 'b');
});

test('attachFiles: ステージ済みファイルが無ければ throw し、kousei.xml は変わらない', () => {
  setup();
  assert.throws(
    () =>
      attachFiles(ID, PROC, 'kousei.xml', [
        { name: 'x.pdf', path: '/work/attachmenttemp/nope/x.pdf' },
      ]),
    /ステージ済みファイルが見つかりません/,
  );
  assert.equal(vfs.readText(`/work/${ID}/${PROC}/kousei.xml`), KOUSEI);
});

test('AddAttachedFile_DragEnter は no-op で 0', () => {
  assert.equal(cmdAddAttachedFileDragEnter(['1']), 0);
});

test('AddAttachedFile_Drop: base64 を attachmenttemp に落としてページへ反映する', () => {
  setup();
  resetAttachDoneFileNames();
  const page = [];
  const pageEval = (js) => {
    page.push(js);
    if (js === 'getDragDropFile(2)') return btoa('DROP-BYTES');
    if (js === "$('#file-upload-2').val();") return 'dropped.txt';
    if (js === "$('input[name=file-type-2]').next().text();") return '添付';
    return '';
  };

  assert.equal(cmdAddAttachedFileDrop(['2'], pageEval), 0);

  const stagedPath = page.find((js) => js.startsWith("$('#file-upload-path-2').val("));
  assert.ok(stagedPath, 'file-upload-path が更新される');
  const written = vfs.listRecursive(ATTACH_TEMP_ROOT);
  assert.equal(written.length, 1);
  assert.equal(dec(vfs.readFile(written[0])), 'DROP-BYTES');
  assert.match(written[0], /\/attachmenttemp\/\d{21}\/dropped\.txt$/);
  assert.ok(page.includes('sumFileSize();'));
  assert.ok(page.some((js) => js.includes("$('#file-size-2').text(")));
  assert.deepEqual(getAttachDoneFileNames(), ['dropped.txt']);

  // 添付できない行はエラー
  assert.throws(
    () =>
      cmdAddAttachedFileDrop(['3'], (js) => {
        if (js === 'getDragDropFile(3)') return btoa('X');
        if (js === "$('#file-upload-3').val();") return 'x.txt';
        if (js === "$('input[name=file-type-3]').next().text();") return '別送';
        return '';
      }),
    /ファイルは添付できません/,
  );
  // getDragDropFile が空ならエラー
  assert.throws(() => cmdAddAttachedFileDrop(['4'], () => ''), /getDragDropFile\(4\)/);
});

test('AppendAttachedAttribute: 行ごとのチェックを通った行だけを属性化する', () => {
  setup();

  // 行1: 対象・チェックあり / 行2: チェックボックスが外れている / 行3: 行自体が無い / 行4: 対象
  const rows = {
    1: {
      exists: true,
      checked: true,
      type: '添付',
      docName: '住民票の写し',
      path: '/work/attachmenttemp/202611241305067890000/a.pdf',
    },
    2: {
      exists: true,
      checked: false,
      type: '添付',
      docName: '除外',
      path: '/work/attachmenttemp/202611241305067890000/b.pdf',
    },
    3: {
      exists: false,
      checked: true,
      type: '添付',
      docName: '除外2',
      path: '/work/attachmenttemp/202611241305067890000/c.pdf',
    },
    4: {
      exists: true,
      checked: true,
      type: '添付',
      docName: '図面',
      path: '/work/attachmenttemp/202611241305067890000/d.pdf',
    },
  };
  vfs.writeFile(rows[1].path, enc('A'));
  vfs.writeFile(rows[2].path, enc('B'));
  vfs.writeFile(rows[4].path, enc('D'));

  const pageEval = (js) => {
    const m = /(?:area-add-file|checbox)-(\d+)/.exec(js);
    const row = m ? rows[Number(m[1])] : null;
    if (js.includes('.length > 0') && !js.includes('||')) return row ? row.exists : false;
    if (js.includes("prop('checked')")) return row ? row.checked : false;
    const f = /file-type-(\d+)/.exec(js);
    if (f) return rows[Number(f[1])].type;
    const n = /file-name-(\d+)/.exec(js);
    if (n) return rows[Number(n[1])].docName;
    const p = /file-upload-path-(\d+)/.exec(js);
    if (p) return rows[Number(p[1])].path;
    return '';
  };

  const ret = cmdAppendAttachedAttribute([ID, PROC, 'kousei.xml', '4'], pageEval);
  assert.equal(ret, 0);

  const entries = readAttachedAttributeEntries(vfs.readText(`/work/${ID}/${PROC}/kousei.xml`));
  assert.deepEqual(
    entries.map((e) => [e.attachType, e.docName, e.fileName, e.submit]),
    [
      ['添付', '住民票の写し', 'a.pdf', '1'],
      ['添付', '図面', 'd.pdf', '1'],
    ],
  );
  // 参照先が仮想FS上にあるのでプロセスフォルダへ複製される
  assert.equal(dec(vfs.readFile(`/work/${ID}/${PROC}/d.pdf`)), 'D');
  assert.equal(dec(vfs.readFile(`/work/${ID}/${PROC}/a.pdf`)), 'A');
  assert.equal(vfs.exists(`/work/${ID}/${PROC}/b.pdf`), false);
  assert.deepEqual(getAttachDoneFileNames().sort(), ['a.pdf', 'd.pdf']);

  // 生文字列が数値でなければ throw
  assert.throws(
    () => cmdAppendAttachedAttribute([ID, PROC, 'kousei.xml', '4abc'], pageEval),
    /attachedLastIndex が数値ではありません/,
  );
});

test('SetAttachedFileSize: pageEval 無しは no-op で 0、あれば #file-size-N を更新する', () => {
  setup();
  const path = stageAttachment('size.pdf', new Uint8Array(1234));
  assert.equal(cmdSetAttachedFileSize(['1', path]), 0);

  const page = [];
  assert.equal(
    cmdSetAttachedFileSize(['1', path], (js) => page.push(js)),
    0,
  );
  assert.ok(
    page.some((js) => js === "$('#file-size-1').text(1.3);"),
    page.join('\n'),
  );
  assert.ok(page.includes('$(\'#file-upload-1\').val("size.pdf");'));
  assert.ok(page.includes('sumFileSize();'));
});
