# egov-bridge

**e-Gov電子申請をブラウザ（Chrome/Edge系）から直接操作するための実験的ブリッジ。
デジタル庁とは一切関係のない、非公式・無保証のツールです。**

## これは何か

e-Gov電子申請の公式アプリ（"e-Gov電子申請アプリケーション"）は WebView の薄い殻で、
申請フォーム本体は `https://shinsei.e-gov.go.jp/recept/` 上の Web アプリです。
この拡張は、ページがネイティブアプリに対して行っている `window.chrome.webview.postMessage`
呼び出しを横取りし、必要な応答をブラウザ側で実装することで、
**公式アプリ相当の振る舞いをブラウザ上で再現**しようとするものです。

現状: **スケルトン段階**。メッセージの観測（ログ）のみ実装済み。実際の送信操作は未実装です。

## 注意

- 非公式ツールです。e-Govの利用規約・仕様変更により予告なく動作しなくなります
- 申請データの送信は法的効果を持ちます。内容の最終確認は必ずご自身で行ってください
- 本拡張は認証情報を保存しません。e-Govへのログインは通常の e-Gov アカウント / GビズID で行います
- 解析メモは [docs/bridge-protocol.md](docs/bridge-protocol.md) を参照

## インストール（開発版）

1. このリポジトリを clone
2. Chrome で `chrome://extensions` を開き、右上の「デベロッパーモード」をON
3. 「パッケージ化されていない拡張機能を読み込む」でこのリポジトリのルートを選択
4. https://shinsei.e-gov.go.jp/recept/ にアクセス
5. 拡張の service worker のコンソール（chrome://extensions → この拡張の「Service worker」）で
   `chrome.storage.session.get('bridgeLog').then(console.log)` を実行すると、ページから届いたブリッジ要求を確認できます

## 構成

- `manifest.json` — MV3 マニフェスト
- `src/shim.js` — MAIN world で `window.chrome.webview` を差し替えるスタブ
- `src/bridge.js` — isolated world の中継役（ページ ⇔ service worker）
- `src/background.js` — service worker。現状はログ収集のみ（ハンドラ未実装）
- `docs/bridge-protocol.md` — ブリッジプロトコル解析ノート

## ライセンス

MIT License. 著作権表示は LICENSE を参照してください。
e-Govおよび e-Gov電子申請はデジタル庁の商標または名称であり、本プロジェクトは同庁の承認・後援を受けていません。
