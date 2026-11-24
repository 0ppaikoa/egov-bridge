// ポップアップのUI。診断情報の保存だけを担当する。
// ページの値は chrome.scripting.executeScript（MAIN world）で
// ページが公開している window.egovBridgeCollectDiagnostics を呼んで取得する。
//
// 権限: scripting（ページ関数の実行）, host_permissions（e-Govドメイン）
// ※ tabs 権限は不要（host_permissions の範囲で tab.url が読める）

interface DiagnosticsPayload {
  url: string;
  bridgeInstalled: boolean;
  commandLog: string[];
  [key: string]: unknown;
}

interface DiagnosticsError {
  error: string;
}

function isError(x: DiagnosticsPayload | DiagnosticsError): x is DiagnosticsError {
  return typeof (x as DiagnosticsError).error === 'string';
}

const statusEl = document.getElementById('status') as HTMLParagraphElement;
const button = document.getElementById('save-diagnostics') as HTMLButtonElement;
const noteEl = document.getElementById('note') as HTMLParagraphElement;

async function currentTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

async function collect(tabId: number): Promise<DiagnosticsPayload | { error: string }> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const w = window as unknown as { egovBridgeCollectDiagnostics?: () => unknown };
      if (typeof w.egovBridgeCollectDiagnostics !== 'function') {
        return { error: 'ブリッジがこのページに読み込まれていません' };
      }
      return w.egovBridgeCollectDiagnostics();
    },
  });
  const result = results[0]?.result as DiagnosticsPayload | { error: string } | undefined;
  return result ?? { error: '結果が空でした' };
}

function download(payload: unknown): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'egov-diagnostics.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function init(): Promise<void> {
  const tab = await currentTab();
  if (!tab?.id || !tab.url) {
    statusEl.textContent = '対象タブを取得できません';
    button.disabled = true;
    return;
  }
  const isEgov =
    /^https:\/\/(shinsei[-a-z0-9.]*\.e-gov\.go\.jp|account[-a-z0-9.]*\.e-gov\.go\.jp)\//.test(
      tab.url,
    );
  if (!isEgov) {
    statusEl.textContent = 'e-Gov のページではありません';
    button.disabled = true;
    noteEl.textContent = 'e-Gov の画面を開いた状態で使ってください。';
    return;
  }
  const payload = await collect(tab.id);
  if (isError(payload)) {
    statusEl.textContent = payload.error;
    button.disabled = true;
    return;
  }
  statusEl.textContent = `ブリッジ: ${payload.bridgeInstalled ? '動作中' : '未検出'} / 記録コマンド: ${payload.commandLog.length}件`;
  button.disabled = false;
  noteEl.textContent = '個人情報（入力値）は含まれません。タグ名・項目名・件数のみです。';

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const fresh = await collect(tab.id as number);
      if (isError(fresh)) {
        statusEl.textContent = fresh.error;
        return;
      }
      download(fresh);
      statusEl.textContent = 'egov-diagnostics.json を保存しました';
    } finally {
      button.disabled = false;
    }
  });
}

void init();
