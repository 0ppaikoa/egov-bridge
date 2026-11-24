// dispatch の応答形式を検証する（ページ側プロトコルとの契約）
import test from 'node:test';
import assert from 'node:assert/strict';

// window/document のスタブ（respond.ts が参照する）
const listeners = [];
globalThis.window = {
  F3egclMessageEventListenerMac: (json) => listeners.push(json),
};

const { dispatchCommand } = await import('../src/bridge/dispatch.ts');

test('不明コマンドは無言で無視される', async () => {
  await dispatchCommand(['NoSuchCommand_xyz', 'uuid-1', 'a']);
  assert.equal(listeners.length, 0);
});

test('解決値（数値）は resolve に数値のまま入る', async () => {
  await dispatchCommand(['F3egclFileManageAppli_initAttachList', 'uuid-2']);
  assert.equal(listeners.length, 1);
  const msg = JSON.parse(listeners[0]);
  assert.equal(msg.uuid, 'uuid-2');
  assert.equal(msg.resolve, 1);
});

test('未実装コマンドは reject を返す', async () => {
  await dispatchCommand(['F3egclInitAppli_initAppli', 'uuid-3']);
  const msg = JSON.parse(listeners[listeners.length - 1]);
  assert.equal(msg.uuid, 'uuid-3');
  assert.match(msg.reject, /未実装/);
});

test('片道コマンド（CloseWindow）は応答を返さない', async () => {
  const before = listeners.length;
  // window.close をスタブ
  globalThis.window.close = () => {};
  await dispatchCommand(['CloseWindow']);
  assert.equal(listeners.length, before);
});
