// デコンパイル済み C# (eGovClient.dll) の DispatchExternal から、
// ページが呼べる全コマンドを直接抽出して docs/bridge-commands.md を作る。
// 分類は推測ではなく「コマンド名の接頭辞」で機械的にまとめる。
import { readFileSync, writeFileSync } from 'node:fs';

const CS = '/tmp/aok/egov-recon/decomp/eGovClient.dll.decompiled.cs';
const lines = readFileSync(CS, 'utf8').split('\n');

const dispatchStart = lines.findIndex((l) => l.includes('private void DispatchExternal'));
if (dispatchStart < 0) throw new Error('DispatchExternal が見つかりません');
let dispatchEnd = lines.length;
for (let i = dispatchStart + 1; i < lines.length; i++) {
  if (/^\t\tprivate (void|int|string|object|bool) [A-Za-z]/.test(lines[i])) {
    dispatchEnd = i;
    break;
  }
}
const dispatch = lines.slice(dispatchStart, dispatchEnd);

const methodDeclRe = (method) => new RegExp(`public [A-Za-z0-9_<>\\[\\]]+ ${method}\\(`);
const methodDeclReFor = (method) => methodDeclRe(method);

const commands = [];
for (let i = 0; i < dispatch.length; i++) {
  const m = /text == "([^"]+)"/.exec(dispatch[i]);
  if (!m) continue;
  const name = m[1];
  let method = null;
  for (let j = i; j < Math.min(i + 12, dispatch.length); j++) {
    const cm = /clientApi\.([A-Za-z0-9_]+)\(/.exec(dispatch[j]);
    if (cm) {
      method = cm[1];
      break;
    }
  }
  // コマンド名と同名のメソッド宣言があれば、そちらを正とする
  // （setXMLFormInfo の分岐が getXMLFormInfo を先に呼ぶ等の取り違えを防ぐ）
  if (method !== name && lines.some((l) => methodDeclReFor(name).test(l))) method = name;
  if (!commands.some((c) => c.name === name)) {
    commands.push({ name, method, line: dispatchStart + i + 1 });
  }
}

function paramsOf(method) {
  if (!method) return '(不明)';
  const re = methodDeclRe(method);
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue;
    let decl = lines[i].trim();
    let j = i;
    while (!decl.includes(')') && j < i + 10) {
      j++;
      decl += ' ' + (lines[j] ?? '').trim();
    }
    const open = decl.indexOf('(');
    const close = decl.lastIndexOf(')');
    if (open < 0 || close < 0) return '(不明)';
    const inner = decl.slice(open + 1, close);
    if (!inner.trim()) return '0個';
    return inner
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const withoutType = p.replace(/^[^ ]+ /, '');
        const mm = /([A-Za-z0-9_]+)/.exec(withoutType);
        return mm ? mm[1] : p;
      })
      .join(', ');
  }
  return '(宣言が見つからない)';
}

// 実装状況
const indexSrc = readFileSync('src/bridge/commands-index.ts', 'utf8');
const fnByName = new Map();
for (const m of indexSrc.matchAll(/(\w+):\s*\{\s*(?:oneWay:\s*(?:true|false),\s*)?fn:\s*([A-Za-z0-9_]+)/g)) {
  fnByName.set(m[1], m[2]);
}
const SPECIAL = {
  notImpl: '未実装',
  cmdSelectCertificateUI: 'スタブ',
  cmdSaveAppliDataPlaceholder: 'スタブ',
  cmdAddAttachedFileDragEnter: '簡易実装',
  cmdInitAttachList: '簡易実装',
  cmdSetAttachedFileSize: '一部実装',
};
function statusOf(name) {
  const fn = fnByName.get(name);
  if (!fn) return '未登録';
  return SPECIAL[fn] ?? '実装済み';
}

// 接頭辞で機械的に分類（推測を入れない）
const GROUPS = [
  ['F3egclInitAppli_', '初期化（initAppli 系）'],
  ['F3egclXMLDataAppli_', 'XML・フォーム（XMLDataAppli 系）'],
  ['F3egclUserVerificationXMLDataAppli_', '本人確認XML（UserVerification 系）'],
  ['F3egclFileManageAppli_', 'ファイル管理・署名送信（FileManageAppli 系）'],
  ['F3egclSignatureAppli_', '署名前チェック（SignatureAppli 系）'],
  ['F3egclTagConfCheck_', 'タグ整合チェック（TagConfCheck 系）'],
  ['F3egclPostProcessAppli_', '後処理（PostProcessAppli 系）'],
  ['F3egclReflectSuspendProcInfoClass_', '中断情報反映（ReflectSuspendProcInfo 系）'],
  ['OfficialDocumentDownload_', '公文書ダウンロード'],
  ['PostOfficialDocumentDownload_', '公文書ダウンロード（POST）'],
];
function groupOf(name) {
  for (const [prefix, label] of GROUPS) if (name.startsWith(prefix)) return label;
  return '単発コマンド（添付・設定・画面）';
}

const counts = {};
for (const c of commands) {
  c.group = groupOf(c.name);
  c.status = statusOf(c.name);
  c.params = paramsOf(c.method);
  counts[c.status] = (counts[c.status] ?? 0) + 1;
}

let md = `# ブリッジコマンド一覧（C# デコンパイル直読み）\n\n`;
md += `出典: \`eGovClient.dll.decompiled.cs\` の \`DispatchExternal\`（${dispatchStart + 1}〜${dispatchEnd}行）。\n`;
md += `分類はコマンド名の接頭辞による機械的分類（推測のグルーピングはしない）。\n\n`;
md += `- コマンド総数: **${commands.length}**\n`;
for (const [k, v] of Object.entries(counts)) md += `- ${k}: **${v}**\n`;
md += `\n`;

const groupNames = [...GROUPS.map((g) => g[1]), '単発コマンド（添付・設定・画面）'];
for (const g of groupNames) {
  const list = commands.filter((c) => c.group === g);
  if (!list.length) continue;
  md += `## ${g}（${list.length}件）\n\n`;
  md += `| コマンド | clientApi | 引数 | C#行 | 状態 |\n| --- | --- | --- | ---: | --- |\n`;
  for (const c of list) {
    md += `| \`${c.name}\` | ${c.method ?? '-'} | ${c.params} | ${c.line} | ${c.status} |\n`;
  }
  md += `\n`;
}

writeFileSync('docs/bridge-commands.md', md);
console.log('commands:', commands.length, counts);
for (const g of groupNames) {
  const list = commands.filter((c) => c.group === g);
  if (list.length) console.log(`${g}: ${list.length}`);
}
