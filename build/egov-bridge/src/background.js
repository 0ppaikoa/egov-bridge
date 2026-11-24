// e-Gov 電子申請ブリッジ — service worker
// 現段階は「観測モード」: ページからの要求を記録し、未実装の応答を返すだけ。
// ハンドラの実装は docs/protocol.md の手順で進める。

const LOG_KEY = 'bridgeLog';
const MAX_LOG = 500;

async function record(entry) {
  const stored = await chrome.storage.session.get(LOG_KEY);
  const log = Array.isArray(stored[LOG_KEY]) ? stored[LOG_KEY] : [];
  log.push(entry);
  if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
  await chrome.storage.session.set({ [LOG_KEY]: log });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'bridge-request') return undefined;

  let parsed = null;
  try {
    parsed = JSON.parse(msg.payload);
  } catch {
    parsed = null;
  }
  const cmd = Array.isArray(parsed) ? String(parsed[0]) : '(unparsable)';
  const uuid = Array.isArray(parsed) && parsed.length > 1 ? String(parsed[1]) : '';

  record({ ts: Date.now(), cmd, raw: String(msg.payload).slice(0, 2000) });

  // 未実装コマンドには reject 形式で応答する（形式は解析ノート参照）。
  const reject = JSON.stringify({ uuid, reject: `egov-bridge: unimplemented: ${cmd}` });
  sendResponse({ json: reject });
  return true;
});

// 観測ログは chrome.storage.session.bridgeLog に保存される。
// DevTools の拡張機能コンソールから
//   chrome.storage.session.get('bridgeLog').then(console.log)
// で確認できる。
