// 各コマンドの clientApi メソッド本体から「主要な呼び出し」を抽出し、
// 解説を書くための根拠を機械的に集める。
import { readFileSync, writeFileSync } from 'node:fs';

const CS = '/tmp/aok/egov-recon/decomp/eGovClient.dll.decompiled.cs';
const lines = readFileSync(CS, 'utf8').split('\n');

// DispatchExternal からコマンド→メソッド対応を取る（gen-command-list と同じ規則）
const dispatchStart = lines.findIndex((l) => l.includes('private void DispatchExternal'));
const dispatch = lines.slice(dispatchStart, dispatchStart + 2000);
const pairs = [];
for (let i = 0; i < dispatch.length; i++) {
  const m = /text == "([^"]+)"/.exec(dispatch[i]);
  if (!m) continue;
  let method = null;
  for (let j = i; j < Math.min(i + 12, dispatch.length); j++) {
    const cm = /clientApi\.([A-Za-z0-9_]+)\(/.exec(dispatch[j]);
    if (cm) {
      method = cm[1];
      break;
    }
  }
  if (!pairs.some((p) => p.cmd === m[1])) pairs.push({ cmd: m[1], method });
}

function bodyOf(method) {
  const re = new RegExp(`public [A-Za-z0-9_<>\\[\\]]+ ${method}\\(`);
  const idx = lines.findIndex((l) => re.test(l));
  if (idx < 0) return null;
  let end = lines.length;
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^\t\t(public|private|protected|internal) /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start: idx + 1, text: lines.slice(idx, end).join('\n') };
}

const KEYS = [
  ['sendAppliData', '申請データ送信'],
  ['SendHttpRequest', 'HTTP送信'],
  ['SignWithDigitalAuthentication', 'デジタル認証署名'],
  ['signature(', 'ローカル証明書署名'],
  ['downloadAppliForm', 'フォームDL'],
  ['transcribeConfInfo', '構成情報転記'],
  ['transcribeAppliData', '申請データ転記'],
  ['backupAppliData', 'バックアップ'],
  ['restoreAppliData', 'リストア'],
  ['SaveXml', 'XML保存'],
  ['ZipArchive', 'ZIP操作'],
  ['Process.Start', '外部プロセス/ブラウザ'],
  ['ShowDialog', 'ダイアログ'],
  ['OpenFiles', 'ファイル選択'],
  ['FolderSelect', 'フォルダ選択'],
  ['InvokeScript("eval"', 'ページJS評価'],
  ['InvokeScriptWithErrorHandling', 'ページ関数呼出'],
  ['F3egclCallSetXMLDoc', '画面へXML反映'],
  ['callF3egclCallGetXMLDoc', '画面からXML取得'],
  ['XmlDocument', 'XML読取'],
  ['XDocument', 'XML読取(LINQ)'],
  ['File.Delete', 'ファイル削除'],
  ['Directory.Delete', 'フォルダ削除'],
  ['Directory.GetFiles', 'ファイル列挙'],
  ['File.Copy', 'ファイル複製'],
  ['File.Exists', '存在確認'],
  ['WebRequest', 'HTTP要求'],
  ['Regex', '正規表現'],
  ['JsonSerializer', 'JSON'],
];

const out = [];
for (const p of pairs) {
  if (!p.method) {
    out.push({ cmd: p.cmd, method: null, line: null, keys: [] });
    continue;
  }
  const b = bodyOf(p.method);
  const keys = [];
  if (b) {
    for (const [k, label] of KEYS) {
      if (b.text.includes(k)) keys.push(label);
    }
  }
  out.push({ cmd: p.cmd, method: p.method, line: b ? b.start : null, keys });
}

writeFileSync('/tmp/aok/command-evidence.json', JSON.stringify(out, null, 2));
for (const o of out) {
  console.log(`${o.cmd}\t${o.method ?? '-'}\t${o.line ?? '-'}\t${o.keys.join(',')}`);
}
